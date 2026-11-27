/**
 * Planar poses SE(2) as (x, y, θ) (DESIGN §5.1): compose, inverse, act, between, and the Lie-group
 * operations of Post 21 (hat/vee, Exp/Log, adjoint, right and left Jacobians, Jacobians of act).
 *
 * A pose T = (x, y, θ) maps points from its body frame into the world: p_w = C(θ) p_b + t.
 * Tangent vectors are τ = (ρ₁, ρ₂, θ): translation part first, rotation last (Solà et al. 2018).
 */
import { fromArrays, inverse as matInverse, type Mat, type Vec } from '../math/matrix';
import type { LieGroup } from './lie';
import { cosc, sinc, sinc3 } from './series';
import { rotate, wrapAngle } from './so2';

export interface Pose2 {
  x: number;
  y: number;
  /** Heading in (−π, π]. */
  theta: number;
}

export const identity: Pose2 = Object.freeze({ x: 0, y: 0, theta: 0 });

export function pose(x: number, y: number, theta: number): Pose2 {
  return { x, y, theta: wrapAngle(theta) };
}

/** a ∘ b: first a, then b expressed in a's frame. */
export function compose(a: Pose2, b: Pose2): Pose2 {
  const [dx, dy] = rotate(a.theta, b.x, b.y);
  return { x: a.x + dx, y: a.y + dy, theta: wrapAngle(a.theta + b.theta) };
}

export function inverse(a: Pose2): Pose2 {
  const [x, y] = rotate(-a.theta, -a.x, -a.y);
  return { x, y, theta: wrapAngle(-a.theta) };
}

/** Transform a body-frame point into the world frame. */
export function act(a: Pose2, p: [number, number]): [number, number] {
  const [x, y] = rotate(a.theta, p[0], p[1]);
  return [a.x + x, a.y + y];
}

/** Relative pose of b in a's frame: a⁻¹ ∘ b (so that a ∘ between(a, b) = b). */
export function between(a: Pose2, b: Pose2): Pose2 {
  return compose(inverse(a), b);
}

// ---------------------------------------------------------------- SE(2) as a Lie group (Post 21)

/** Homogeneous 3 × 3 matrix [C t; 0 1]. */
export function toMatrix(a: Pose2): Mat {
  const c = Math.cos(a.theta);
  const s = Math.sin(a.theta);
  return fromArrays([
    [c, -s, a.x],
    [s, c, a.y],
    [0, 0, 1],
  ]);
}

export function fromMatrix(m: Mat): Pose2 {
  return pose(m.data[2]!, m.data[5]!, Math.atan2(m.data[3]!, m.data[0]!));
}

/** τ^ = [θ^ ρ; 0 0], the Lie algebra se(2). */
export function hat(tau: Vec): Mat {
  const [r1, r2, th] = [tau[0]!, tau[1]!, tau[2]!];
  return fromArrays([
    [0, -th, r1],
    [th, 0, r2],
    [0, 0, 0],
  ]);
}

export function vee(m: Mat): Vec {
  return Float64Array.of(m.data[2]!, m.data[5]!, m.data[3]!);
}

/**
 * The matrix V(θ) = [sin θ/θ, −(1 − cos θ)/θ; (1 − cos θ)/θ, sin θ/θ] that turns the tangent translation ρ
 * into the actual translation t = V(θ) ρ: the chord of the arc driven at constant twist.
 */
export function vMatrix(theta: number): [number, number, number, number] {
  const a = sinc(theta);
  const b = theta * cosc(theta);
  return [a, -b, b, a];
}

/** Exp(τ): drive with constant body velocity (ρ₁, ρ₂) and turn rate θ for unit time. */
export function exp(tau: Vec): Pose2 {
  const th = tau[2]!;
  const [a, mb, b] = vMatrix(th);
  return { x: a * tau[0]! + mb * tau[1]!, y: b * tau[0]! + a * tau[1]!, theta: wrapAngle(th) };
}

/** Log(T): the constant twist that reaches T in unit time, with θ in (−π, π]. */
export function log(T: Pose2): Vec {
  const th = wrapAngle(T.theta);
  const a = sinc(th);
  const b = th * cosc(th);
  const d = a * a + b * b; // = det V > 0 for |θ| < 2π
  return Float64Array.of((a * T.x + b * T.y) / d, (-b * T.x + a * T.y) / d, th);
}

/** Ad_T = [C, (y, −x)ᵀ; 0, 1]. */
export function adjoint(T: Pose2): Mat {
  const c = Math.cos(T.theta);
  const s = Math.sin(T.theta);
  return fromArrays([
    [c, -s, T.y],
    [s, c, -T.x],
    [0, 0, 1],
  ]);
}

/** Right Jacobian J_r(τ) of SE(2) (Solà et al. 2018, eq. 163). */
export function jr(tau: Vec): Mat {
  const [r1, r2, th] = [tau[0]!, tau[1]!, tau[2]!];
  const a = sinc(th);
  const b = th * cosc(th); // (1 − cos θ)/θ
  const c = th * sinc3(th); // (θ − sin θ)/θ²
  const d = cosc(th); // (1 − cos θ)/θ²
  return fromArrays([
    [a, b, r1 * c - r2 * d],
    [-b, a, r1 * d + r2 * c],
    [0, 0, 1],
  ]);
}

/** Left Jacobian J_l(τ) of SE(2) (Solà et al. 2018, eq. 164). */
export function jl(tau: Vec): Mat {
  const [r1, r2, th] = [tau[0]!, tau[1]!, tau[2]!];
  const a = sinc(th);
  const b = th * cosc(th);
  const c = th * sinc3(th);
  const d = cosc(th);
  return fromArrays([
    [a, -b, r1 * c + r2 * d],
    [b, a, -r1 * d + r2 * c],
    [0, 0, 1],
  ]);
}

/**
 * Jacobians of p_w = T · p (a body-frame point mapped into the world):
 * d/dT = [C, C [1]× p] (2 × 3, with [1]× p = (−p₂, p₁)), d/dp = C (2 × 2).
 */
export function actJacobians(T: Pose2, p: [number, number]): { dT: Mat; dP: Mat } {
  const c = Math.cos(T.theta);
  const s = Math.sin(T.theta);
  const [qx, qy] = [-p[1], p[0]];
  return {
    dT: fromArrays([
      [c, -s, c * qx - s * qy],
      [s, c, s * qx + c * qy],
    ]),
    dP: fromArrays([
      [c, -s],
      [s, c],
    ]),
  };
}

export const SE2: LieGroup<Pose2> = {
  name: 'SE(2)',
  dof: 3,
  identity: () => ({ x: 0, y: 0, theta: 0 }),
  compose,
  inverse,
  exp,
  log,
  adjoint,
  jr,
  jl,
  jrInv: (tau) => matInverse(jr(tau)),
  jlInv: (tau) => matInverse(jl(tau)),
};
