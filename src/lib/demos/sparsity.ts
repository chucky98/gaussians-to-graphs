/**
 * The models behind Post 28's widgets.
 *
 * SparsityExplorer: the information matrix Λ of a 120-pose Manhattan pose graph, at the level of pose blocks
 * (one row and column per pose), reordered by four orderings, with the pattern of its Cholesky factor and the
 * fill each ordering causes.
 *
 * MarginalizationFill: a 12-pose loop with three loop closures; marginalizing any set of poses replaces them
 * by a dense factor (the Schur complement) among the poses they were connected to.
 */
import * as se2 from '../geometry/se2';
import { buildPoseGraph, poseKey } from '../graph/pose-graph';
import { linearizeGraph } from '../graph/solver';
import { marginalize } from '../graph/marginalize';
import {
  addTriplet,
  adjacency,
  factorNnz,
  factorPattern,
  minimumDegree,
  nnz,
  permute,
  reverseCuthillMcKee,
  spyPattern,
  toCsc,
  toDense,
  triplets,
  type Csc,
} from '../graph/sparse';
import { ordering } from '../graph/values';
import { diag, type Mat } from '../math/matrix';
import { createRng } from '../math/rng';
import { MANHATTAN_DEFAULTS, manhattan } from '../sim/manhattan';

// ---------------------------------------------------------------- SparsityExplorer

export type OrderingKind = 'natural' | 'random' | 'rcm' | 'mindegree';

export const SPARSE = { poses: 120, seed: 18, randomSeed: 28 } as const;

/** Block pattern of Λ: one entry per pair of poses that share a factor (and the diagonal). */
export function blockPattern(poses: number = SPARSE.poses, seed: number = SPARSE.seed): Csc {
  const d = manhattan({ ...MANHATTAN_DEFAULTS, poses, seed });
  const t = triplets(poses);
  for (let i = 0; i < poses; i++) addTriplet(t, i, i, 1);
  for (const e of [...d.odometry, ...d.loops]) {
    addTriplet(t, e.i, e.j, 1);
    addTriplet(t, e.j, e.i, 1);
  }
  return toCsc(t);
}

export function orderingOf(a: Csc, kind: OrderingKind): Int32Array {
  switch (kind) {
    case 'natural':
      return Int32Array.from({ length: a.n }, (_, i) => i);
    case 'random': {
      const rng = createRng(SPARSE.randomSeed);
      const p = Array.from({ length: a.n }, (_, i) => i);
      for (let i = a.n - 1; i > 0; i--) {
        const j = Math.floor(rng.uniform() * (i + 1));
        [p[i], p[j]] = [p[j]!, p[i]!];
      }
      return Int32Array.from(p);
    }
    case 'rcm':
      return reverseCuthillMcKee(adjacency(a));
    case 'mindegree':
      return minimumDegree(adjacency(a));
  }
}

export interface OrderingView {
  /** Pattern of P Λ Pᵀ and of its Cholesky factor L (block level: one cell per pose pair). */
  lambda: [number, number][];
  factor: [number, number][];
  /** Nonzero blocks of Λ (full) and of L (lower triangle with diagonal); 3 × 3 = 9 numbers each. */
  lambdaBlocks: number;
  factorBlocks: number;
  /** Fill: blocks of L that are zero in the lower triangle of Λ. */
  fill: number;
}

export function orderingView(a: Csc, kind: OrderingKind): OrderingView {
  const perm = orderingOf(a, kind);
  const pa = permute(a, perm);
  const lower = (nnz(a) + a.n) / 2;
  const factorBlocks = factorNnz(a, perm);
  return {
    lambda: spyPattern(pa),
    factor: factorPattern(a, perm),
    lambdaBlocks: nnz(a),
    factorBlocks,
    fill: factorBlocks - lower,
  };
}

// ---------------------------------------------------------------- MarginalizationFill

export const MARG = {
  /** Twelve poses around a 4 × 2 rectangle (anticlockwise), loop closures between 0–11, 2–9 and 4–7. */
  poses: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
    [4, 1],
    [4, 2],
    [3, 2],
    [2, 2],
    [1, 2],
    [0, 2],
    [0, 1],
  ] as [number, number][],
  loops: [
    [0, 11],
    [2, 9],
    [4, 7],
  ] as [number, number][],
} as const;

export const margEdges = (): [number, number][] => [
  ...MARG.poses.slice(1).map((_, i) => [i, i + 1] as [number, number]),
  ...MARG.loops.map((l) => [l[0], l[1]] as [number, number]),
];

/** Λ of the small loop at the true poses (3 × 3 blocks), with a prior on pose 0. */
export function margLambda(): { Lambda: Mat; eta: Float64Array } {
  const truth = MARG.poses.map((p, i) => {
    const next = MARG.poses[(i + 1) % MARG.poses.length]!;
    return se2.pose(p[0], p[1], Math.atan2(next[1] - p[1], next[0] - p[0]));
  });
  const edges = margEdges().map(([i, j]) => ({ i, j, z: se2.between(truth[i]!, truth[j]!) }));
  const g = buildPoseGraph(truth, edges, [], diag([100, 100, 400]));
  const sys = linearizeGraph(
    g.factors,
    g.initial,
    ordering(
      g.initial,
      truth.map((_, i) => poseKey(i)),
    ),
  );
  const n = sys.Lambda.n;
  return { Lambda: { rows: n, cols: n, data: toDense(sys.Lambda) }, eta: sys.eta };
}

export interface MargView {
  kept: number[];
  /** Pairs of kept poses (a < b) whose block of the remaining information matrix is nonzero. */
  pairs: [number, number][];
  /** Pairs that are nonzero now but did not share a factor before: fill from marginalization. */
  induced: [number, number][];
  /** Nonzero blocks (both triangles and diagonal) of the remaining matrix, of kept². */
  blocks: number;
}

export function marginalizeView(removed: readonly number[]): MargView {
  const { Lambda, eta } = margLambda();
  const n = MARG.poses.length;
  const kept = Array.from({ length: n }, (_, i) => i).filter((i) => !removed.includes(i));
  const idx = kept.flatMap((p) => [3 * p, 3 * p + 1, 3 * p + 2]);
  const m = marginalize(Lambda, eta, idx);
  const k = kept.length;
  const original = new Set(margEdges().map(([a, b]) => `${Math.min(a, b)},${Math.max(a, b)}`));
  const pairs: [number, number][] = [];
  let blocks = k;
  for (let a = 0; a < k; a++)
    for (let b = a + 1; b < k; b++) {
      let mx = 0;
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) mx = Math.max(mx, Math.abs(m.Lambda.data[(3 * a + i) * 3 * k + 3 * b + j]!));
      if (mx > 1e-9) {
        pairs.push([kept[a]!, kept[b]!]);
        blocks += 2;
      }
    }
  const induced = pairs.filter(([a, b]) => !original.has(`${a},${b}`));
  return { kept, pairs, induced, blocks };
}
