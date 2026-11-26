import { describe, expect, it } from 'vitest';
import * as m from '../../../src/lib/demos/estimator-shootout';

describe('estimator-shootout model', () => {
  it('draws are deterministic; fixes reuse the same draws across n and noise models', () => {
    const a = m.makeDraws(3);
    expect(m.makeDraws(3).z).toEqual(a.z);
    expect(Array.from(m.fixes('open', a, 5, 10).slice(0, 4))).toEqual(Array.from(m.fixes('open', a, 5, 4)));
    const o = m.fixes('open', a, 0, 100);
    const u = m.fixes('urban', a, 0, 100);
    o.forEach((v, i) => expect(u[i] === v || Math.abs(u[i]! / v - 10) < 1e-9).toBe(true));
  });
  it('precomputed estimates equal direct ones; histogram integrates to ≤ 1', () => {
    const d = m.makeDraws(4);
    const pc = m.precompute('urban', d);
    const i = m.SHOOTOUT.nValues.indexOf(7);
    const direct = m.estimates('urban', d, 7, 3);
    const fast = m.estimatesAt(pc, i, 3);
    expect(Array.from(fast.median)).toEqual(Array.from(direct.median));
    fast.shrink.forEach((v, t) => expect(v).toBeCloseTo(direct.shrink[t]!, 12));
    const h = m.estimateHistogram(fast.mean);
    const w = h.edges[1]! - h.edges[0]!;
    expect(h.density.reduce((s, v) => s + v * w, 0)).toBeLessThanOrEqual(1 + 1e-12);
    expect(m.rmseCurve('open', d, 0)).toHaveLength(m.SHOOTOUT.nValues.length);
  });
  it('summarize: RMSE² = bias² + spread² (equation 1)', () => {
    const s = m.summarize(Float64Array.of(1, 2, 3, 6));
    expect(s.rmse ** 2).toBeCloseTo(s.bias ** 2 + s.std ** 2, 12);
  });
});
