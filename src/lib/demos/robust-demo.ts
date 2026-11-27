/**
 * The model behind Post 29's OutlierLoopClosures widget: Post 27's synthetic city (500 poses) with k false loop
 * closures added (claims that two distant places are the same), optimized with a chosen robust kernel or by
 * GNC. Reports every iterate and the final weight of every loop closure (accepted ≈ 1, rejected ≈ 0).
 */
import * as se2 from '../geometry/se2';
import type { Factor } from '../graph/factors';
import { buildPoseGraph, posesOf } from '../graph/pose-graph';
import { gnc, kernel, robustHooks, type KernelName } from '../graph/robust';
import { optimizeGraph, type GraphIterate } from '../graph/solver';
import type { Values } from '../graph/values';
import { createRng } from '../math/rng';
import { MANHATTAN_DEFAULTS, manhattan, type Edge } from '../sim/manhattan';

export type Method = KernelName | 'gnc';

export const ROBUST = {
  poses: 500,
  seed: 18,
  outlierSeed: 29,
  defaults: { outliers: 10, method: 'l2' as Method, k: 3 },
  maxOutliers: 60,
  maxIterations: 60,
  /** A closure counts as rejected when its final weight is below this: it then pulls with less than a tenth of its strength. */
  rejectBelow: 0.1,
} as const;

export interface RobustRequest {
  outliers: number;
  method: Method;
  k: number;
}

/** False loop closures between distant poses, each claiming they are the same place (with a random quarter turn). */
export function falseLoops(truth: readonly se2.Pose2[], count: number, seed: number = ROBUST.outlierSeed): Edge[] {
  const rng = createRng(seed);
  const out: Edge[] = [];
  const n = truth.length;
  // A fixed number of draws per candidate so that the first m outliers are the same for every count.
  while (out.length < count) {
    const [u, v, a, b, c] = [rng.uniform(), rng.uniform(), rng.normal(), rng.normal(), rng.uniform()];
    const i = Math.floor(u * n);
    const j = Math.floor(v * n);
    if (Math.abs(i - j) < 30) continue;
    const [p, q] = [truth[i]!, truth[j]!];
    if (Math.hypot(p.x - q.x, p.y - q.y) < 3) continue;
    out.push({
      i: Math.min(i, j),
      j: Math.max(i, j),
      z: se2.pose(0.1 * a, 0.1 * b, Math.floor(c * 4) * (Math.PI / 2)),
    });
  }
  return out;
}

export interface RobustIteration {
  xy: Float64Array;
  cost: number;
  rms: number;
}

export interface RobustResult {
  truth: Float64Array;
  /** Loop closures as (i, j) pairs: the true ones first, then the false ones. */
  loops: Int32Array;
  trueLoops: number;
  iterations: RobustIteration[];
  /** Final IRLS weight of every loop closure (same order as `loops`). */
  weights: Float64Array;
  /** False closures rejected (final weight below `ROBUST.rejectBelow`) and true closures rejected. */
  falseRejected: number;
  trueRejected: number;
}

const flat = (p: readonly se2.Pose2[]) => Float64Array.from(p.flatMap((q) => [q.x, q.y]));
function rms(xy: Float64Array, truth: Float64Array): number {
  let s = 0;
  for (let i = 0; i < xy.length; i++) s += (xy[i]! - truth[i]!) ** 2;
  return Math.sqrt(s / (xy.length / 2));
}

export function runRobust(req: RobustRequest, onIteration?: (it: RobustIteration, k: number) => void): RobustResult {
  const d = manhattan({ ...MANHATTAN_DEFAULTS, poses: ROBUST.poses, seed: ROBUST.seed });
  const fake = falseLoops(d.truth, req.outliers);
  const g = buildPoseGraph(d.initial, d.odometry, [...d.loops, ...fake], d.information);
  const truth = flat(d.truth);
  const isLoop = (f: Factor) => f.type === 'loop';
  const iterations: RobustIteration[] = [];
  let values: Values = g.initial;
  const record = (it: GraphIterate) => {
    values = it.values;
    const xy = flat(posesOf(it.values, ROBUST.poses));
    const item = { xy, cost: it.cost, rms: rms(xy, truth) };
    iterations.push(item);
    onIteration?.(item, iterations.length - 1);
  };
  if (req.method === 'gnc') gnc(g.factors, g.initial, req.k, isLoop, { onIteration: record });
  else
    optimizeGraph(g.factors, g.initial, {
      method: 'lm',
      maxIterations: ROBUST.maxIterations,
      ...robustHooks(kernel(req.method, req.k), isLoop),
      onIteration: record,
    });
  // Final weights with the kernel itself (for GNC: Geman–McClure at μ = 1).
  const ker = kernel(req.method === 'gnc' ? 'gm' : req.method, req.k);
  const loopFactors = g.factors.filter(isLoop);
  const weights = Float64Array.from(loopFactors, (f) => {
    const r = f.residual(values);
    let s = 0;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) s += r[a]! * f.information.data[a * 3 + b]! * r[b]!;
    return ker.weight(s);
  });
  const nTrue = d.loops.length;
  let falseRejected = 0;
  let trueRejected = 0;
  weights.forEach((w, i) => {
    if (w < ROBUST.rejectBelow) {
      if (i < nTrue) trueRejected++;
      else falseRejected++;
    }
  });
  return {
    truth,
    loops: Int32Array.from([...d.loops, ...fake].flatMap((e) => [e.i, e.j])),
    trueLoops: nTrue,
    iterations,
    weights,
    falseRejected,
    trueRejected,
  };
}
