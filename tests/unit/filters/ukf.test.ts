import { describe, expect, it } from 'vitest';
import { sigmaPoints, ukfPredict, ukfUpdate, unscentedTransform } from '../../../src/lib/filters/ukf';
import { kfRun, type KfState } from '../../../src/lib/filters/kf';
import { linearTransform } from '../../../src/lib/math/gaussian';
import { diag, fromArrays, maxAbsDiff, mulVec, vec, type Vec } from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';
import { cvModel } from '../../../src/lib/models/linear';
import { squareMoments } from '../../../src/lib/models/nonlinear';

const g2 = {
  mean: vec([1, -0.5]),
  cov: fromArrays([
    [0.8, 0.3],
    [0.3, 0.5],
  ]),
};

describe('sigma points', () => {
  const params = [
    { alpha: 1, beta: 0, kappa: 1 },
    { alpha: 0.5, beta: 2, kappa: 0 },
    { alpha: 1, beta: 2, kappa: 0 },
  ];
  it('2n + 1 points; mean weights sum to 1', () => {
    for (const p of params) {
      const sp = sigmaPoints(g2, p);
      expect(sp.X).toHaveLength(5);
      expect(sp.Wm.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 14);
      expect(sp.Wc[0]! - sp.Wm[0]!).toBeCloseTo(1 - p.alpha ** 2 + p.beta, 14);
    }
    expect(() => sigmaPoints(g2, { alpha: 0.1, beta: 2, kappa: -2 })).toThrow();
  });
  it('the identity map returns the mean and covariance exactly, for any α, β, κ', () => {
    // The central point's image sits at the mean, so its covariance weight (the only place β enters) multiplies zero.
    for (const p of params) {
      const ut = unscentedTransform(g2, (x) => x, p);
      for (let i = 0; i < 2; i++) expect(ut.mean[i]).toBeCloseTo(g2.mean[i]!, 13);
      expect(maxAbsDiff(ut.cov, g2.cov)).toBeLessThan(1e-12);
      expect(maxAbsDiff(ut.cross, g2.cov)).toBeLessThan(1e-12);
    }
  });
});

describe('unscented transform', () => {
  it('is exact for a linear map, for any parameters', () => {
    const A = fromArrays([
      [1, 2],
      [-0.5, 1.5],
      [0.3, 0],
    ]);
    const ut = unscentedTransform(g2, (x) => mulVec(A, x), { alpha: 0.7, beta: 2, kappa: 1 });
    const ex = linearTransform(g2, A);
    expect(maxAbsDiff(ut.cov, ex.cov)).toBeLessThan(1e-12);
    for (let i = 0; i < 3; i++) expect(ut.mean[i]).toBeCloseTo(ex.mean[i]!, 13);
  });
  it('x²: the mean is exact for any α, κ; the variance is exact iff β = 2 − 2α² (with κ = 2)', () => {
    for (const [mu, s] of [
      [0.5, 0.5],
      [1.2, 0.3],
      [-0.4, 1],
    ] as const) {
      const ex = squareMoments(mu, s);
      const g = { mean: vec([mu]), cov: fromArrays([[s * s]]) };
      for (const a of [1, 0.6, 0.2]) {
        const sq = (x: Vec) => vec([x[0]! * x[0]!]);
        const good = unscentedTransform(g, sq, { alpha: a, beta: 2 - 2 * a * a, kappa: 2 });
        expect(good.mean[0]).toBeCloseTo(ex.mean, 12);
        expect(good.cov.data[0]).toBeCloseTo(ex.variance, 12);
        const off = unscentedTransform(g, sq, { alpha: a, beta: 3 - 2 * a * a, kappa: 2 });
        expect(off.cov.data[0]! - ex.variance).toBeCloseTo(s ** 4, 12);
      }
    }
  });
});

describe('UKF (DESIGN §8.1 invariant)', () => {
  it('on a linear model the UKF equals the KF to within 1e-9', () => {
    const m = cvModel(2, 0.5, 0.2, 0.3);
    const rng = createRng(16);
    const zs = Array.from({ length: 30 }, (_, k) => vec([0.5 * k + 0.3 * rng.normal(), 0.2 * k + 0.3 * rng.normal()]));
    const init: KfState = { x: vec([0, 0, 1, 0]), P: diag([1, 1, 2, 2]) };
    const kf = kfRun(init, m, zs);
    for (const p of [
      { alpha: 1, beta: 0, kappa: -1 },
      { alpha: 0.5, beta: 2, kappa: 0 },
    ] as const) {
      let s = init;
      for (let k = 0; k < zs.length; k++) {
        s = ukfPredict(s, (x) => mulVec(m.F, x), m.Q, p);
        expect(maxAbsDiff(s.P, kf[k]!.prior.P)).toBeLessThan(1e-9);
        const u = ukfUpdate(s, zs[k]!, (x) => mulVec(m.H, x), m.R, p);
        s = u.state;
        for (let i = 0; i < 4; i++) expect(Math.abs(s.x[i]! - kf[k]!.post.x[i]!)).toBeLessThan(1e-9);
        expect(maxAbsDiff(s.P, kf[k]!.post.P)).toBeLessThan(1e-9);
      }
    }
  });
});
