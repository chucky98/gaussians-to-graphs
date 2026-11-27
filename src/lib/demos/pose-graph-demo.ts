/**
 * The model behind Post 27's PoseGraph2D widget: a synthetic Manhattan-world pose graph, optimized from its
 * dead-reckoning start by Gauss–Newton or Levenberg–Marquardt. `runPoseGraph` reports every iterate (positions,
 * cost, RMS error against the truth, time) and the sparsity of the problem. It runs in a Web Worker in the
 * widget (CLAUDE.md rule 5).
 */
import { buildPoseGraph, posesOf } from '../graph/pose-graph';
import { linearizeGraph, optimizeGraph } from '../graph/solver';
import { blockOrdering, factorNnz, nnz } from '../graph/sparse';
import { ordering } from '../graph/values';
import type * as se2 from '../geometry/se2';
import { MANHATTAN_DEFAULTS, manhattan, type ManhattanParams } from '../sim/manhattan';

export type PgPreset = 'default' | 'extreme';

export const PG = {
  /** Seed 18: the most typical of 20 (loop closures, dead-reckoning error, final error). */
  base: { ...MANHATTAN_DEFAULTS, seed: 18 } satisfies ManhattanParams,
  presets: { default: { sigmaTheta: 0.02 }, extreme: { sigmaTheta: 0.1 } } satisfies Record<
    PgPreset,
    { sigmaTheta: number }
  >,
  maxIterations: 40,
  poseChoices: [250, 500, 1000, 2000] as const,
} as const;

export interface PgRequest {
  poses: number;
  sigmaTheta: number;
  seed: number;
  method: 'gn' | 'lm';
  useLoops: boolean;
}

export const defaultRequest = (): PgRequest => ({
  poses: PG.base.poses,
  sigmaTheta: PG.presets.default.sigmaTheta,
  seed: PG.base.seed,
  method: 'lm',
  useLoops: true,
});

export interface PgIteration {
  /** Interleaved x, y of every pose. */
  xy: Float64Array;
  cost: number;
  rms: number;
  /** Milliseconds this iteration took. */
  ms: number;
}

export interface PgSetup {
  truth: Float64Array;
  /** Loop-closure pose pairs (i, j), interleaved. */
  loops: Int32Array;
  odometry: number;
  lambdaNnz: number;
  lambdaSize: number;
  /** Nonzeros of the Cholesky factor with the natural and the minimum-degree orderings. */
  fillNatural: number;
  fillMinDegree: number;
}

const flat = (p: readonly se2.Pose2[]) => Float64Array.from(p.flatMap((q) => [q.x, q.y]));
export function rmsError(xy: Float64Array, truth: Float64Array): number {
  let s = 0;
  for (let i = 0; i < xy.length; i++) s += (xy[i]! - truth[i]!) ** 2;
  return Math.sqrt(s / (xy.length / 2));
}

/** Generate, analyse and optimize; `onIteration` sees every iterate as soon as it is computed. */
export function runPoseGraph(
  req: PgRequest,
  onSetup?: (s: PgSetup) => void,
  onIteration?: (it: PgIteration, k: number) => void,
): { setup: PgSetup; iterations: PgIteration[] } {
  const d = manhattan({ ...PG.base, poses: req.poses, sigmaTheta: req.sigmaTheta, seed: req.seed });
  const g = buildPoseGraph(d.initial, d.odometry, d.loops, d.information, { useLoops: req.useLoops });
  const truth = flat(d.truth);
  const ord = ordering(g.initial);
  const sys = linearizeGraph(g.factors, g.initial, ord);
  const { perm } = blockOrdering(sys.varAdj, ord.dims);
  const setup: PgSetup = {
    truth,
    loops: Int32Array.from(req.useLoops ? d.loops.flatMap((e) => [e.i, e.j]) : []),
    odometry: d.odometry.length,
    lambdaNnz: nnz(sys.Lambda),
    lambdaSize: ord.dim,
    fillNatural: factorNnz(sys.Lambda),
    fillMinDegree: factorNnz(sys.Lambda, perm),
  };
  onSetup?.(setup);
  const iterations: PgIteration[] = [];
  let t = performance.now();
  optimizeGraph(g.factors, g.initial, {
    method: req.method,
    maxIterations: PG.maxIterations,
    onIteration: (it, k) => {
      const now = performance.now();
      const xy = flat(posesOf(it.values, req.poses));
      const item = { xy, cost: it.cost, rms: rmsError(xy, truth), ms: k === 0 ? 0 : now - t };
      t = now;
      iterations.push(item);
      onIteration?.(item, k);
    },
  });
  return { setup, iterations };
}
