import { describe, expect, it } from 'vitest';
import * as m from '../../../src/lib/demos/slice-vs-project';
import { pdf1 } from '../../../src/lib/math/gaussian';

describe('slice-vs-project model', () => {
  it('conditional matches the 2D closed form for many (ρ, a)', () => {
    const { sx, sy } = m.SLICE_DEFAULTS;
    for (const rho of [-0.9, -0.3, 0, 0.5, 0.95])
      for (const a of [-3, 0, 1.7]) {
        const c = m.conditionalY(rho, a);
        expect(c.mean).toBeCloseTo(((rho * sy) / sx) * a, 12);
        expect(c.sd).toBeCloseTo(sy * Math.sqrt(1 - rho * rho), 12);
        expect(m.meanLine(rho, a)).toBeCloseTo(c.mean, 12);
      }
  });
  it('the renormalized slice of the joint is the conditional density', () => {
    const rho = 0.6;
    const a = 1.2;
    const c = m.conditionalY(rho, a);
    // ∫ p(a, y) dy = p_x(a)
    let area = 0;
    const h = 0.001;
    for (let y = -8; y < 8; y += h) area += h * m.sliceDensity(rho, a, y);
    expect(area).toBeCloseTo(pdf1(a, 0, m.SLICE_DEFAULTS.sx), 6);
    for (const y of [-1, 0.3, 2]) expect(m.sliceDensity(rho, a, y) / area).toBeCloseTo(pdf1(y, c.mean, c.sd), 6);
  });
  it('marginal ignores ρ; information matrix; grid; clamp', () => {
    expect(m.marginalY(0.9)).toEqual({ mean: 0, sd: 1 });
    const O = m.information(0.7);
    expect(1 / O.data[3]!).toBeCloseTo(m.conditionalY(0.7, 0).sd ** 2, 12);
    const g = m.densityGrid(0.7, 10, 7);
    expect(g).toHaveLength(70);
    expect(Math.max(...g)).toBeGreaterThan(0);
    expect(m.clamp(9, 0, 1)).toBe(1);
  });
  it('the tallest conditional curve fits the side plot', () => {
    expect(pdf1(0, 0, m.conditionalY(m.SLICE_LIMITS.rho.max, 0).sd)).toBeLessThan(m.SLICE_LIMITS.densityMax);
  });
});
