import { describe, expect, it } from 'vitest';
import * as g1 from '../../../src/lib/demos/gaussian-1d';
import * as ce from '../../../src/lib/demos/covariance-ellipse';
import { mahalanobis2 } from '../../../src/lib/math/gaussian';
import { maxAbsDiff, vec } from '../../../src/lib/math/matrix';
import { chi2Quantile } from '../../../src/lib/math/stats';

describe('gaussian-1d model', () => {
  it('bands are μ ± kσ with the standard probabilities', () => {
    const b = g1.bands(1, 2);
    expect(b.map((x) => [x.lo, x.hi])).toEqual([
      [-1, 3],
      [-3, 5],
      [-5, 7],
    ]);
    expect(b[1]!.prob).toBeCloseTo(0.9545, 4);
  });
  it('curve and area polygon', () => {
    const c = g1.curve(0, 1, -1, 1, 3);
    expect(c[1]).toEqual([0, g1.peak(1)]);
    const a = g1.areaPolygon(0, 1, -1, 1, 5);
    expect(a[0]).toEqual([-1, 0]);
    expect(a.at(-1)).toEqual([1, 0]);
    expect(a).toHaveLength(7);
  });
  it('handle mappings clamp to the slider ranges', () => {
    expect(g1.sigmaFromHandle(1.5, 0)).toBe(1.5);
    expect(g1.sigmaFromHandle(-1.5, 0)).toBe(1.5);
    expect(g1.sigmaFromHandle(0, 0)).toBe(g1.GAUSSIAN_1D_LIMITS.sigma.min);
    expect(g1.sigmaFromHandle(100, 0)).toBe(g1.GAUSSIAN_1D_LIMITS.sigma.max);
    expect(g1.muFromHandle(10)).toBe(3);
    expect(g1.clamp(5, 0, 1)).toBe(1);
  });
  it('the tallest allowed curve fits the plot', () => {
    expect(g1.peak(g1.GAUSSIAN_1D_LIMITS.sigma.min)).toBeLessThan(g1.GAUSSIAN_1D_LIMITS.yDomain[1]);
  });
});

describe('covariance-ellipse model', () => {
  it('paramsFromAxes inverts axesOf', () => {
    for (const p of [
      { sx: 2, sy: 1, rho: 0.6 },
      { sx: 0.5, sy: 2.5, rho: -0.3 },
      { sx: 1, sy: 1, rho: 0.9 },
    ]) {
      for (const level of [0.5, 0.95]) {
        const a = ce.axesOf(p, level);
        const q = ce.paramsFromAxes(a.theta, a.a, a.b, level);
        expect(q.sx).toBeCloseTo(p.sx, 12);
        expect(q.sy).toBeCloseTo(p.sy, 12);
        expect(q.rho).toBeCloseTo(p.rho, 12);
      }
    }
  });
  it('axis lengths are √(c λ)', () => {
    const a = ce.axesOf({ sx: 2, sy: 1, rho: 0 }, 0.95);
    const c = chi2Quantile(0.95, 2);
    expect(a.a).toBeCloseTo(2 * Math.sqrt(c), 12);
    expect(a.b).toBeCloseTo(Math.sqrt(c), 12);
  });
  it('transformed samples have Mahalanobis distance ‖z‖ (so the inside-count ignores Σ)', () => {
    const z = ce.standardSamples(5, 50);
    for (const p of [ce.COV_DEFAULTS.params, { sx: 0.3, sy: 2.9, rho: -0.9 }]) {
      const x = ce.transformSamples(z, p);
      for (let i = 0; i < 50; i++) {
        const d2 = mahalanobis2({ mean: vec([0, 0]), cov: ce.covOf(p) }, vec([x[2 * i]!, x[2 * i + 1]!]));
        expect(d2).toBeCloseTo(z[2 * i]! ** 2 + z[2 * i + 1]! ** 2, 9);
      }
    }
  });
  it('countInside counts prefixes and respects the level', () => {
    const z = Float64Array.of(0, 0, 3, 0, 1, 1);
    expect(ce.countInside(z, 3, 0.95)).toBe(2); // 9 > 5.99
    expect(ce.countInside(z, 1, 0.95)).toBe(1);
    expect(ce.countInside(z, 3, 0.999)).toBe(3);
  });
  it('clamps parameters and probes; massWithin', () => {
    expect(ce.clampParams({ sx: 10, sy: 0, rho: 1 })).toEqual({ sx: 3, sy: 0.25, rho: 0.95 });
    expect(ce.clampProbe([100, -100])).toEqual([7.8, -7.8]);
    expect(ce.massWithin(Math.sqrt(chi2Quantile(0.95, 2)))).toBeCloseTo(0.95, 12);
    expect(maxAbsDiff(ce.covOf({ sx: 1, sy: 1, rho: 0 }), ce.covOf({ sx: 1, sy: 1, rho: 0 }))).toBe(0);
  });
  it('level labels', () => {
    expect(ce.levelShort(0.95)).toBe('95%');
    expect(ce.levelShort(1 - Math.exp(-0.5))).toBe('39.3%');
    expect(ce.levelShort(0.8)).toBe('80.0%');
  });
});
