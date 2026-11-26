import { describe, expect, it } from 'vitest';
import {
  contaminatedNoise,
  crlb,
  fisherInfoLocation,
  gaussianNoise,
  sampleMean,
  sampleMedian,
  shrinkToward,
} from '../../../src/lib/math/estimators';
import { createRng } from '../../../src/lib/math/rng';
import { mean, variance } from '../../../src/lib/math/stats';

describe('estimators', () => {
  it('mean, median (odd/even, prefix) and shrinkage', () => {
    expect(sampleMean([1, 2, 3, 10])).toBe(4);
    expect(sampleMean([1, 2, 3, 10], 3)).toBe(2);
    expect(sampleMedian([5, 1, 3])).toBe(3);
    expect(sampleMedian([5, 1, 3, 100])).toBe(4);
    expect(sampleMedian([5, 1, 3, 100], 3)).toBe(3);
    expect(() => sampleMedian([], 0)).toThrow();
    expect(shrinkToward(4, 10, 2, 0)).toBe(4);
    expect(shrinkToward(4, 10, 2, 10)).toBe(3);
  });

  it('Fisher information of N(θ, σ²) is 1/σ², so the CRLB is σ²/n', () => {
    for (const s of [0.5, 3, 30]) {
      expect(fisherInfoLocation(gaussianNoise(s))).toBeCloseTo(1 / (s * s), 8);
      expect(crlb(gaussianNoise(s), 10)).toBeCloseTo((s * s) / 10, 6);
    }
  });

  it('a contaminated Gaussian carries more information than a Gaussian of the same variance', () => {
    const c = contaminatedNoise(3, 30, 0.1);
    expect(c.variance).toBeCloseTo(0.9 * 9 + 0.1 * 900, 12);
    expect(fisherInfoLocation(c)).toBeGreaterThan(1 / c.variance);
    // ...but less than if every observation were from the narrow component
    expect(fisherInfoLocation(c)).toBeLessThan(1 / 9);
  });

  it('Monte Carlo: Var(mean) = σ²/n meets the CRLB; Var(median) ≈ πσ²/(2n) for large n; shrink bias = k(g−θ)/(n+k)', () => {
    const rng = createRng(707);
    const n = 101;
    const M = 20000;
    const means: number[] = [];
    const meds: number[] = [];
    const xs = new Float64Array(n);
    for (let t = 0; t < M; t++) {
      for (let i = 0; i < n; i++) xs[i] = rng.normal();
      means.push(sampleMean(xs));
      meds.push(sampleMedian(xs));
    }
    expect(variance(means) * n).toBeCloseTo(1, 1);
    expect((variance(meds) * n) / (Math.PI / 2)).toBeGreaterThan(0.95);
    expect((variance(meds) * n) / (Math.PI / 2)).toBeLessThan(1.05);
    const shr = means.map((m) => shrinkToward(m, n, 2, 5));
    expect(mean(shr)).toBeCloseTo((5 * 2) / (n + 5), 2);
  });
});
