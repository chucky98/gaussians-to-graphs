/**
 * The model behind Post 30's IncrementalVsBatch widget: a pose graph that grows by one pose per step (odometry
 * to the previous pose, and a loop closure whenever the robot recognizes a place). With the poses eliminated in
 * the order they were created, the Cholesky factor of step t contains the factor of step t − 1 unchanged,
 * except for the columns of the **affected** variables: those touched by the new factors and all their ancestors
 * in the elimination tree. iSAM2 re-eliminates exactly that part (its Bayes tree is a clustered form of the same
 * tree). This model computes the affected set and compares the work of refactoring it with a full refactorization.
 *
 * Simplified compared with iSAM2 (stated in the post): no reordering of the affected part, no relinearization
 * (the linearization point is fixed), and work is counted, not timed: Σ c_j² over the refactored columns, with
 * c_j the number of nonzero blocks in column j of L (the cost of a column grows with its square).
 */
import { addTriplet, etree, factorPattern, toCsc, triplets, type Csc } from '../graph/sparse';
import { MANHATTAN_DEFAULTS, manhattan, type Edge, type PoseGraphData } from '../sim/manhattan';

export const INCR = { poses: 300, seed: 18 } as const;

export interface IncrementalStep {
  t: number;
  /** Poses whose columns of L must be recomputed at this step. */
  affected: number[];
  /** Work of refactoring the affected columns, and of refactoring everything. */
  incremental: number;
  batch: number;
  /** Loop closures that arrived at this step (to an older pose). */
  closures: number[];
}

export function incrementalData(): PoseGraphData {
  return manhattan({ ...MANHATTAN_DEFAULTS, poses: INCR.poses, seed: INCR.seed });
}

/** Block pattern of Λ for poses 0..t (natural order). */
export function patternAt(t: number, edges: readonly Edge[]): Csc {
  const tr = triplets(t + 1);
  for (let i = 0; i <= t; i++) addTriplet(tr, i, i, 1);
  for (const e of edges)
    if (e.j <= t) {
      addTriplet(tr, e.i, e.j, 1);
      addTriplet(tr, e.j, e.i, 1);
    }
  return toCsc(tr);
}

/** Nonzero blocks per column of L. */
export function columnCounts(a: Csc): Int32Array {
  const c = new Int32Array(a.n);
  for (const [, j] of factorPattern(a)) c[j]!++;
  return c;
}

/** Ancestors (inclusive) of the given nodes in the elimination tree. */
export function ancestors(parent: Int32Array, nodes: readonly number[]): number[] {
  const out = new Set<number>();
  for (let v of nodes) {
    while (v !== -1 && !out.has(v)) {
      out.add(v);
      v = parent[v]!;
    }
  }
  return [...out].sort((a, b) => a - b);
}

export function incrementalRun(d: PoseGraphData = incrementalData()): IncrementalStep[] {
  const edges = [...d.odometry, ...d.loops];
  const steps: IncrementalStep[] = [];
  for (let t = 1; t < d.truth.length; t++) {
    const a = patternAt(t, edges);
    const parent = etree(a);
    const touched = new Set<number>([t]);
    const closures: number[] = [];
    for (const e of edges)
      if (e.j === t) {
        touched.add(e.i);
        if (e.i !== t - 1) closures.push(e.i);
      }
    const affected = ancestors(parent, [...touched]);
    const counts = columnCounts(a);
    let batch = 0;
    for (const c of counts) batch += c * c;
    let incremental = 0;
    for (const j of affected) incremental += counts[j]! * counts[j]!;
    steps.push({ t, affected, incremental, batch, closures });
  }
  return steps;
}

export interface Totals {
  incremental: number;
  batch: number;
  /** Steps with a loop closure, and the largest affected set. */
  closureSteps: number;
  maxAffected: number;
  /** Median affected-set size over steps without a closure. */
  medianQuiet: number;
}

export function totals(steps: readonly IncrementalStep[]): Totals {
  const quiet = steps
    .filter((s) => s.closures.length === 0)
    .map((s) => s.affected.length)
    .sort((a, b) => a - b);
  return {
    incremental: steps.reduce((s, x) => s + x.incremental, 0),
    batch: steps.reduce((s, x) => s + x.batch, 0),
    closureSteps: steps.filter((s) => s.closures.length > 0).length,
    maxAffected: Math.max(...steps.map((s) => s.affected.length)),
    medianQuiet: quiet[Math.floor(quiet.length / 2)] ?? 0,
  };
}
