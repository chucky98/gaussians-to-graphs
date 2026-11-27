/** Every concrete claim in post 20, checked against the formulas and the widgets' defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import { GIMBAL, SLERP, eulerChangeForTurn, gimbal, interpPath, orientationAt } from '../../../src/lib/demos/rotations';
import * as quat from '../../../src/lib/geometry/quat';
import * as so3 from '../../../src/lib/geometry/so3';
import {
  add,
  det,
  fromArrays,
  identity,
  inverse,
  maxAbsDiff,
  mul,
  scale,
  sub,
  transpose,
} from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';

const RAD = Math.PI / 180;
const round = (v: number) => Math.round(v);
const rng = createRng(20);

describe('post 20: rotation matrices', () => {
  it('C(a) C(b) = C(a + b) in the plane; CᵀC = I and det C = 1', () => {
    const C2 = (t: number) =>
      fromArrays([
        [Math.cos(t), -Math.sin(t)],
        [Math.sin(t), Math.cos(t)],
      ]);
    expect(maxAbsDiff(mul(C2(0.4), C2(1.1)), C2(1.5))).toBeLessThan(1e-15);
    const C = so3.exp(Float64Array.of(0.3, -1.2, 0.7));
    expect(maxAbsDiff(mul(transpose(C), C), identity(3))).toBeLessThan(1e-15);
    expect(det(C)).toBeCloseTo(1, 14);
  });
  it('the book experiment: C_z(90°) C_x(90°) sends the nose to (0, 1, 0); the other order to (0, 0, 1)', () => {
    const q = 90 * RAD;
    const a = so3.act(mul(so3.rotZ(q), so3.rotX(q)), [1, 0, 0]);
    const b = so3.act(mul(so3.rotX(q), so3.rotZ(q)), [1, 0, 0]);
    expect(Array.from(a).map((v) => Math.round(v * 1e12) / 1e12 + 0)).toEqual([0, 1, 0]);
    expect(Array.from(b).map((v) => Math.round(v * 1e12) / 1e12 + 0)).toEqual([0, 0, 1]);
  });
  it('with z up and y left, a positive pitch tips the nose down', () => {
    expect(so3.act(so3.rotY(10 * RAD), [1, 0, 0])[2]).toBeLessThan(0);
  });
});

describe('post 20: Euler angles and gimbal lock', () => {
  it('C(ψ, 90°, φ) has the stated form, depending only on φ − ψ', () => {
    for (let i = 0; i < 50; i++) {
      const [psi, phi] = [rng.uniformRange(-3, 3), rng.uniformRange(-3, 3)];
      const d = phi - psi;
      const expected = fromArrays([
        [0, Math.sin(d), Math.cos(d)],
        [0, Math.cos(d), -Math.sin(d)],
        [-1, 0, 0],
      ]);
      expect(maxAbsDiff(so3.fromEulerZYX(psi, Math.PI / 2, phi), expected)).toBeLessThan(1e-15);
    }
  });
  it('at pitch 90°: yaw +10° = roll −10°, and raising both by 10° changes nothing', () => {
    const base = so3.fromEulerZYX(0.5, Math.PI / 2, 0.2);
    const t = 10 * RAD;
    expect(
      maxAbsDiff(so3.fromEulerZYX(0.5 + t, Math.PI / 2, 0.2), so3.fromEulerZYX(0.5, Math.PI / 2, 0.2 - t)),
    ).toBeLessThan(1e-15);
    expect(maxAbsDiff(so3.fromEulerZYX(0.5 + t, Math.PI / 2, 0.2 + t), base)).toBeLessThan(1e-15);
  });
  it('det E = −cos θ; singular values √(1 + |sin θ|), 1, √(1 − |sin θ|): smallest 0.71 at 30°, 0.12 at 80°, 0 at 90°', () => {
    expect(det(so3.eulerRatesToBodyZYX(0.4, 1.1))).toBeCloseTo(-Math.cos(0.4), 15);
    expect(gimbal(GIMBAL.presets.default).singular[2].toFixed(2)).toBe('0.71');
    expect(gimbal(GIMBAL.presets.near).singular[2].toFixed(2)).toBe('0.12');
    expect(gimbal(GIMBAL.presets.lock).singular[2]).toBe(0);
  });
  it('E has unit columns, columns 1 and 2 perpendicular, columns 1 and 3 with dot −sin θ', () => {
    const E = so3.eulerRatesToBodyZYX(0.7, -1.3);
    const c = (j: number) => [E.data[j]!, E.data[3 + j]!, E.data[6 + j]!];
    const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i]!, 0);
    for (const j of [0, 1, 2]) expect(dot(c(j), c(j))).toBeCloseTo(1, 15);
    expect(dot(c(0), c(1))).toBeCloseTo(0, 15);
    expect(dot(c(0), c(2))).toBeCloseTo(-Math.sin(0.7), 15);
  });
  it('the defaults: yaw 30°, pitch 30°, roll 20°; yaw-to-roll axis gap 60°; no change much above 5°', () => {
    expect(GIMBAL.presets.default).toEqual({ yaw: 30, pitch: 30, roll: 20 });
    expect(round(gimbal(GIMBAL.presets.default).yawRollGap)).toBe(60);
    const all = (['x', 'y', 'z'] as const).flatMap((a) => Object.values(eulerChangeForTurn(GIMBAL.presets.default, a)));
    expect(Math.max(...all.map(Math.abs))).toBeLessThan(5.5);
  });
  it('lock preset: yaw and roll axes 0° apart', () => {
    expect(gimbal(GIMBAL.presets.lock).yawRollGap).toBeLessThan(1e-6);
  });
  it('pitch 80°: a 5° turn about the wing needs about 18° of yaw and roll each; about the top, about 22° each', () => {
    const w = eulerChangeForTurn(GIMBAL.presets.near, 'y');
    expect([round(w.yaw), round(w.roll)]).toEqual([18, 18]);
    const t = eulerChangeForTurn(GIMBAL.presets.near, 'z');
    expect([round(t.yaw), round(t.roll)]).toEqual([22, 22]);
  });
  it('pitch 90°: a 5° turn about the wing makes yaw and roll jump by 160°; about the nose it is only roll', () => {
    const w = eulerChangeForTurn(GIMBAL.presets.lock, 'y');
    expect([round(w.yaw), round(w.roll)]).toEqual([160, 160]);
    const n = eulerChangeForTurn(GIMBAL.presets.lock, 'x');
    expect([round(n.yaw), round(n.pitch), round(n.roll)]).toEqual([0, 0, 5]);
  });
  it('E⁻¹ grows like 1/cos θ near ±90°', () => {
    const big = (p: number) => {
      const E = so3.eulerRatesToBodyZYX(p, 0.3);
      return Math.max(...inverse(E).data.map(Math.abs));
    };
    expect(big(89 * RAD) * Math.cos(89 * RAD)).toBeGreaterThan(0.5);
    expect(big(89 * RAD) * Math.cos(89 * RAD)).toBeLessThan(2);
  });
});

describe('post 20: axis–angle and quaternions', () => {
  it("Rodrigues' formula (2) equals Exp; tr C = 1 + 2 cos θ; C − Cᵀ = 2 sin θ [u]×", () => {
    for (let i = 0; i < 50; i++) {
      const u = [rng.normal(), rng.normal(), rng.normal()];
      const n = Math.hypot(...u);
      const uu = Float64Array.from(u.map((v) => v / n));
      const th = rng.uniformRange(0, 3);
      const K = so3.hat(uu);
      const C = add(add(identity(3), scale(K, Math.sin(th))), scale(mul(K, K), 1 - Math.cos(th)));
      expect(maxAbsDiff(C, so3.exp(uu.map((v) => v * th)))).toBeLessThan(1e-14);
      expect(C.data[0]! + C.data[4]! + C.data[8]!).toBeCloseTo(1 + 2 * Math.cos(th), 13);
      expect(maxAbsDiff(sub(C, transpose(C)), scale(K, 2 * Math.sin(th)))).toBeLessThan(1e-14);
    }
  });
  it('π u and −π u are the same rotation', () => {
    const u = Float64Array.of(0.6, 0, 0.8);
    expect(maxAbsDiff(so3.exp(u.map((v) => v * Math.PI)), so3.exp(u.map((v) => -v * Math.PI)))).toBeLessThan(1e-15);
  });
  it('the product formula written with dot and cross products equals the Hamilton product; q* is the inverse', () => {
    const p = quat.fromRotationVector([0.3, -0.5, 0.9]);
    const q = quat.fromRotationVector([-1.2, 0.4, 0.2]);
    const [pw, px, py, pz] = p;
    const [qw, qx, qy, qz] = q;
    const cross = [py * qz - pz * qy, pz * qx - px * qz, px * qy - py * qx];
    const expected = [
      pw * qw - (px * qx + py * qy + pz * qz),
      pw * qx + qw * px + cross[0]!,
      pw * qy + qw * py + cross[1]!,
      pw * qz + qw * pz + cross[2]!,
    ];
    const got = quat.mul(p, q);
    for (let i = 0; i < 4; i++) expect(got[i]).toBeCloseTo(expected[i]!, 15);
    const one = quat.mul(q, quat.conj(q));
    expect(one[0]).toBeCloseTo(1, 15);
  });
  it('slerp (3) in sine form equals the rotation-vector form, and its total angle is 2Ω', () => {
    for (let i = 0; i < 50; i++) {
      const q0 = quat.fromRotationVector([rng.normal(), rng.normal(), rng.normal()]);
      let q1 = quat.fromRotationVector([rng.normal(), rng.normal(), rng.normal()]);
      if (quat.dot(q0, q1) < 0) q1 = [-q1[0], -q1[1], -q1[2], -q1[3]];
      const Om = Math.acos(quat.dot(q0, q1));
      for (const t of [0.2, 0.5, 0.8]) {
        const a = Math.sin((1 - t) * Om) / Math.sin(Om);
        const b = Math.sin(t * Om) / Math.sin(Om);
        const s = quat.slerp(q0, q1, t);
        for (let k = 0; k < 4; k++) expect(s[k]).toBeCloseTo(a * q0[k]! + b * q1[k]!, 12);
      }
      expect(quat.angleBetween(q0, q1)).toBeCloseTo(2 * Om, 12);
    }
  });
});

describe('post 20: QuaternionSlerp presets', () => {
  const total = (m: 'slerp' | 'euler', p: keyof typeof SLERP.presets, longWay = false) =>
    interpPath(m, SLERP.presets[p].a, SLERP.presets[p].b, longWay).total;
  it('half turn: (yaw 180°, roll 180°) is a pitch of 180°; slerp 180°, Euler 255° (= 180° √2)', () => {
    expect(maxAbsDiff(so3.fromEulerZYX(Math.PI, 0, Math.PI), so3.rotY(Math.PI))).toBeLessThan(1e-15);
    expect(round(total('slerp', 'flip'))).toBe(180);
    expect(round(total('euler', 'flip'))).toBe(255);
    expect(total('euler', 'flip')).toBeCloseTo(180 * Math.SQRT2, 2); // 240 samples: the sum of steps converges to the exact arc
  });
  it('half turn: slerp turns about the wing (y) axis with the nose through the bottom; Euler keeps the nose on the equator', () => {
    const { a, b } = SLERP.presets.flip;
    const mid = quat.rotate(orientationAt('slerp', a, b, 0.5), [1, 0, 0]);
    expect(mid[2]).toBeCloseTo(-1, 12);
    const end = quat.rotate(orientationAt('slerp', a, b, 1), [1, 0, 0]);
    expect(end[0]).toBeCloseTo(-1, 12);
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9])
      expect(quat.rotate(orientationAt('euler', a, b, t), [1, 0, 0])[2]).toBeCloseTo(0, 12);
  });
  it('yaw 170° → −170°: slerp 20°, Euler 340°, slerp the long way 340°', () => {
    expect(round(total('slerp', 'wrap'))).toBe(20);
    expect(round(total('euler', 'wrap'))).toBe(340);
    expect(round(total('slerp', 'wrap', true))).toBe(340);
  });
  it('small turn: both about 36°; the Euler rate between 35° and 37° per unit t', () => {
    expect(round(total('slerp', 'small'))).toBe(36);
    expect(round(total('euler', 'small'))).toBe(36);
    const r = interpPath('euler', SLERP.presets.small.a, SLERP.presets.small.b).rate;
    expect([round(r[0]), round(r[1])]).toEqual([35, 37]);
  });
});
