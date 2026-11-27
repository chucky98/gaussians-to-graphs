/**
 * The pure models behind Post 20's widgets: EulerGimbal (three gimbal rings driven by yaw, pitch and
 * roll) and QuaternionSlerp (slerp vs. naive Euler-angle interpolation between two orientations).
 * Angles in the public API are in degrees, because that is what the sliders show.
 */
import { angleDiff } from '../geometry/so2';
import * as quat from '../geometry/quat';
import * as so3 from '../geometry/so3';
import { mul, type Mat } from '../math/matrix';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export type Vec3 = [number, number, number];
export interface Euler {
  yaw: number;
  pitch: number;
  roll: number;
}

// ---------------------------------------------------------------- EulerGimbal

export const GIMBAL = {
  /** Default angles (degrees). */
  defaults: { yaw: 30, pitch: 30, roll: 20 } satisfies Euler,
  presets: {
    default: { yaw: 30, pitch: 30, roll: 20 },
    near: { yaw: 30, pitch: 80, roll: 20 },
    lock: { yaw: 30, pitch: 90, roll: 20 },
  } satisfies Record<string, Euler>,
  /** Size of the test turn about each body axis (degrees). */
  nudge: 5,
} as const;

export type GimbalPreset = keyof typeof GIMBAL.presets;

const col = (C: Mat, j: number): Vec3 => [C.data[j]!, C.data[3 + j]!, C.data[6 + j]!];

export interface GimbalState {
  /** Orientation of the body: R_z(yaw) R_y(pitch) R_x(roll). */
  C: Mat;
  /** Orientations of the yaw, pitch and roll rings (the roll ring carries the body). */
  rings: { yaw: quat.Quat; pitch: quat.Quat; roll: quat.Quat };
  /** World-frame rotation axes of the three rings. */
  axes: { yaw: Vec3; pitch: Vec3; roll: Vec3 };
  /** Angle between the yaw axis and the roll axis, degrees: 90° − |pitch|. */
  yawRollGap: number;
  /** Singular values of the Euler-rate matrix E, largest first: 1 + … ≥ 1 ≥ √(1 − |sin pitch|). */
  singular: Vec3;
}

export function gimbal(e: Euler): GimbalState {
  const [y, p, r] = [e.yaw * RAD, e.pitch * RAD, e.roll * RAD];
  const Cy = so3.rotZ(y);
  const Cyp = mul(Cy, so3.rotY(p));
  const C = mul(Cyp, so3.rotX(r));
  const roll = col(C, 0);
  const s = Math.abs(Math.sin(p));
  return {
    C,
    rings: { yaw: quat.fromMatrix(Cy), pitch: quat.fromMatrix(Cyp), roll: quat.fromMatrix(C) },
    axes: { yaw: [0, 0, 1], pitch: col(Cy, 1), roll },
    yawRollGap: Math.acos(Math.min(1, Math.abs(roll[2]))) * DEG,
    singular: [Math.sqrt(1 + s), 1, Math.sqrt(Math.max(0, 1 - s))],
  };
}

/**
 * How much the three Euler angles must change for the body to turn by `deg` about one of its own axes
 * (x: nose, y: left wing, z: up). Away from gimbal lock this is about `deg` spread over the angles; near
 * lock it blows up, because a turn about the body's z axis then needs yaw and roll to swing far in
 * opposite directions.
 */
export function eulerChangeForTurn(e: Euler, axis: 'x' | 'y' | 'z', deg = GIMBAL.nudge): Euler {
  const C = gimbal(e).C;
  const a = deg * RAD;
  const turn = axis === 'x' ? so3.rotX(a) : axis === 'y' ? so3.rotY(a) : so3.rotZ(a);
  const r = so3.toEulerZYX(mul(C, turn));
  const after = { yaw: r.yaw * DEG, pitch: r.pitch * DEG, roll: r.roll * DEG };
  const sgn = Math.sign(after.pitch);
  if (Math.abs(Math.cos(r.pitch)) < 1e-9) {
    // Still at lock: only d = yaw − sgn·roll is defined. Keep yaw where it was and put the change into
    // roll (the turn about the nose), the smallest continuation of the current slider positions.
    const d = after.yaw - sgn * after.roll;
    const roll = sgn * (e.yaw - d);
    return { yaw: 0, pitch: after.pitch - e.pitch, roll: angleDiff(roll * RAD, e.roll * RAD) * DEG };
  }
  return {
    yaw: angleDiff(after.yaw * RAD, e.yaw * RAD) * DEG,
    pitch: after.pitch - e.pitch,
    roll: angleDiff(after.roll * RAD, e.roll * RAD) * DEG,
  };
}

// ---------------------------------------------------------------- QuaternionSlerp

export const SLERP = {
  presets: {
    flip: { a: { yaw: 0, pitch: 0, roll: 0 }, b: { yaw: 180, pitch: 0, roll: 180 } },
    wrap: { a: { yaw: 170, pitch: 0, roll: 0 }, b: { yaw: -170, pitch: 0, roll: 0 } },
    small: { a: { yaw: 0, pitch: 0, roll: 0 }, b: { yaw: 30, pitch: 20, roll: 10 } },
  } satisfies Record<string, { a: Euler; b: Euler }>,
  /** Samples along each path. */
  samples: 240,
} as const;

export type SlerpPreset = keyof typeof SLERP.presets;
export type Method = 'slerp' | 'euler';

const qOf = (e: Euler) => quat.fromEulerZYX(e.yaw * RAD, e.pitch * RAD, e.roll * RAD);

/** Orientation at parameter t ∈ [0, 1] between a and b. */
export function orientationAt(method: Method, a: Euler, b: Euler, t: number, longWay = false): quat.Quat {
  if (method === 'slerp') return quat.slerp(qOf(a), qOf(b), t, { shortest: !longWay });
  // Naive: interpolate the three numbers. No wrapping: going from yaw 170° to −170° sweeps through 0°.
  const lerp = (u: number, v: number) => u + t * (v - u);
  return qOf({ yaw: lerp(a.yaw, b.yaw), pitch: lerp(a.pitch, b.pitch), roll: lerp(a.roll, b.roll) });
}

export interface InterpPath {
  /** Orientations at t = i / samples. */
  q: quat.Quat[];
  /** Tip of the body's x axis (nose) and z axis (top) on the unit sphere. */
  nose: Vec3[];
  top: Vec3[];
  /** Total angle turned along the path (degrees): the sum of the angles between consecutive samples. */
  total: number;
  /** Smallest and largest turning rate along the path, degrees per unit t. */
  rate: [number, number];
}

export function interpPath(method: Method, a: Euler, b: Euler, longWay = false, n: number = SLERP.samples): InterpPath {
  const q: quat.Quat[] = [];
  for (let i = 0; i <= n; i++) q.push(orientationAt(method, a, b, i / n, longWay));
  let total = 0;
  let lo = Infinity;
  let hi = 0;
  for (let i = 1; i <= n; i++) {
    const d = quat.angleBetween(q[i - 1]!, q[i]!) * DEG;
    total += d;
    lo = Math.min(lo, d * n);
    hi = Math.max(hi, d * n);
  }
  return {
    q,
    nose: q.map((r) => quat.rotate(r, [1, 0, 0])),
    top: q.map((r) => quat.rotate(r, [0, 0, 1])),
    total,
    rate: [lo, hi],
  };
}

/** The angle of the single rotation that takes a to b (degrees): what slerp turns, the minimum possible. */
export function directAngle(a: Euler, b: Euler): number {
  return quat.angleBetween(qOf(a), qOf(b)) * DEG;
}
