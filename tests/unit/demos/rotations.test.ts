/** The model behind EulerGimbal and QuaternionSlerp (Post 20). */
import { describe, expect, it } from 'vitest';
import {
  GIMBAL,
  SLERP,
  directAngle,
  eulerChangeForTurn,
  gimbal,
  interpPath,
  orientationAt,
  type Euler,
} from '../../../src/lib/demos/rotations';
import * as quat from '../../../src/lib/geometry/quat';
import * as so3 from '../../../src/lib/geometry/so3';
import { eigSym, maxAbsDiff, mul, transpose } from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';

const RAD = Math.PI / 180;
const C = (e: Euler) => so3.fromEulerZYX(e.yaw * RAD, e.pitch * RAD, e.roll * RAD);

describe('gimbal', () => {
  it('ring orientations nest: yaw, yaw·pitch, yaw·pitch·roll = the body', () => {
    const g = gimbal({ yaw: 30, pitch: 30, roll: 20 });
    expect(maxAbsDiff(quat.toMatrix(g.rings.yaw), so3.rotZ(30 * RAD))).toBeLessThan(1e-14);
    expect(maxAbsDiff(quat.toMatrix(g.rings.pitch), mul(so3.rotZ(30 * RAD), so3.rotY(30 * RAD)))).toBeLessThan(1e-14);
    expect(maxAbsDiff(quat.toMatrix(g.rings.roll), g.C)).toBeLessThan(1e-14);
  });
  it('the yaw–roll gap is 90° − |pitch| and the singular values are those of E', () => {
    const rng = createRng(3);
    for (let i = 0; i < 100; i++) {
      const e = {
        yaw: rng.uniformRange(-180, 180),
        pitch: rng.uniformRange(-90, 90),
        roll: rng.uniformRange(-180, 180),
      };
      const g = gimbal(e);
      expect(g.yawRollGap).toBeCloseTo(90 - Math.abs(e.pitch), 6);
      const E = so3.eulerRatesToBodyZYX(e.pitch * RAD, e.roll * RAD);
      const values = Array.from(eigSym(mul(transpose(E), E)).values);
      const sv = values.map((v) => Math.sqrt(Math.max(0, v))).sort((a, b) => b - a);
      for (let j = 0; j < 3; j++) expect(g.singular[j]).toBeCloseTo(sv[j]!, 6);
    }
  });
  it('eulerChangeForTurn reproduces the turned rotation, at lock too', () => {
    for (const e of Object.values(GIMBAL.presets))
      for (const axis of ['x', 'y', 'z'] as const) {
        const d = eulerChangeForTurn(e, axis);
        const a = 5 * RAD;
        const turn = axis === 'x' ? so3.rotX(a) : axis === 'y' ? so3.rotY(a) : so3.rotZ(a);
        const target = mul(C(e), turn);
        const reached = C({ yaw: e.yaw + d.yaw, pitch: e.pitch + d.pitch, roll: e.roll + d.roll });
        expect(maxAbsDiff(reached, target)).toBeLessThan(1e-12);
      }
  });
});

describe('interpolation paths', () => {
  it('both methods start at a and end at b; slerp turns exactly the direct angle at a constant rate', () => {
    for (const { a, b } of Object.values(SLERP.presets)) {
      for (const m of ['slerp', 'euler'] as const) {
        expect(quat.angleBetween(orientationAt(m, a, b, 0), quat.fromMatrix(C(a)))).toBeLessThan(1e-7);
        expect(quat.angleBetween(orientationAt(m, a, b, 1), quat.fromMatrix(C(b)))).toBeLessThan(1e-7);
      }
      const s = interpPath('slerp', a, b);
      expect(s.total).toBeCloseTo(directAngle(a, b), 8);
      expect(s.rate[1] - s.rate[0]).toBeLessThan(1e-6);
      expect(interpPath('euler', a, b).total).toBeGreaterThanOrEqual(directAngle(a, b) - 1e-9);
    }
  });
  it('nose and top stay on the unit sphere', () => {
    const p = interpPath('euler', SLERP.presets.flip.a, SLERP.presets.flip.b);
    for (const v of [...p.nose, ...p.top]) expect(Math.hypot(...v)).toBeCloseTo(1, 12);
  });
});
