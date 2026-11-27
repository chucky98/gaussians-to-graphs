/**
 * Rotations in 3D, SO(3) (DESIGN §5.1, Posts 20–21). Elements are 3 × 3 rotation matrices C; tangent
 * vectors are rotation vectors φ = θ u (axis u, angle θ). Exp is Rodrigues' formula; Log goes through
 * the quaternion, which stays accurate near θ = 0 and θ = π. Euler angles use the aerospace yaw–pitch–roll
 * (Z–Y–X) sequence: C = R_z(ψ) R_y(θ) R_x(φ).
 */
import {
  add,
  fromArrays,
  identity as eye,
  inverse,
  maxAbsDiff,
  mul,
  mulVec,
  scale,
  transpose,
  type Mat,
  type Vec,
} from '../math/matrix';
import type { LieGroup } from './lie';
import * as quat from './quat';
import { cosc, jinvCoeff, sinc, sinc3 } from './series';

/** [v]× = v^: the skew-symmetric matrix with [v]× w = v × w. */
export function hat(v: Vec | readonly number[]): Mat {
  const [x, y, z] = [v[0]!, v[1]!, v[2]!];
  return fromArrays([
    [0, -z, y],
    [z, 0, -x],
    [-y, x, 0],
  ]);
}

export function vee(m: Mat): Vec {
  return Float64Array.of(m.data[7]!, m.data[2]!, m.data[3]!);
}

function polyInHat(phi: Vec, c1: number, c2: number): Mat {
  const K = hat(phi);
  return add(add(eye(3), scale(K, c1)), scale(mul(K, K), c2));
}

const angleOf = (phi: Vec) => Math.hypot(phi[0]!, phi[1]!, phi[2]!);

/** Exp(φ) = I + (sin θ/θ) [φ]× + ((1 − cos θ)/θ²) [φ]×², Rodrigues' rotation formula. */
export function exp(phi: Vec): Mat {
  const t = angleOf(phi);
  return polyInHat(phi, sinc(t), cosc(t));
}

/** Log(C): the rotation vector with angle in [0, π]. */
export function log(C: Mat): Vec {
  return quat.toRotationVector(quat.fromMatrix(C));
}

/** J_r(φ) = I − ((1 − cos θ)/θ²) [φ]× + ((θ − sin θ)/θ³) [φ]×². */
export function jr(phi: Vec): Mat {
  const t = angleOf(phi);
  return polyInHat(phi, -cosc(t), sinc3(t));
}

/** J_l(φ) = J_r(−φ) = I + ((1 − cos θ)/θ²) [φ]× + ((θ − sin θ)/θ³) [φ]×². */
export function jl(phi: Vec): Mat {
  const t = angleOf(phi);
  return polyInHat(phi, cosc(t), sinc3(t));
}

/** J_r⁻¹(φ) = I + ½ [φ]× + (1/θ² − (1 + cos θ)/(2θ sin θ)) [φ]×². */
export function jrInv(phi: Vec): Mat {
  return polyInHat(phi, 0.5, jinvCoeff(angleOf(phi)));
}

export function jlInv(phi: Vec): Mat {
  return polyInHat(phi, -0.5, jinvCoeff(angleOf(phi)));
}

/** C p. */
export function act(C: Mat, p: Vec | readonly number[]): Vec {
  return mulVec(C, Float64Array.from(p));
}

/** Jacobians of C p: d/dC = −C [p]× (right perturbation), d/dp = C. */
export function actJacobians(C: Mat, p: Vec | readonly number[]): { dC: Mat; dP: Mat } {
  return { dC: scale(mul(C, hat(p)), -1), dP: C };
}

/**
 * The rotation nearest to a matrix that has drifted after many products (the orthogonal factor of its
 * polar decomposition), by Newton's iteration X ← ½ (X + X⁻ᵀ), which converges quadratically.
 */
export function orthonormalize(C: Mat): Mat {
  let X = C;
  for (let i = 0; i < 20; i++) {
    const next = scale(add(X, transpose(inverse(X))), 0.5);
    const done = maxAbsDiff(next, X) < 1e-15;
    X = next;
    if (done) break;
  }
  return X;
}

export function rotX(a: number): Mat {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return fromArrays([
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ]);
}

export function rotY(a: number): Mat {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return fromArrays([
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ]);
}

export function rotZ(a: number): Mat {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return fromArrays([
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ]);
}

export interface EulerZYX {
  /** ψ, about the world z axis, in (−π, π]. */
  yaw: number;
  /** θ, about the once-rotated y axis, in [−π/2, π/2]. */
  pitch: number;
  /** φ, about the body x axis, in (−π, π]. */
  roll: number;
}

/** C = R_z(yaw) R_y(pitch) R_x(roll). */
export function fromEulerZYX(yaw: number, pitch: number, roll: number): Mat {
  return mul(mul(rotZ(yaw), rotY(pitch)), rotX(roll));
}

/**
 * Yaw, pitch and roll of C. At pitch = ±90° (gimbal lock) only yaw ∓ roll is determined; we then report
 * roll = 0 and put the whole rotation about the vertical into yaw.
 */
export function toEulerZYX(C: Mat, lockTol = 1e-9): EulerZYX {
  const d = C.data;
  const cp = Math.hypot(d[7]!, d[8]!); // |cos pitch|
  const pitch = Math.atan2(-d[6]!, cp);
  if (cp < lockTol) return { yaw: Math.atan2(-d[1]!, d[4]!), pitch, roll: 0 };
  return { yaw: Math.atan2(d[3]!, d[0]!), pitch, roll: Math.atan2(d[7]!, d[8]!) };
}

/**
 * The matrix E with ω_body = E (ψ̇, θ̇, φ̇): how fast the body actually turns, about its own axes,
 * when the three Euler angles change at the given rates. det E = −cos θ, so at pitch ±90° E loses a
 * rank: two of the three rates produce the same motion and one direction of turning is unreachable.
 */
export function eulerRatesToBodyZYX(pitch: number, roll: number): Mat {
  const [sp, cp, sr, cr] = [Math.sin(pitch), Math.cos(pitch), Math.sin(roll), Math.cos(roll)];
  return fromArrays([
    [-sp, 0, 1],
    [sr * cp, cr, 0],
    [cr * cp, -sr, 0],
  ]);
}

export const SO3: LieGroup<Mat> = {
  name: 'SO(3)',
  dof: 3,
  identity: () => eye(3),
  compose: (a, b) => mul(a, b),
  inverse: (a) => transpose(a),
  exp,
  log,
  adjoint: (C) => C,
  jr,
  jl,
  jrInv,
  jlInv,
};
