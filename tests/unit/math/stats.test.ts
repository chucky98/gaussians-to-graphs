import { describe, expect, it } from 'vitest';
import {
  chi2Cdf,
  chi2Quantile,
  ess,
  histogram,
  logGamma,
  mean,
  normalCdf,
  normalQuantile,
  probWithinSigma,
  sampleCov,
  variance,
} from '../../../src/lib/math/stats';
import { toArrays, vec } from '../../../src/lib/math/matrix';

describe('special functions', () => {
  it('logGamma matches factorials and Γ(½) = √π', () => {
    expect(logGamma(1)).toBeCloseTo(0, 13);
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 12);
    expect(logGamma(0.5)).toBeCloseTo(0.5 * Math.log(Math.PI), 12);
    expect(logGamma(10.5)).toBeCloseTo(13.940625219403763, 10);
  });

  it('normal CDF and the 68–95–99.7 rule', () => {
    expect(normalCdf(0)).toBe(0.5);
    expect(normalCdf(1.959963984540054)).toBeCloseTo(0.975, 12);
    expect(normalCdf(-1)).toBeCloseTo(0.15865525393145707, 12);
    expect(probWithinSigma(1)).toBeCloseTo(0.6826894921370859, 12);
    expect(probWithinSigma(2)).toBeCloseTo(0.9544997361036416, 12);
    expect(probWithinSigma(3)).toBeCloseTo(0.9973002039367398, 12);
  });

  it('normalQuantile inverts normalCdf', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959963984540054, 10);
    for (const p of [1e-6, 0.01, 0.3, 0.5, 0.8, 0.999]) expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 12);
  });
});

describe('chi2Quantile (DESIGN §8.1)', () => {
  // Standard table values (e.g. NIST/SEMATECH e-Handbook, §1.3.6.7.4).
  const table: [number, number, number][] = [
    [0.95, 1, 3.841],
    [0.95, 2, 5.991],
    [0.95, 3, 7.815],
    [0.95, 4, 9.488],
    [0.95, 5, 11.07],
    [0.95, 6, 12.592],
    [0.99, 1, 6.635],
    [0.99, 2, 9.21],
    [0.99, 3, 11.345],
    [0.99, 4, 13.277],
    [0.99, 5, 15.086],
    [0.99, 6, 16.812],
    [0.9, 1, 2.706],
    [0.9, 2, 4.605],
    [0.9, 3, 6.251],
    [0.05, 1, 0.004],
    [0.05, 2, 0.103],
    [0.05, 3, 0.352],
    [0.95, 10, 18.307],
    [0.95, 20, 31.41],
    [0.95, 100, 124.342],
    [0.025, 100, 74.222],
    [0.975, 100, 129.561],
  ];
  it.each(table)('p=%f dof=%i ≈ %f', (p, dof, q) => {
    expect(Math.abs(chi2Quantile(p, dof) - q)).toBeLessThan(6e-4);
  });

  it('matches closed forms: dof 2 is −2 ln(1−p), dof 1 is Φ⁻¹((1+p)/2)²', () => {
    for (const p of [0.1, 0.5, 0.68, 0.9, 0.95, 0.99, 0.997]) {
      expect(chi2Quantile(p, 2)).toBeCloseTo(-2 * Math.log(1 - p), 12);
      expect(chi2Quantile(p, 1)).toBeCloseTo(normalQuantile((1 + p) / 2) ** 2, 9);
    }
  });

  it('is the inverse of the CDF for many dof', () => {
    for (const dof of [1, 3, 4, 7, 15, 50, 300])
      for (const p of [0.01, 0.25, 0.5, 0.95, 0.999]) expect(chi2Cdf(chi2Quantile(p, dof), dof)).toBeCloseTo(p, 10);
  });

  it('handles edge cases', () => {
    expect(chi2Quantile(0, 3)).toBe(0);
    expect(chi2Quantile(1, 3)).toBe(Infinity);
    expect(() => chi2Quantile(1.5, 2)).toThrow();
    expect(() => chi2Quantile(0.5, 0)).toThrow();
  });
});

describe('descriptive statistics', () => {
  it('mean, variance, sampleCov on a hand case', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(variance([1, 2, 3, 4])).toBeCloseTo(5 / 3, 14);
    expect(variance([1, 2, 3, 4], 0)).toBeCloseTo(1.25, 14);
    const s = sampleCov([vec([0, 0]), vec([2, 2]), vec([4, 1])]);
    expect(Array.from(s.mean)).toEqual([2, 1]);
    expect(toArrays(s.cov)).toEqual([
      [4, 1],
      [1, 1],
    ]);
  });

  it('histogram counts all in-range values', () => {
    const h = histogram([0, 0.1, 0.5, 0.99, 1, 2, -1], 2, 0, 1);
    expect(Array.from(h.counts)).toEqual([2, 3]);
    expect(Array.from(h.edges)).toEqual([0, 0.5, 1]);
  });

  it('ess: equal weights give N, one dominant weight gives 1', () => {
    expect(ess([1, 1, 1, 1])).toBeCloseTo(4, 14);
    expect(ess([0, 0, 5, 0])).toBeCloseTo(1, 14);
    expect(ess([0.25, 0.25, 0.5])).toBeCloseTo(1 / 0.375, 12);
  });
});
