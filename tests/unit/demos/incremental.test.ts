/**
 * Post 30's central claim: with natural ordering, the Cholesky factor of step t equals that of step t − 1 in
 * every column outside the affected set (the touched variables and their elimination-tree ancestors), so
 * refactoring only those columns gives exactly the batch factor (for a fixed linearization point).
 */
import { describe, expect, it } from 'vitest';
import { ancestors, incrementalData, incrementalRun, patternAt, totals } from '../../../src/lib/demos/incremental';
import { buildPoseGraph, poseKey } from '../../../src/lib/graph/pose-graph';
import { linearizeGraph } from '../../../src/lib/graph/solver';
import { cholesky, etree, toDense } from '../../../src/lib/graph/sparse';
import { ordering } from '../../../src/lib/graph/values';

const d = incrementalData();

/** Numeric factor of the pose graph with poses 0..t, linearized at the truth, natural order (3 × 3 blocks). */
function factorAt(t: number): Float64Array {
  const odo = d.odometry.filter((e) => e.j <= t);
  const loops = d.loops.filter((e) => e.j <= t);
  const g = buildPoseGraph(d.truth.slice(0, t + 1), odo, loops, d.information);
  const sys = linearizeGraph(
    g.factors,
    g.initial,
    ordering(
      g.initial,
      d.truth.slice(0, t + 1).map((_, i) => poseKey(i)),
    ),
  );
  return toDense(cholesky(sys.Lambda).L);
}

describe('incremental factorization', () => {
  it('columns outside the affected set are unchanged from one step to the next (incl. loop closures)', () => {
    const steps = incrementalRun();
    const closure = steps.find((s) => s.closures.length > 0)!;
    for (const t of [5, closure.t - 1, closure.t, closure.t + 3]) {
      const step = steps[t - 1]!;
      const prev = factorAt(t - 1);
      const cur = factorAt(t);
      const n0 = 3 * t; // size before the new pose
      const n1 = 3 * (t + 1);
      const affected = new Set(step.affected);
      for (let pose = 0; pose < t; pose++) {
        if (affected.has(pose)) continue;
        for (let c = 3 * pose; c < 3 * pose + 3; c++)
          for (let r = 0; r < n0; r++) expect(cur[r * n1 + c]).toBeCloseTo(prev[r * n0 + c]!, 9);
      }
      expect(affected.has(t)).toBe(true);
    }
  });
  it('the affected set is the union of elimination-tree paths from the touched variables to the root', () => {
    const edges = [...d.odometry, ...d.loops];
    const a = patternAt(40, edges);
    const parent = etree(a);
    expect(ancestors(parent, [40])).toEqual([40]);
    const anc = ancestors(parent, [3]);
    expect(anc[0]).toBe(3);
    expect(anc.at(-1)).toBe(40);
    for (let i = 0; i + 1 < anc.length; i++) expect(parent[anc[i]!]).toBe(anc[i + 1]);
  });
  it('totals add up', () => {
    const s = incrementalRun();
    const t = totals(s);
    expect(t.incremental).toBe(s.reduce((x, y) => x + y.incremental, 0));
    expect(t.incremental).toBeLessThan(t.batch);
  });
});
