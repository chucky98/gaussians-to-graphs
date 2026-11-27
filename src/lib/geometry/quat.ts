/**
 * Unit quaternions (DESIGN §5.1, Post 20), Hamilton convention, stored as [w, x, y, z] with the scalar
 * first. A unit quaternion q = (cos(θ/2), sin(θ/2) u) rotates by angle θ about the unit axis u; q and −q
 * are the same rotation (the double cover), so functions that return a quaternion pick w ≥ 0.
 */
import { fromArrays, type Mat, type Vec } from '../math/matrix';
import { sinc } from './series';

export type Quat = readonly [w: number, x: number, y: number, z: number];

export const identity: Quat = Object.freeze([1, 0, 0, 0]) as Quat;

/** Hamilton product p ⊗ q: first rotate by q, then by p (like the matrix product C_p C_q). */
export function mul(p: Quat, q: Quat): Quat {
  const [pw, px, py, pz] = p;
  const [qw, qx, qy, qz] = q;
  return [
    pw * qw - px * qx - py * qy - pz * qz,
    pw * qx + px * qw + py * qz - pz * qy,
    pw * qy - px * qz + py * qw + pz * qx,
    pw * qz + px * qy - py * qx + pz * qw,
  ];
}

export function conj(q: Quat): Quat {
  return [q[0], -q[1], -q[2], -q[3]];
}

export function dot(p: Quat, q: Quat): number {
  return p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3];
}

export function norm(q: Quat): number {
  return Math.hypot(q[0], q[1], q[2], q[3]);
}

export function normalize(q: Quat): Quat {
  const n = norm(q);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** The representative with w ≥ 0 (same rotation). */
export function canonical(q: Quat): Quat {
  return q[0] < 0 ? [-q[0], -q[1], -q[2], -q[3]] : q;
}

/** Exp: rotation vector φ = θ u (axis times angle) → unit quaternion (cos(θ/2), sin(θ/2) u). */
export function fromRotationVector(phi: Vec | readonly number[]): Quat {
  const t = Math.hypot(phi[0]!, phi[1]!, phi[2]!);
  const k = 0.5 * sinc(t / 2); // sin(θ/2)/θ, finite at θ = 0
  return [Math.cos(t / 2), k * phi[0]!, k * phi[1]!, k * phi[2]!];
}

/** Log: unit quaternion → rotation vector with angle in [0, π] (uses the representative with w ≥ 0). */
export function toRotationVector(q: Quat): Vec {
  const [w, x, y, z] = canonical(q);
  const n = Math.hypot(x, y, z);
  // θ = 2 atan2(n, w); the factor θ/n tends to 2/w as n → 0.
  const k = n < 1e-8 ? (2 / w) * (1 - (n * n) / (3 * w * w)) : (2 * Math.atan2(n, w)) / n;
  return Float64Array.of(k * x, k * y, k * z);
}

/** Rotation angle of q in [0, π]. */
export function angle(q: Quat): number {
  const [w, x, y, z] = canonical(q);
  return 2 * Math.atan2(Math.hypot(x, y, z), w);
}

/** Angle of the rotation that takes p to q, in [0, π]. */
export function angleBetween(p: Quat, q: Quat): number {
  return angle(mul(conj(p), q));
}

export function toMatrix(q: Quat): Mat {
  const [w, x, y, z] = q;
  return fromArrays([
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ]);
}

/** Rotation matrix → unit quaternion (Shepperd's method: divide by the largest of four candidates). */
export function fromMatrix(C: Mat): Quat {
  const d = C.data;
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = [d[0]!, d[1]!, d[2]!, d[3]!, d[4]!, d[5]!, d[6]!, d[7]!, d[8]!];
  const tr = m00 + m11 + m22;
  let q: Quat;
  if (tr > 0) {
    const s = 2 * Math.sqrt(tr + 1);
    q = [s / 4, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [(m21 - m12) / s, s / 4, (m01 + m10) / s, (m02 + m20) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m02 - m20) / s, (m01 + m10) / s, s / 4, (m12 + m21) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, s / 4];
  }
  return canonical(normalize(q));
}

/** Rotate a vector: q ⊗ (0, v) ⊗ q*. */
export function rotate(q: Quat, v: readonly [number, number, number]): [number, number, number] {
  const r = mul(mul(q, [0, v[0], v[1], v[2]]), conj(q));
  return [r[1], r[2], r[3]];
}

/**
 * Spherical linear interpolation: q₀ ⊗ Exp(t · Log(q₀* ⊗ q₁)). The rotation turns at a constant rate about
 * a fixed axis. By default it takes the shorter way round: q₁ and −q₁ are the same rotation, and the one
 * with q₀ · q₁ ≥ 0 is used. With `shortest: false` the quaternions are used as given, so when q₀ · q₁ < 0
 * the path turns the long way, through an angle 2π − θ.
 */
export function slerp(q0: Quat, q1: Quat, t: number, opts: { shortest?: boolean } = {}): Quat {
  const rel = mul(conj(q0), q1);
  let phi: Vec;
  if (opts.shortest === false) {
    const n = Math.hypot(rel[1], rel[2], rel[3]);
    const k = n < 1e-12 ? (rel[0] > 0 ? 2 : 0) : (2 * Math.atan2(n, rel[0])) / n; // angle in [0, 2π]
    phi = Float64Array.of(k * rel[1], k * rel[2], k * rel[3]);
  } else phi = toRotationVector(rel);
  return normalize(mul(q0, fromRotationVector(phi.map((v) => v * t))));
}

/** Normalized linear interpolation: blend the four numbers, then normalize (not constant speed). */
export function nlerp(q0: Quat, q1: Quat, t: number): Quat {
  const s = dot(q0, q1) < 0 ? -1 : 1;
  return normalize([
    (1 - t) * q0[0] + t * s * q1[0],
    (1 - t) * q0[1] + t * s * q1[1],
    (1 - t) * q0[2] + t * s * q1[2],
    (1 - t) * q0[3] + t * s * q1[3],
  ]);
}

/** Quaternion of the yaw–pitch–roll (Z–Y–X) Euler angles: C = R_z(yaw) R_y(pitch) R_x(roll). */
export function fromEulerZYX(yaw: number, pitch: number, roll: number): Quat {
  const qz: Quat = [Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)];
  const qy: Quat = [Math.cos(pitch / 2), 0, Math.sin(pitch / 2), 0];
  const qx: Quat = [Math.cos(roll / 2), Math.sin(roll / 2), 0, 0];
  return mul(mul(qz, qy), qx);
}
