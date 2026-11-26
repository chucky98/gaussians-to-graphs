import { describe, expect, it } from 'vitest';
import {
  odometryBetween,
  odometryJacobianControl,
  odometryJacobianState,
  odometryMotion,
  velocityJacobianControl,
  velocityJacobianState,
  velocityMotion,
} from '../../../src/lib/models/unicycle';
import { inverseRangeBearing, rangeBearing, rangeBearingJacobians } from '../../../src/lib/models/range-bearing';
import { numericJacobian } from '../../../src/lib/math/autodiff';
import { maxAbsDiff, vec, type Mat, type Vec } from '../../../src/lib/math/matrix';
import { wrapAngle } from '../../../src/lib/geometry/so2';

const relErr = (A: Mat, B: Mat) => {
  let m = 0;
  let s = 0;
  for (let i = 0; i < A.data.length; i++) {
    m = Math.max(m, Math.abs(A.data[i]! - B.data[i]!));
    s = Math.max(s, Math.abs(B.data[i]!));
  }
  return m / Math.max(1, s);
};
// Angle outputs are wrapped; differences near ±π would jump, so tests stay away from them.
const poses = [vec([1, 2, 0.3]), vec([-0.5, 0.7, -1.2]), vec([3, -1, 2.5])];

describe('velocity (unicycle) motion model', () => {
  it('drives a circular arc of radius v/ω, and a straight line when ω = 0', () => {
    const p = velocityMotion(vec([0, 0, 0]), { v: 1, w: Math.PI / 2 }, 1); // quarter circle, radius 2/π
    const R = 2 / Math.PI;
    expect(p[0]).toBeCloseTo(R, 12);
    expect(p[1]).toBeCloseTo(R, 12);
    expect(p[2]).toBeCloseTo(Math.PI / 2, 12);
    const s = velocityMotion(vec([1, 1, Math.PI / 4]), { v: 2, w: 0 }, 0.5);
    expect(s[0]).toBeCloseTo(1 + Math.SQRT1_2, 12);
    expect(s[1]).toBeCloseTo(1 + Math.SQRT1_2, 12);
    // Continuous as ω → 0.
    const a = velocityMotion(vec([0, 0, 0.4]), { v: 1.3, w: 1e-7 }, 1);
    const b = velocityMotion(vec([0, 0, 0.4]), { v: 1.3, w: 0 }, 1);
    expect(maxAbsDiff({ rows: 3, cols: 1, data: a }, { rows: 3, cols: 1, data: b })).toBeLessThan(1e-6);
  });
  it('analytic Jacobians match central finite differences (rel. error < 1e-6), turning and straight', () => {
    for (const p of poses)
      for (const u of [
        { v: 1.2, w: 0.4 },
        { v: 0.5, w: -1.1 },
        { v: 1, w: 0 },
      ]) {
        const dt = 0.7;
        const Fx = numericJacobian((x: Vec) => velocityMotion(x, u, dt), p);
        expect(relErr(velocityJacobianState(p, u, dt), Fx)).toBeLessThan(1e-6);
        const Fu = numericJacobian((c: Vec) => velocityMotion(p, { v: c[0]!, w: c[1]! }, dt), vec([u.v, u.w]));
        expect(relErr(velocityJacobianControl(p, u, dt), Fu)).toBeLessThan(1e-6);
      }
  });
});

describe('odometry motion model', () => {
  it('odometryBetween inverts odometryMotion', () => {
    for (const a of poses)
      for (const u of [
        { rot1: 0.3, trans: 1.5, rot2: -0.2 },
        { rot1: -1.0, trans: 0.4, rot2: 0.9 },
      ]) {
        const b = odometryMotion(a, u);
        const back = odometryBetween(a, b);
        expect(back.trans).toBeCloseTo(u.trans, 12);
        expect(wrapAngle(back.rot1 - u.rot1)).toBeCloseTo(0, 12);
        expect(wrapAngle(back.rot2 - u.rot2)).toBeCloseTo(0, 12);
      }
    expect(odometryBetween(vec([1, 1, 0.5]), vec([1, 1, 0.8]))).toEqual({
      rot1: 0,
      trans: 0,
      rot2: 0.30000000000000004,
    });
  });
  it('analytic Jacobians match central finite differences', () => {
    for (const p of poses) {
      const u = { rot1: 0.2, trans: 1.1, rot2: -0.4 };
      const Fx = numericJacobian((x: Vec) => odometryMotion(x, u), p);
      expect(relErr(odometryJacobianState(p, u), Fx)).toBeLessThan(1e-6);
      const Fu = numericJacobian(
        (c: Vec) => odometryMotion(p, { rot1: c[0]!, trans: c[1]!, rot2: c[2]! }),
        vec([0.2, 1.1, -0.4]),
      );
      expect(relErr(odometryJacobianControl(p, u), Fu)).toBeLessThan(1e-6);
    }
  });
});

describe('range–bearing sensor', () => {
  it('measures distance and relative direction; the inverse recovers the landmark', () => {
    const z = rangeBearing(vec([1, 1, Math.PI / 2]), vec([4, 5]));
    expect(z[0]).toBeCloseTo(5, 14);
    expect(z[1]).toBeCloseTo(Math.atan2(4, 3) - Math.PI / 2, 14);
    for (const p of poses) {
      const m = vec([2.5, -0.5]);
      const back = inverseRangeBearing(p, rangeBearing(p, m));
      expect(back[0]).toBeCloseTo(2.5, 12);
      expect(back[1]).toBeCloseTo(-0.5, 12);
    }
  });
  it('Jacobians with respect to pose and landmark match finite differences', () => {
    for (const p of poses) {
      const m = vec([2, 3.5]);
      const { Hx, Hm } = rangeBearingJacobians(p, m);
      expect(
        relErr(
          Hx,
          numericJacobian((x: Vec) => rangeBearing(x, m), p),
        ),
      ).toBeLessThan(1e-6);
      expect(
        relErr(
          Hm,
          numericJacobian((l: Vec) => rangeBearing(p, l), m),
        ),
      ).toBeLessThan(1e-6);
    }
    expect(() => rangeBearingJacobians(vec([1, 1, 0]), vec([1, 1]))).toThrow();
  });
});
