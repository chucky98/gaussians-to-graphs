import { describe, expect, it } from 'vitest';
import { fixedLagSmooth, rtsSmooth } from '../../../src/lib/filters/rts';
import { batchLinearGaussian, kfRun, type KfState } from '../../../src/lib/filters/kf';
import { diag, isSymmetricPSD, maxAbsDiff, mulVec, vec, type Vec } from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';
import { cvModel } from '../../../src/lib/models/linear';

const m = cvModel(2, 0.5, 0.3, 0.4);
const init: KfState = { x: vec([0, 0, 1, 0.5]), P: diag([1, 1, 4, 4]) };
const rng = createRng(1818);
const zs: (Vec | null)[] = [];
{
  let x = vec([0.3, -0.2, 1.2, 0.4]);
  for (let k = 0; k < 30; k++) {
    x = mulVec(m.F, x);
    for (let i = 0; i < 4; i++) x[i]! += 0.05 * rng.normal();
    zs.push(k >= 10 && k < 17 ? null : vec([x[0]! + 0.4 * rng.normal(), x[1]! + 0.4 * rng.normal()]));
  }
}

describe('RTS smoother (DESIGN §8.1 invariant)', () => {
  it('equals the batch solution for all states, means and covariances (with a gap in the data)', () => {
    const steps = kfRun(init, m, zs);
    const s = rtsSmooth(init, steps, m.F);
    const b = batchLinearGaussian(init, m, zs);
    expect(s).toHaveLength(31);
    for (let k = 0; k <= 30; k++) {
      for (let i = 0; i < 4; i++) expect(Math.abs(s[k]!.x[i]! - b.x[k]![i]!)).toBeLessThan(1e-9);
      expect(maxAbsDiff(s[k]!.P, b.P[k]!)).toBeLessThan(1e-9);
      expect(isSymmetricPSD(s[k]!.P)).toBe(true);
    }
  });
  it('the last smoothed state is the last filtered state; smoothing never increases the variance', () => {
    const steps = kfRun(init, m, zs);
    const s = rtsSmooth(init, steps, m.F);
    expect(s[30]).toBe(steps[29]!.post);
    for (let k = 1; k < 30; k++)
      for (let i = 0; i < 4; i++)
        expect(s[k]!.P.data[i * 5]!).toBeLessThanOrEqual(steps[k - 1]!.post.P.data[i * 5]! + 1e-12);
  });
  it('fixed lag: L = 0 is the filter; L ≥ N is the full smoother', () => {
    const steps = kfRun(init, m, zs);
    const f0 = fixedLagSmooth(init, m, zs, 0);
    for (let k = 1; k <= 30; k++) expect(maxAbsDiff(f0[k]!.P, steps[k - 1]!.post.P)).toBeLessThan(1e-12);
    const full = rtsSmooth(init, steps, m.F);
    const fN = fixedLagSmooth(init, m, zs, 30);
    for (let k = 0; k <= 30; k++) expect(Math.abs(fN[k]!.x[0]! - full[k]!.x[0]!)).toBeLessThan(1e-12);
  });

  it('with a control input, fixed lag ≥ N equals the full smoother, which equals batch', () => {
    const one = diag([1]);
    const mm = { F: one, B: one, Q: diag([0.01]), H: one, R: diag([0.09]) };
    const z1 = [1.1, 2.2, null, 3.8, 5.1].map((v) => (v === null ? null : vec([v])));
    const us = z1.map(() => vec([1]));
    const i1 = { x: vec([0]), P: diag([1]) };
    const full = rtsSmooth(i1, kfRun(i1, mm, z1, us), mm.F);
    const lag = fixedLagSmooth(i1, mm, z1, 5, us);
    const b = batchLinearGaussian(i1, mm, z1, us);
    for (let k = 0; k <= 5; k++) {
      expect(lag[k]!.x[0]).toBeCloseTo(full[k]!.x[0]!, 12);
      expect(full[k]!.x[0]).toBeCloseTo(b.x[k]![0]!, 10);
    }
  });
});
