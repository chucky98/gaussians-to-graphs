import { describe, expect, it } from 'vitest';
import { createRng } from '../../../src/lib/math/rng';
import { cholesky, fromArrays, maxAbsDiff, vec } from '../../../src/lib/math/matrix';
import { mean, sampleCov, variance } from '../../../src/lib/math/stats';

describe('rng (DESIGN §8.1)', () => {
  it('same seed gives the same sequence; different seeds differ', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const sa = Array.from({ length: 50 }, () => a.uniform());
    const sb = Array.from({ length: 50 }, () => b.uniform());
    const sc = Array.from({ length: 50 }, () => c.uniform());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    expect(sa.every((u) => u >= 0 && u < 1)).toBe(true);
  });

  it('uniform has mean ≈ 1/2 and variance ≈ 1/12', () => {
    const r = createRng(7);
    const xs = Float64Array.from({ length: 100_000 }, () => r.uniform());
    expect(Math.abs(mean(xs) - 0.5)).toBeLessThan(0.005);
    expect(Math.abs(variance(xs) - 1 / 12)).toBeLessThan(0.002);
  });

  it('normal(): sample mean and variance within tolerance for n = 1e5', () => {
    const r = createRng(1);
    const xs = Float64Array.from({ length: 100_000 }, () => r.normal());
    // Standard error of the mean is 1/√n ≈ 0.0032; of the variance ≈ √(2/n) ≈ 0.0045.
    expect(Math.abs(mean(xs))).toBeLessThan(0.015);
    expect(Math.abs(variance(xs) - 1)).toBeLessThan(0.02);
  });

  it('mvnormal reproduces the requested covariance', () => {
    const r = createRng(3);
    const cov = fromArrays([
      [4, 1.2],
      [1.2, 1],
    ]);
    const L = cholesky(cov);
    const m = vec([1, -2]);
    const xs = Array.from({ length: 100_000 }, () => r.mvnormal(m, L));
    const s = sampleCov(xs);
    expect(Math.abs(s.mean[0]! - 1)).toBeLessThan(0.03);
    expect(Math.abs(s.mean[1]! + 2)).toBeLessThan(0.02);
    expect(maxAbsDiff(s.cov, cov)).toBeLessThan(0.06);
  });

  it('choice and shuffle', () => {
    const r = createRng(9);
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const sh = r.shuffle(items);
    expect([...sh].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(items).toContain(r.choice(items));
    expect(() => r.choice([])).toThrow();
  });
});

import { nextSeed } from '../../../src/lib/math/rng';
describe('nextSeed', () => {
  it('is deterministic, in range, and does not repeat quickly', () => {
    expect(nextSeed(1)).toBe(nextSeed(1));
    const seen = new Set<number>();
    let s = 1;
    for (let i = 0; i < 1000; i++) {
      s = nextSeed(s);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(999_999);
      seen.add(s);
    }
    expect(seen.size).toBeGreaterThan(990);
  });
});
