/** Quaternions, Euler angles and the series coefficients (DESIGN §8.1: quaternion ↔ matrix round trip). */
import { describe, expect, it } from 'vitest';
import { interpolate } from '../../../src/lib/geometry/lie';
import * as quat from '../../../src/lib/geometry/quat';
import { cosc, jinvCoeff, qCoeffB, qCoeffC, sinc, sinc3 } from '../../../src/lib/geometry/series';
import * as so3 from '../../../src/lib/geometry/so3';
import { det, identity, maxAbsDiff, mul, transpose, scale, type Mat } from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';

const rng = createRng(31);
const randRotVec = (maxAngle = Math.PI) => {
  const d = [rng.normal(), rng.normal(), rng.normal()];
  const n = Math.hypot(...d);
  const a = rng.uniformRange(0, maxAngle);
  return Float64Array.from(d.map((v) => (a * v) / n));
};
const randQuat = () => quat.fromRotationVector(randRotVec());
const qDist = (p: quat.Quat, q: quat.Quat) =>
  Math.min(
    Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2], p[3] - q[3]),
    Math.hypot(p[0] + q[0], p[1] + q[1], p[2] + q[2], p[3] + q[3]),
  );

describe('series coefficients', () => {
  it('match the direct formulas away from 0 and their limits at 0', () => {
    for (const t of [0.21, 0.4, 0.7, 1.5, 2.9]) {
      expect(sinc(t)).toBeCloseTo(Math.sin(t) / t, 14);
      expect(cosc(t)).toBeCloseTo((1 - Math.cos(t)) / t ** 2, 13);
      expect(sinc3(t)).toBeCloseTo((t - Math.sin(t)) / t ** 3, 11);
      expect(jinvCoeff(t)).toBeCloseTo(1 / t ** 2 - (1 + Math.cos(t)) / (2 * t * Math.sin(t)), 10);
      expect(qCoeffB(t)).toBeCloseTo((t * t + 2 * Math.cos(t) - 2) / (2 * t ** 4), 9);
      expect(qCoeffC(t)).toBeCloseTo((2 * t - 3 * Math.sin(t) + t * Math.cos(t)) / (2 * t ** 5), 7);
    }
    expect([sinc(0), cosc(0), sinc3(0), jinvCoeff(0), qCoeffB(0), qCoeffC(0)]).toEqual([
      1,
      0.5,
      1 / 6,
      1 / 12,
      1 / 24,
      1 / 120,
    ]);
  });
  it('are continuous across the switch to the series (θ = 0.2), and the series is accurate up to it', () => {
    for (const f of [sinc, cosc, sinc3, jinvCoeff, qCoeffB, qCoeffC]) {
      const below = f(0.2 - 1e-12);
      const above = f(0.2 + 1e-12);
      expect(Math.abs(below - above) / Math.abs(above)).toBeLessThan(1e-10);
    }
  });
});

describe('quaternions', () => {
  it('quaternion → matrix → quaternion round trip, and the matrix is a rotation', () => {
    for (let i = 0; i < 500; i++) {
      const q = randQuat();
      const C = quat.toMatrix(q);
      expect(maxAbsDiff(mul(C, transpose(C)), identity(3))).toBeLessThan(1e-14);
      expect(det(C)).toBeCloseTo(1, 13);
      expect(qDist(quat.fromMatrix(C), q)).toBeLessThan(1e-14);
    }
  });
  it('fromMatrix handles every Shepperd branch, including 180° turns about each axis', () => {
    for (const C of [so3.rotX(Math.PI), so3.rotY(Math.PI), so3.rotZ(Math.PI), so3.rotX(3), so3.rotY(-3), so3.rotZ(2.9)])
      expect(maxAbsDiff(quat.toMatrix(quat.fromMatrix(C)), C)).toBeLessThan(1e-14);
  });
  it('q and −q give the same matrix (double cover)', () => {
    const q = randQuat();
    const m: quat.Quat = [-q[0], -q[1], -q[2], -q[3]];
    expect(maxAbsDiff(quat.toMatrix(q), quat.toMatrix(m))).toBe(0);
  });
  it('the Hamilton product matches the matrix product, and rotate matches C v', () => {
    for (let i = 0; i < 200; i++) {
      const [p, q] = [randQuat(), randQuat()];
      expect(maxAbsDiff(quat.toMatrix(quat.mul(p, q)), mul(quat.toMatrix(p), quat.toMatrix(q)))).toBeLessThan(1e-14);
      const v: [number, number, number] = [rng.normal(), rng.normal(), rng.normal()];
      const r = quat.rotate(q, v);
      const Cv = so3.act(quat.toMatrix(q), v);
      expect(Math.hypot(r[0] - Cv[0]!, r[1] - Cv[1]!, r[2] - Cv[2]!)).toBeLessThan(1e-14);
    }
  });
  it('Exp/Log agree with SO(3) and invert each other', () => {
    for (let i = 0; i < 200; i++) {
      const phi = randRotVec(3.1);
      const q = quat.fromRotationVector(phi);
      expect(maxAbsDiff(quat.toMatrix(q), so3.exp(phi))).toBeLessThan(1e-14);
      const back = quat.toRotationVector(q);
      expect(Math.hypot(...back.map((v, k) => v - phi[k]!))).toBeLessThan(1e-12);
      expect(quat.angle(q)).toBeCloseTo(Math.hypot(...phi), 13);
    }
    const tiny = Float64Array.of(1e-10, -2e-10, 3e-10);
    const b = quat.toRotationVector(quat.fromRotationVector(tiny));
    expect(Math.hypot(...b.map((v, k) => v - tiny[k]!))).toBeLessThan(1e-24);
  });
  it('slerp equals SO(3) geodesic interpolation and turns at a constant rate', () => {
    for (let i = 0; i < 50; i++) {
      const [p, q] = [randQuat(), randQuat()];
      const total = quat.angleBetween(p, q);
      expect(total).toBeLessThanOrEqual(Math.PI + 1e-12);
      for (const t of [0, 0.25, 0.5, 0.9, 1]) {
        const s = quat.slerp(p, q, t);
        const C = interpolate(so3.SO3, quat.toMatrix(p), quat.toMatrix(q), t);
        expect(maxAbsDiff(quat.toMatrix(s), C)).toBeLessThan(1e-12);
        expect(quat.angleBetween(p, s)).toBeCloseTo(t * total, 11);
      }
    }
  });
  it('slerp takes the short way even when q₁ is given with the opposite sign', () => {
    const p = quat.fromRotationVector([0, 0, 0.2]);
    const q = quat.fromRotationVector([0, 0, 0.6]);
    const qNeg: quat.Quat = [-q[0], -q[1], -q[2], -q[3]];
    expect(qDist(quat.slerp(p, qNeg, 0.5), quat.fromRotationVector([0, 0, 0.4]))).toBeLessThan(1e-15);
  });
  it('nlerp hits the ends and the midpoint, but is not constant-rate', () => {
    const p = quat.identity;
    const q = quat.fromRotationVector([0, 0, 3]);
    expect(qDist(quat.nlerp(p, q, 0), p)).toBeLessThan(1e-15);
    expect(qDist(quat.nlerp(p, q, 1), q)).toBeLessThan(1e-15);
    expect(quat.angleBetween(p, quat.nlerp(p, q, 0.5))).toBeCloseTo(1.5, 14);
    expect(Math.abs(quat.angleBetween(p, quat.nlerp(p, q, 0.25)) - 0.75)).toBeGreaterThan(0.1);
  });
  it('fromEulerZYX matches the matrix product R_z R_y R_x', () => {
    for (let i = 0; i < 100; i++) {
      const [y, p, r] = [rng.uniformRange(-3, 3), rng.uniformRange(-1.5, 1.5), rng.uniformRange(-3, 3)];
      expect(maxAbsDiff(quat.toMatrix(quat.fromEulerZYX(y, p, r)), so3.fromEulerZYX(y, p, r))).toBeLessThan(1e-14);
    }
  });
  it('normalize, conj and canonical', () => {
    const q = quat.normalize([2, 0, 0, 2]);
    expect(quat.norm(q)).toBeCloseTo(1, 15);
    expect(quat.mul(q, quat.conj(q))[0]).toBeCloseTo(1, 15);
    expect(quat.canonical([-1, 0, 0, 0])).toEqual([1, -0, -0, -0]);
    expect(quat.dot(q, q)).toBeCloseTo(1, 15);
  });
});

describe('Euler angles (yaw–pitch–roll, Z–Y–X)', () => {
  it('round trip away from gimbal lock', () => {
    for (let i = 0; i < 500; i++) {
      const e = {
        yaw: rng.uniformRange(-3.1, 3.1),
        pitch: rng.uniformRange(-1.5, 1.5),
        roll: rng.uniformRange(-3.1, 3.1),
      };
      const back = so3.toEulerZYX(so3.fromEulerZYX(e.yaw, e.pitch, e.roll));
      expect(back.yaw).toBeCloseTo(e.yaw, 11);
      expect(back.pitch).toBeCloseTo(e.pitch, 11);
      expect(back.roll).toBeCloseTo(e.roll, 11);
    }
  });
  it('at pitch ±90° only yaw ∓ roll matters, and toEuler still reproduces the rotation', () => {
    for (const sgn of [1, -1]) {
      const pitch = (sgn * Math.PI) / 2;
      const A = so3.fromEulerZYX(0.7, pitch, 0.2);
      const B = so3.fromEulerZYX(0.7 + 0.3, pitch, 0.2 + sgn * 0.3); // shift yaw and roll together
      expect(maxAbsDiff(A, B)).toBeLessThan(1e-15);
      const e = so3.toEulerZYX(A);
      expect(e.roll).toBe(0);
      expect(e.pitch).toBeCloseTo(pitch, 15);
      expect(maxAbsDiff(so3.fromEulerZYX(e.yaw, e.pitch, e.roll), A)).toBeLessThan(1e-14);
    }
  });
  it('E maps Euler rates to body angular velocity (finite differences), with det E = −cos(pitch)', () => {
    const h = 1e-6;
    for (let i = 0; i < 50; i++) {
      const e = [rng.uniformRange(-3, 3), rng.uniformRange(-1.5, 1.5), rng.uniformRange(-3, 3)] as const;
      const rates = [rng.normal(), rng.normal(), rng.normal()] as const;
      const at = (s: number) => so3.fromEulerZYX(e[0] + s * rates[0], e[1] + s * rates[1], e[2] + s * rates[2]);
      const C = at(0);
      const Cdot: Mat = { ...C, data: at(h).data.map((v, k) => (v - at(-h).data[k]!) / (2 * h)) };
      const w = so3.vee(mul(transpose(C), Cdot)); // ω^ = Cᵀ Ċ (body frame)
      const E = so3.eulerRatesToBodyZYX(e[1], e[2]);
      const Ew = so3.act(E, rates);
      expect(Math.hypot(...w.map((v, k) => v - Ew[k]!))).toBeLessThan(1e-8);
      expect(det(E)).toBeCloseTo(-Math.cos(e[1]), 14);
    }
  });
  it('orthonormalize returns the nearest rotation (it undoes a uniform scale exactly)', () => {
    const C = so3.exp(Float64Array.of(0.3, -0.4, 0.5));
    expect(maxAbsDiff(so3.orthonormalize(scale(C, 1.001)), C)).toBeLessThan(1e-14);
    let D = identity(3);
    const step = so3.exp(Float64Array.of(0.01, 0.02, -0.03));
    for (let i = 0; i < 1000; i++) D = { ...D, data: mul(D, step).data.map((v) => v * (1 + 1e-9)) };
    const fixed = so3.orthonormalize(D);
    expect(maxAbsDiff(mul(fixed, transpose(fixed)), identity(3))).toBeLessThan(1e-14);
    expect(maxAbsDiff(fixed, so3.exp(Float64Array.of(10, 20, -30)))).toBeLessThan(1e-10);
  });
});
