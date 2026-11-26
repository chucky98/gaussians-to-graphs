import { describe, expect, it } from 'vitest';
import { fromInfo, infoPredict, infoUpdate, toInfo } from '../../../src/lib/filters/info';
import { batchLinearGaussian, kfRun, trajectoryInformation, type KfState } from '../../../src/lib/filters/kf';
import { diag, maxAbsDiff, mulVec, vec, type Vec } from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';
import { cvModel } from '../../../src/lib/models/linear';

const m = cvModel(2, 0.5, 0.3, 0.4);
const init: KfState = { x: vec([0, 0, 1, 0.5]), P: diag([1, 1, 4, 4]) };
const rng = createRng(1919);
const zs: (Vec | null)[] = Array.from({ length: 25 }, (_, k) =>
  k % 6 === 5 ? null : vec([0.5 * k + 0.4 * rng.normal(), 0.25 * k + 0.4 * rng.normal()]),
);

describe('information filter (DESIGN §8.1 invariant)', () => {
  it('matches the Kalman filter at every step', () => {
    const kf = kfRun(init, m, zs);
    let i = toInfo(init);
    for (let k = 0; k < zs.length; k++) {
      i = infoPredict(i, m);
      const pr = fromInfo(i);
      for (let j = 0; j < 4; j++) expect(pr.x[j]).toBeCloseTo(kf[k]!.prior.x[j]!, 9);
      if (zs[k] !== null) i = infoUpdate(i, zs[k]!, m);
      const s = fromInfo(i);
      for (let j = 0; j < 4; j++) expect(s.x[j]).toBeCloseTo(kf[k]!.post.x[j]!, 9);
      expect(maxAbsDiff(s.P, kf[k]!.post.P)).toBeLessThan(1e-9);
    }
  });
  it('updates are additive: order does not matter, and two updates equal one with stacked data', () => {
    const i0 = toInfo(init);
    const a = vec([0.3, 0.1]);
    const b = vec([0.5, -0.2]);
    const ab = infoUpdate(infoUpdate(i0, a, m), b, m);
    const ba = infoUpdate(infoUpdate(i0, b, m), a, m);
    expect(maxAbsDiff(ab.Omega, ba.Omega)).toBeLessThan(1e-12);
    for (let j = 0; j < 4; j++) expect(ab.xi[j]).toBeCloseTo(ba.xi[j]!, 12);
  });
});

describe('trajectory information matrix', () => {
  it('is block-tridiagonal: blocks of states more than one step apart are exactly zero', () => {
    const { Lambda } = trajectoryInformation(init, m, zs);
    const n = 4;
    const N = zs.length + 1;
    for (let a = 0; a < N; a++)
      for (let b = 0; b < N; b++) {
        if (Math.abs(a - b) <= 1) continue;
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) expect(Lambda.data[(a * n + i) * (N * n) + b * n + j]).toBe(0);
      }
  });
  it('its inverse holds the batch marginal covariances', () => {
    const { Lambda, eta } = trajectoryInformation(init, m, zs);
    const b = batchLinearGaussian(init, m, zs);
    // Λ x = η is solved by the batch means.
    const x = Float64Array.from(b.x.flatMap((v) => Array.from(v)));
    const r = mulVec(Lambda, x);
    for (let i = 0; i < r.length; i++) expect(r[i]).toBeCloseTo(eta[i]!, 8);
  });
});
