import { describe, expect, it } from 'vitest';
import {
  counts,
  effectiveSampleSize,
  normalizeLogWeights,
  resampleIndices,
  type ResamplingScheme,
} from '../../../src/lib/filters/pf';
import { run1 } from '../../../src/lib/filters/kf1d';
import { createRng } from '../../../src/lib/math/rng';

describe('particle filter building blocks (DESIGN §8.1)', () => {
  it('normalized weights sum to 1, even from extreme log-weights', () => {
    const { w, logSum } = normalizeLogWeights([-1000, -1001, -1002]);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 14);
    expect(w[0]! / w[1]!).toBeCloseTo(Math.E, 12);
    expect(logSum).toBeCloseTo(-1000 + Math.log(1 + Math.exp(-1) + Math.exp(-2)), 12);
    expect(() => normalizeLogWeights([-Infinity, -Infinity])).toThrow();
  });
  it('ESS is N for equal weights and 1 for a single particle', () => {
    expect(effectiveSampleSize(new Float64Array(10).fill(0.1))).toBeCloseTo(10, 12);
    expect(effectiveSampleSize([1, 0, 0])).toBe(1);
    expect(effectiveSampleSize([0.5, 0.5, 0, 0])).toBe(2);
  });
  it('systematic resampling draws each particle ⌊N wᵢ⌋ or ⌈N wᵢ⌉ times', () => {
    const rng = createRng(17);
    const raw = Array.from({ length: 50 }, () => rng.uniform() ** 3);
    const s = raw.reduce((a, b) => a + b, 0);
    const w = raw.map((v) => v / s);
    for (let t = 0; t < 20; t++) {
      const c = counts(resampleIndices(w, 'systematic', rng), 50);
      c.forEach((k, i) => {
        expect(k).toBeGreaterThanOrEqual(Math.floor(50 * w[i]!));
        expect(k).toBeLessThanOrEqual(Math.ceil(50 * w[i]!));
      });
    }
  });
  it('every scheme preserves the expected counts N wᵢ on average', () => {
    const w = [0.5, 0.3, 0.15, 0.05];
    for (const scheme of ['multinomial', 'stratified', 'systematic'] as ResamplingScheme[]) {
      const rng = createRng(3);
      const tot = [0, 0, 0, 0];
      const T = 4000;
      for (let t = 0; t < T; t++) counts(resampleIndices(w, scheme, rng, 20), 4).forEach((k, i) => (tot[i]! += k));
      tot.forEach((k, i) => expect(k / T / 20).toBeCloseTo(w[i]!, 2));
    }
  });
  it('on a 1D linear-Gaussian problem with N_p = 5,000 the PF mean is within tolerance of the KF', () => {
    const rng = createRng(1717);
    const Q = 0.04;
    const R = 0.25;
    const N = 5000;
    let x = 0.3;
    const zs: number[] = [];
    for (let k = 0; k < 25; k++) {
      x += 1 + Math.sqrt(Q) * rng.normal();
      zs.push(x + Math.sqrt(R) * rng.normal());
    }
    const kf = run1({ x: 0, P: 1 }, new Array(25).fill(1), zs, Q, R);
    let p = Float64Array.from({ length: N }, () => rng.normal());
    for (let k = 0; k < 25; k++) {
      p = p.map((v) => v + 1 + Math.sqrt(Q) * rng.normal());
      const { w } = normalizeLogWeights(p.map((v) => -((zs[k]! - v) ** 2) / (2 * R)));
      const mean = p.reduce((a, v, i) => a + w[i]! * v, 0);
      const sd = Math.sqrt(kf[k]!.post.P);
      expect(Math.abs(mean - kf[k]!.post.x)).toBeLessThan(0.1 * sd);
      const idx = resampleIndices(w, 'systematic', rng);
      p = Float64Array.from(idx, (i) => p[i]!);
    }
  });
});
