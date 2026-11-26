import { describe, expect, it } from 'vitest';
import { ekfPredict, ekfUpdate } from '../../../src/lib/filters/ekf';
import { kfRun, type KfState } from '../../../src/lib/filters/kf';
import { diag, maxAbsDiff, mul, mulVec, vec, type Vec } from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';
import { cvModel } from '../../../src/lib/models/linear';

describe('EKF (DESIGN §8.1 invariant)', () => {
  it('on a linear model the EKF equals the KF to within 1e-9', () => {
    const m = cvModel(2, 0.5, 0.2, 0.3);
    const rng = createRng(15);
    const zs: Vec[] = Array.from({ length: 30 }, (_, k) =>
      vec([0.5 * k + 0.3 * rng.normal(), 0.2 * k + 0.3 * rng.normal()]),
    );
    const init: KfState = { x: vec([0, 0, 1, 0]), P: diag([1, 1, 2, 2]) };
    const kf = kfRun(init, m, zs);
    const motion = { f: (x: Vec) => mulVec(m.F, x), F: () => m.F, Q: () => m.Q };
    const meas = { h: (x: Vec) => mulVec(m.H, x), H: () => m.H, R: m.R };
    let s = init;
    for (let k = 0; k < zs.length; k++) {
      s = ekfPredict(s, motion, undefined);
      expect(maxAbsDiff(s.P, kf[k]!.prior.P)).toBeLessThan(1e-9);
      const u = ekfUpdate(s, zs[k]!, meas);
      s = u.state;
      for (let i = 0; i < 4; i++) expect(Math.abs(s.x[i]! - kf[k]!.post.x[i]!)).toBeLessThan(1e-9);
      expect(maxAbsDiff(s.P, kf[k]!.post.P)).toBeLessThan(1e-9);
      expect(u.nis).toBeCloseTo(kf[k]!.update!.nis, 9);
    }
  });

  it('uses the nonlinear residual (e.g. wrapped angles) as the innovation', () => {
    const s: KfState = { x: vec([Math.PI - 0.01]), P: diag([0.01]) };
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const u = ekfUpdate(
      s,
      vec([-Math.PI + 0.01]),
      { h: (x) => x, H: () => diag([1]), R: diag([0.01]), residual: (z, zh) => vec([wrap(z[0]! - zh[0]!)]) },
      { normalize: (x) => vec([wrap(x[0]!)]) },
    );
    expect(u.nu[0]).toBeCloseTo(0.02, 12); // not −2π + 0.02
    expect(Math.abs(u.state.x[0]!)).toBeCloseTo(Math.PI, 12);
  });

  it('linearizes at the current estimate: F and H are evaluated at x̂', () => {
    const seen: number[] = [];
    const motion = {
      f: (x: Vec) => vec([x[0]! * x[0]!]),
      F: (x: Vec) => {
        seen.push(x[0]!);
        return diag([2 * x[0]!]);
      },
      Q: () => diag([0]),
    };
    const p = ekfPredict({ x: vec([3]), P: diag([0.1]) }, motion, undefined);
    expect(seen).toEqual([3]);
    expect(p.x[0]).toBe(9);
    expect(p.P.data[0]).toBeCloseTo(36 * 0.1, 12);
    void mul;
  });
});
