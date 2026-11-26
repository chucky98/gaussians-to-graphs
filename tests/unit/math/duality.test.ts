import { describe, expect, it } from 'vitest';
import {
  condition,
  conditionInformation,
  fromInformation,
  marginalize,
  marginalizeInformation,
  toInformation,
} from '../../../src/lib/math/gaussian';
import { inverse, maxAbsDiff, schurComplement, select, fromArrays, vec } from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';
import { randomSPD } from '../helpers';

const rng = createRng(303);

describe('Schur complement and the covariance/information duality (DESIGN §8.1 marginalize)', () => {
  it('schurComplement on a hand case and with nothing dropped', () => {
    // [[4,2],[2,3]] keeping 0: 4 − 2·2/3 = 8/3
    const s = schurComplement(
      fromArrays([
        [4, 2],
        [2, 3],
      ]),
      [0],
    );
    expect(s.data[0]).toBeCloseTo(8 / 3, 14);
    const a = randomSPD(rng, 3);
    expect(maxAbsDiff(schurComplement(a, [0, 1, 2]), a)).toBe(0);
  });

  it('inverse of a Schur complement is the corresponding block of the inverse', () => {
    for (let t = 0; t < 10; t++) {
      const a = randomSPD(rng, 5);
      const keep = [0, 3];
      const lhs = inverse(schurComplement(a, keep), { spd: true });
      const rhs = select(inverse(a, { spd: true }), keep, keep);
      expect(maxAbsDiff(lhs, rhs)).toBeLessThan(1e-10);
    }
  });

  it('conditioning in information form equals conditioning in covariance form', () => {
    for (let t = 0; t < 10; t++) {
      const g = { mean: Float64Array.from({ length: 5 }, () => rng.normal()), cov: randomSPD(rng, 5) };
      const idx = [1, 4];
      const v = vec([rng.normal(), rng.normal()]);
      const c = condition(g, idx, v);
      const ci = fromInformation(conditionInformation(toInformation(g), idx, v));
      expect(maxAbsDiff(c.cov, ci.cov)).toBeLessThan(1e-10);
      for (let i = 0; i < 3; i++) expect(c.mean[i]).toBeCloseTo(ci.mean[i]!, 10);
    }
  });

  it('marginalizing in information form (Schur) equals marginalizing in covariance form (pick blocks)', () => {
    for (let t = 0; t < 10; t++) {
      const g = { mean: Float64Array.from({ length: 6 }, () => rng.normal()), cov: randomSPD(rng, 6) };
      const keep = [0, 2, 5];
      const m = marginalize(g, keep);
      const mi = fromInformation(marginalizeInformation(toInformation(g), keep));
      expect(maxAbsDiff(m.cov, mi.cov)).toBeLessThan(1e-10);
      for (let i = 0; i < 3; i++) expect(m.mean[i]).toBeCloseTo(mi.mean[i]!, 10);
      const all = marginalizeInformation(toInformation(g), [0, 1, 2, 3, 4, 5]);
      expect(maxAbsDiff(all.info, toInformation(g).info)).toBe(0);
    }
  });

  it('conditional covariance is the Schur complement of Σ (and the conditional information is just Ω_aa)', () => {
    const g = { mean: vec([0, 0, 0, 0]), cov: randomSPD(rng, 4) };
    const c = condition(g, [2, 3], vec([1, -1]));
    expect(maxAbsDiff(c.cov, schurComplement(g.cov, [0, 1]))).toBeLessThan(1e-12);
    const ci = conditionInformation(toInformation(g), [2, 3], vec([1, -1]));
    expect(maxAbsDiff(ci.info, select(toInformation(g).info, [0, 1], [0, 1]))).toBe(0);
    expect(() => conditionInformation(toInformation(g), [2], vec([1, 2]))).toThrow();
  });
});
