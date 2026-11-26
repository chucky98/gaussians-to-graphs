/** Every concrete claim in post 09, checked against CostLandscape's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  LANDSCAPE as L,
  PRESETS,
  TAG,
  bestSolution,
  iterationsTo,
  path,
  problemFor,
  ranges,
  runBoth,
} from '../../../src/lib/demos/cost-landscape';
import { cost, normalSystem } from '../../../src/lib/graph/solver';
import { inverse, vec } from '../../../src/lib/math/matrix';

const f2 = (v: number) => v.toFixed(2);
const pos = (x: Float64Array) => [f2(x[0]!), f2(x[1]!)];

describe('post 09: corner anchors', () => {
  const best = bestSolution('corners');
  it('σ = 10 cm; ranges 7.19, 4.55, 6.30, 8.10; start (1.5, 6.5)', () => {
    expect(L.sigma).toBe(0.1);
    expect(ranges(PRESETS.corners.anchors).map(f2)).toEqual(['7.19', '4.55', '6.30', '8.10']);
    expect(PRESETS.corners.start).toEqual([1.5, 6.5]);
  });
  it('both solvers reach (6.45, 2.92), cost 1.77, in two iterations; 9.5 cm from the tag', () => {
    const r = runBoth('corners', PRESETS.corners.start, L.logLambda.default);
    for (const its of [r.gn, r.lm]) {
      expect(pos(its.at(-1)!.x)).toEqual(['6.45', '2.92']);
      expect(f2(its.at(-1)!.cost)).toBe('1.77');
      expect(iterationsTo(its, best.x)).toBe(2);
    }
    expect((100 * Math.hypot(best.x[0]! - TAG[0], best.x[1]! - TAG[1])).toFixed(1)).toBe('9.5');
  });
  it('Λ⁻¹ at the solution: 6.5 cm east, 7.9 cm north', () => {
    const C = inverse(normalSystem(problemFor('corners'), best.x).Lambda, { spd: true });
    expect([(100 * Math.sqrt(C.data[0]!)).toFixed(1), (100 * Math.sqrt(C.data[3]!)).toFixed(1)]).toEqual([
      '6.5',
      '7.9',
    ]);
  });
  it('Try 1: from every start on a 0.5 m grid over the map, both solvers reach the solution', () => {
    for (let x = L.xDomain[0] + 0.5; x < L.xDomain[1]; x += 0.5)
      for (let y = L.yDomain[0] + 0.5; y < L.yDomain[1]; y += 0.5) {
        const r = runBoth('corners', [x, y], L.logLambda.default);
        for (const its of [r.gn, r.lm])
          expect(Math.hypot(its.at(-1)!.x[0]! - best.x[0]!, its.at(-1)!.x[1]! - best.x[1]!)).toBeLessThan(0.01);
      }
  });
  it('Try 3: λ₀ = 10² → LM needs five iterations', () => {
    expect(iterationsTo(runBoth('corners', PRESETS.corners.start, 2).lm, best.x)).toBe(5);
  });
});

describe('post 09: wall anchors', () => {
  it('Try 4: from (3, −2) both converge to the mirror (6.39, −3.09), with the same cost 0.88 as (6.39, 3.09)', () => {
    const r = runBoth('wall', PRESETS.wall.start, L.logLambda.default);
    for (const its of [r.gn, r.lm]) expect(pos(its.at(-1)!.x)).toEqual(['6.39', '-3.09']);
    const p = problemFor('wall');
    const m = r.lm.at(-1)!.x;
    expect(f2(cost(p, m))).toBe('0.88');
    expect(cost(p, vec([m[0]!, -m[1]!]))).toBeCloseTo(cost(p, m), 9);
  });
  it('east std 8.8 cm with wall anchors', () => {
    const b = bestSolution('wall');
    const C = inverse(normalSystem(problemFor('wall'), b.x).Lambda, { spd: true });
    expect((100 * Math.sqrt(C.data[0]!)).toFixed(1)).toBe('8.8');
  });
  it('diverge preset: start (−4, −0.5); GN first step ~164 m south; cost 5.7e3 → 9.4e11 after 15 iterations', () => {
    expect(PRESETS['wall-diverge'].start).toEqual([-4, -0.5]);
    const r = runBoth('wall-diverge', PRESETS['wall-diverge'].start, L.logLambda.default);
    const s1 = r.gn[1]!.x;
    expect(Math.round(-0.5 - s1[1]!)).toBe(164);
    expect(Math.abs(s1[1]! + 0.5)).toBeGreaterThan(8 * Math.abs(s1[0]! + 4));
    expect(r.gn).toHaveLength(L.maxIterations + 1);
    expect(r.gn[0]!.cost.toExponential(1)).toBe('5.7e+3');
    expect(r.gn.at(-1)!.cost.toExponential(1)).toBe('9.4e+11');
  });
  it('LM rejects seven trial steps and reaches (6.39, 3.09); with λ₀ = 10² it has not arrived after 15', () => {
    const r = runBoth('wall-diverge', PRESETS['wall-diverge'].start, L.logLambda.default);
    expect(r.lm.filter((i) => !i.accepted)).toHaveLength(7);
    expect(pos(r.lm.at(-1)!.x)).toEqual(['6.39', '3.09']);
    const slow = runBoth('wall-diverge', PRESETS['wall-diverge'].start, 2).lm.at(-1)!;
    expect(Math.hypot(slow.x[0]! - 6.39, slow.x[1]! - 3.09)).toBeGreaterThan(1);
    expect(path(r.lm).length).toBeLessThan(r.lm.length);
  });
});
