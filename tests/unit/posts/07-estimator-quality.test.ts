/** Every concrete claim in post 07, checked against EstimatorShootout's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  SHOOTOUT as S,
  crlbStd,
  estimatesAt,
  makeDraws,
  precompute,
  rmseCurveFrom,
  summarize,
} from '../../../src/lib/demos/estimator-shootout';
import { fisherInfoLocation } from '../../../src/lib/math/estimators';
import { NOISE } from '../../../src/lib/demos/estimator-shootout';

const d = makeDraws(S.seed);
const open = precompute('open', d);
const urban = precompute('urban', d);
const idx = (m: number) => S.nValues.indexOf(m as (typeof S.nValues)[number]);
const f2 = (v: number) => v.toFixed(2);
const at = (pc: typeof open, m: number, k = S.kDefault) => {
  const e = estimatesAt(pc, idx(m), k);
  return { mean: summarize(e.mean), median: summarize(e.median), shrink: summarize(e.shrink) };
};

describe('post 07: setup', () => {
  it('2000 experiments, truth 0, guess 2 m, κ = 5, 10 fixes; urban = 10% at ±30 m, variance 98.1', () => {
    expect([S.trials, S.truth, S.guess, S.kDefault, S.nDefault]).toEqual([2000, 0, 2, 5, 10]);
    expect(NOISE.urban.density.variance).toBeCloseTo(98.1, 10);
    expect(Math.sqrt(98.1 / 10).toFixed(1)).toBe('3.1');
  });
});

describe('post 07: open sky', () => {
  it('m = 10: average unbiased, RMSE 0.95 = CRLB 3/√10; median 1.11; shrinkage bias 0.68, spread 0.63, RMSE 0.93', () => {
    const s = at(open, 10);
    expect(f2(s.mean.rmse)).toBe('0.95');
    expect(Math.abs(s.mean.bias)).toBeLessThan(0.05);
    expect(f2(crlbStd('open', 10))).toBe('0.95');
    expect((3 / Math.sqrt(10)).toFixed(2)).toBe('0.95');
    expect(f2(s.median.rmse)).toBe('1.11');
    expect([f2(s.shrink.bias), f2(s.shrink.std), f2(s.shrink.rmse)]).toEqual(['0.68', '0.63', '0.93']);
    expect(s.shrink.rmse).toBeLessThan(s.mean.rmse);
    expect(s.shrink.std).toBeLessThan(crlbStd('open', 10)); // a biased estimator below the bound
  });
  it('Try 1: average 2.98 → 0.30 from 1 to 100 fixes, within 5% of the CRLB at every m', () => {
    expect(f2(at(open, 1).mean.rmse)).toBe('2.98');
    expect(f2(at(open, 100).mean.rmse)).toBe('0.30');
    for (const p of rmseCurveFrom(open, S.kDefault)) expect(Math.abs(p.mean / p.crlb - 1)).toBeLessThan(0.05);
  });
  it('Try 2: shrinkage best at small m; from m = 20 on it merges with the average; break-even m = 22.5', () => {
    const c = rmseCurveFrom(open, S.kDefault);
    expect(c[0]!.shrink).toBeLessThan(Math.min(c[0]!.mean, c[0]!.median));
    for (const p of c) {
      if (p.n < 20) expect(p.shrink).toBeLessThan(p.mean);
      else expect(Math.abs(p.shrink / p.mean - 1)).toBeLessThan(0.005);
    }
    // MSE(shrink) = (m/(m+κ))²σ²/m + (κ·Δ/(m+κ))² equals σ²/m at m = κ(σ² … ) — solve numerically.
    const mse = (m: number) => (m / (m + 5)) ** 2 * (9 / m) + ((5 * 2) / (m + 5)) ** 2;
    expect(mse(22.5)).toBeCloseTo(9 / 22.5, 12);
    expect(mse(20)).toBeLessThan(9 / 20);
    expect(mse(25)).toBeGreaterThan(9 / 25);
  });
  it('Try 3: κ = 2 → 0.86; κ = 30 → 1.52, worse than average and median', () => {
    expect(f2(at(open, 10, 2).shrink.rmse)).toBe('0.86');
    const s30 = at(open, 10, 30);
    expect(f2(s30.shrink.rmse)).toBe('1.52');
    expect(s30.shrink.rmse).toBeGreaterThan(Math.max(s30.mean.rmse, s30.median.rmse));
  });
  it('Try 4: m = 100: median 0.37, average 0.30, variance ratio ≈ 0.65 ≈ 2/π', () => {
    const s = at(open, 100);
    expect([f2(s.median.rmse), f2(s.mean.rmse)]).toEqual(['0.37', '0.30']);
    expect(((s.mean.std / s.median.std) ** 2).toFixed(2)).toBe('0.65');
    expect((2 / Math.PI).toFixed(2)).toBe('0.64');
  });
});

describe('post 07: near buildings', () => {
  it('Fisher information much larger than 1/98.1', () => {
    expect(fisherInfoLocation(NOISE.urban.density)).toBeGreaterThan(5 / 98.1);
  });
  it('m = 10: average 3.16, median 1.27, CRLB 1.04', () => {
    const s = at(urban, 10);
    expect([f2(s.mean.rmse), f2(s.median.rmse), f2(crlbStd('urban', 10))]).toEqual(['3.16', '1.27', '1.04']);
  });
  it('m = 100: average about 1.0, median 0.41, CRLB 0.33', () => {
    const s = at(urban, 100);
    expect(s.mean.rmse.toFixed(1)).toBe('1.0');
    expect([f2(s.median.rmse), f2(crlbStd('urban', 100))]).toEqual(['0.41', '0.33']);
  });
  it('m = 1: average and median are the same number', () => {
    const e = estimatesAt(urban, idx(1), S.kDefault);
    expect(Array.from(e.mean)).toEqual(Array.from(e.median));
  });
});
