/** Every concrete claim in post 03, checked against SliceVsProject's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  SLICE_DEFAULTS as D,
  SLICE_LIMITS as L,
  conditionalY,
  information,
  joint,
  marginalY,
  meanLine,
} from '../../../src/lib/demos/slice-vs-project';
import { ellipsePoints } from '../../../src/lib/math/gaussian';
import { eigSym2, get } from '../../../src/lib/math/matrix';
import { DRIFT_DEFAULTS, simulate, spreadAt } from '../../../src/lib/demos/drift-fan';

describe('post 03: widget defaults', () => {
  it('σx = 1.5, σy = 1, zero mean, ρ = 0.7, slice at a = 1.5', () => {
    expect(D).toMatchObject({ sx: 1.5, sy: 1, rho: 0.7, a: 1.5, mean: [0, 0] });
  });
  it('conditional mean 0.70, variance 0.51; marginal variance 1; Ω_yy = 1.96 and 1/1.96 = 0.51', () => {
    const c = conditionalY(D.rho, D.a);
    expect(c.mean.toFixed(2)).toBe('0.70');
    expect((c.sd ** 2).toFixed(2)).toBe('0.51');
    expect((marginalY(D.rho).sd ** 2).toFixed(2)).toBe('1.00');
    const O = information(D.rho);
    expect(O.data[3]!.toFixed(2)).toBe('1.96');
    expect((1 / O.data[3]!).toFixed(2)).toBe('0.51');
  });
});

describe('post 03: Try this', () => {
  it('1: at a = −2 the mean is −0.93; the variance is 0.51 everywhere', () => {
    expect(conditionalY(D.rho, -2).mean.toFixed(2)).toBe('-0.93');
    for (const a of [L.a.min, -2, 0, 1.5, L.a.max]) expect((conditionalY(D.rho, a).sd ** 2).toFixed(2)).toBe('0.51');
  });
  it('2: ρ = 0 makes conditional and marginal identical for every a', () => {
    for (const a of [-3, 0, 2]) expect(conditionalY(0, a)).toEqual(marginalY(0));
  });
  it('3: ρ = 0.95 gives variance 0.0975 and a 95% interval of ±0.61; ρ = −0.7 gives mean −0.70', () => {
    const c = conditionalY(0.95, D.a);
    expect(c.sd ** 2).toBeCloseTo(0.0975, 12);
    expect((1.96 * c.sd).toFixed(2)).toBe('0.61');
    expect(conditionalY(-0.7, D.a).mean.toFixed(2)).toBe('-0.70');
    expect(0.95).toBeLessThanOrEqual(L.rho.max);
  });
  it('4: the mean line hits the ellipse where it is furthest left/right; slope 0.47 (25°) vs major axis 30°', () => {
    const g = joint(D.rho);
    const pts = ellipsePoints(g, 0.95, 20000);
    for (const pick of [Math.max, Math.min]) {
      const xs = pts.map((p) => p[0]);
      const ext = pts[xs.indexOf(pick(...xs))]!;
      expect(Math.abs(ext[1] - meanLine(D.rho, ext[0]))).toBeLessThan(2e-3);
    }
    const slope = meanLine(D.rho, 1) - meanLine(D.rho, 0);
    expect(slope.toFixed(2)).toBe('0.47');
    expect(Math.round((Math.atan(slope) * 180) / Math.PI)).toBe(25);
    const { vectors } = eigSym2(g.cov);
    const major = (Math.atan2(get(vectors, 1, 0), get(vectors, 0, 0)) * 180) / Math.PI;
    expect(Math.round(major)).toBe(30);
  });
});

describe('post 03: hook refers to post 01', () => {
  it("the 95% ellipse of post 01's runs at the end of the drive is clearly tilted", () => {
    const sim = simulate(DRIFT_DEFAULTS);
    const s = spreadAt(sim, sim.steps)!;
    const rho = s.cov.data[1]! / Math.sqrt(s.cov.data[0]! * s.cov.data[3]!);
    expect(Math.abs(rho)).toBeGreaterThan(0.3);
  });
});
