/**
 * Planar poses SE(2) as (x, y, θ) (DESIGN §5.1). Phase 1 subset: compose, inverse, act, between.
 * Exp/Log, ⊕/⊖ and Jacobians arrive with Part 3 (post 21).
 *
 * A pose T = (x, y, θ) maps points from its body frame into the world: p_w = C(θ) p_b + t.
 */
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
