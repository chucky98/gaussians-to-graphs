/**
 * Every concrete claim in post 02 about its widgets or its key identities,
 * checked against the widgets' default parameters (CLAUDE.md rules 13 and 14).
 */
import { describe, expect, it } from 'vitest';
import { GAUSSIAN_1D_DEFAULTS, GAUSSIAN_1D_LIMITS, peak } from '../../../src/lib/demos/gaussian-1d';
import {
  COV_DEFAULTS as D,
  COV_LIMITS,
  LEVEL_OPTIONS,
  axesOf,
  countInside,
  covOf,
  probeInfo,
  standardSamples,
} from '../../../src/lib/demos/covariance-ellipse';
import { pdf1 } from '../../../src/lib/math/gaussian';
import { det } from '../../../src/lib/math/matrix';
import { chi2Quantile, probWithinSigma } from '../../../src/lib/math/stats';

const deg = (r: number) => (r * 180) / Math.PI;

describe('post 02: 1D Gaussian claims', () => {
  it('68.27 / 95.45 / 99.73 rule', () => {
    expect((100 * probWithinSigma(1)).toFixed(2)).toBe('68.27');
    expect((100 * probWithinSigma(2)).toFixed(2)).toBe('95.45');
    expect((100 * probWithinSigma(3)).toFixed(2)).toBe('99.73');
  });

  it('the band probabilities do not depend on μ or σ (numerical integration)', () => {
    for (const [mu, s] of [
      [0, 1],
      [2.3, 0.4],
      [-3, 2.5],
    ] as const) {
      for (const k of [1, 2, 3]) {
        let area = 0;
        const n = 20000;
        const h = (2 * k * s) / n;
        for (let i = 0; i < n; i++) area += h * pdf1(mu - k * s + (i + 0.5) * h, mu, s);
        expect(area).toBeCloseTo(probWithinSigma(k), 7);
      }
    }
  });

  it('peak height 1/(σ√2π): 0.399 at σ = 1 (default) and 0.199 at σ = 2', () => {
    expect(GAUSSIAN_1D_DEFAULTS.sigma).toBe(1);
    expect(peak(1).toFixed(3)).toBe('0.399');
    expect(peak(2).toFixed(3)).toBe('0.199');
    expect(2).toBeGreaterThanOrEqual(GAUSSIAN_1D_LIMITS.sigma.min);
    expect(2).toBeLessThanOrEqual(GAUSSIAN_1D_LIMITS.sigma.max);
  });

  it('inflection points are at μ ± σ (second derivative changes sign there)', () => {
    const mu = 0.7;
    const s = 1.3;
    const d2 = (x: number, h = 1e-4) => (pdf1(x + h, mu, s) - 2 * pdf1(x, mu, s) + pdf1(x - h, mu, s)) / (h * h);
    for (const x of [mu + s, mu - s]) {
      expect(Math.abs(d2(x))).toBeLessThan(1e-6);
      expect(Math.sign(d2(x - 0.05))).not.toBe(Math.sign(d2(x + 0.05)));
    }
  });
});

describe('post 02: covariance ellipse claims (default parameters)', () => {
  const p = D.params;

  it('defaults are σx = 2, σy = 1, ρ = 0.6, 1000 samples, 95%', () => {
    expect(p).toEqual({ sx: 2, sy: 1, rho: 0.6 });
    expect(D.n).toBe(1000);
    expect(D.level).toBe(0.95);
  });

  it('eigenvalues ≈ 4.42 and 0.58; tilt ≈ 19°, matching tan 2θ = 2ρσxσy/(σx² − σy²)', () => {
    const a = axesOf(p, 0.95);
    expect(a.l1.toFixed(2)).toBe('4.42');
    expect(a.l2.toFixed(2)).toBe('0.58');
    expect(Math.round(deg(a.theta))).toBe(19);
    expect(Math.tan(2 * a.theta)).toBeCloseTo((2 * p.rho * p.sx * p.sy) / (p.sx ** 2 - p.sy ** 2), 12);
  });

  it('945 of 1000 default samples inside the 95% ellipse; 4729 of 5000 (94.6%)', () => {
    expect(countInside(standardSamples(D.seed, 1000), 1000, 0.95)).toBe(945);
    const c5 = countInside(standardSamples(D.seed, 5000), 5000, 0.95);
    expect(c5).toBe(4729);
    expect(((100 * c5) / 5000).toFixed(1)).toBe('94.6');
  });

  it('Try 1: ρ = 0 gives eigenvalues exactly 4 and 1, axis-aligned', () => {
    const a = axesOf({ ...p, rho: 0 }, 0.95);
    expect(a.l1).toBe(4);
    expect(a.l2).toBe(1);
    expect(a.theta).toBe(0);
  });

  it('Try 2: ρ = −0.6 tilts by the same 19°, the other way', () => {
    expect(Math.round(deg(axesOf({ ...p, rho: -0.6 }, 0.95).theta))).toBe(-19);
  });

  it('Try 3: σx = σy = 1, ρ = 0.9 lies at 45° with λ = 1.9 and 0.1 (all reachable on the sliders)', () => {
    const a = axesOf({ sx: 1, sy: 1, rho: 0.9 }, 0.95);
    expect(deg(a.theta)).toBeCloseTo(45, 10);
    expect(a.l1).toBeCloseTo(1.9, 12);
    expect(a.l2).toBeCloseTo(0.1, 12);
    expect(0.9).toBeLessThanOrEqual(COV_LIMITS.rho.max);
    expect(1).toBeGreaterThanOrEqual(COV_LIMITS.sigma.min);
  });

  it('Try 4: the 39.3% option holds 399 of 1000 samples, whatever Σ', () => {
    const opt = LEVEL_OPTIONS.find((o) => o.short === '39.3%')!;
    expect(opt.value).toBeCloseTo(1 - Math.exp(-0.5), 15);
    expect(chi2Quantile(opt.value, 2)).toBeCloseTo(1, 12); // the d_M = 1 ellipse
    expect(countInside(standardSamples(D.seed, 1000), 1000, opt.value)).toBe(399);
    // countInside uses only z, so it cannot depend on Σ (see demos.test.ts for the d_M = ‖z‖ identity).
  });

  it('ρ is capped at ±0.95, where det Σ = σx²σy²(1 − ρ²) is still positive', () => {
    expect(COV_LIMITS.rho.max).toBe(0.95);
    expect(det(covOf({ sx: 2, sy: 1, rho: 0.95 }))).toBeCloseTo(4 * (1 - 0.95 ** 2), 12);
  });
});

describe('post 02: Mahalanobis preset claims', () => {
  it('A = (3, 0) and B = (0, 3) are both 3 from the centre; d_M = 1.87 (inside 95%) and 3.75 (outside)', () => {
    expect(D.probes).toEqual([
      [3, 0],
      [0, 3],
    ]);
    const [a, b] = D.probes.map((q) => probeInfo(q, D.params, 0.95));
    expect(a!.euclid.toFixed(2)).toBe('3.00');
    expect(b!.euclid.toFixed(2)).toBe('3.00');
    expect(a!.dM.toFixed(2)).toBe('1.87');
    expect(b!.dM.toFixed(2)).toBe('3.75');
    expect(a!.inside).toBe(true);
    expect(b!.inside).toBe(false);
  });

  it('with ρ = 0 the distances become 3/σx = 1.5 and 3/σy = 3', () => {
    const [a, b] = D.probes.map((q) => probeInfo(q, { ...D.params, rho: 0 }, 0.95));
    expect(a!.dM).toBeCloseTo(1.5, 12);
    expect(b!.dM).toBeCloseTo(3, 12);
  });
});

describe('post 02: confidence-region identities', () => {
  it('χ²₂(0.95) = −2 ln 0.05 ≈ 5.991, √ ≈ 2.45; table for n = 1, 2, 3', () => {
    expect(chi2Quantile(0.95, 2)).toBeCloseTo(-2 * Math.log(0.05), 12);
    expect(chi2Quantile(0.95, 1).toFixed(3)).toBe('3.841');
    expect(chi2Quantile(0.95, 2).toFixed(3)).toBe('5.991');
    expect(chi2Quantile(0.95, 3).toFixed(3)).toBe('7.815');
    expect(Math.sqrt(chi2Quantile(0.95, 1)).toFixed(2)).toBe('1.96');
    expect(Math.sqrt(chi2Quantile(0.95, 2)).toFixed(2)).toBe('2.45');
    expect(Math.sqrt(chi2Quantile(0.95, 3)).toFixed(2)).toBe('2.80');
  });

  it('the 2D "1σ" ellipse holds 39.3%, the "2σ" ellipse 86.5%', () => {
    expect((100 * (1 - Math.exp(-0.5))).toFixed(1)).toBe('39.3');
    expect((100 * (1 - Math.exp(-2))).toFixed(1)).toBe('86.5');
  });
});
