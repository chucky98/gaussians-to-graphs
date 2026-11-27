/** Planar rotations SO(2) (DESIGN §5.1): angle wrapping, point rotation, and the Lie-group operations. */
import { fromArrays, identity as eye, type Mat, type Vec } from '../math/matrix';
import type { LieGroup } from './lie';

/** Wrap an angle to (−π, π]. */
export function wrapAngle(a: number): number {
  if (!Number.isFinite(a)) return a;
  let w = a % (2 * Math.PI); // (−2π, 2π)
  if (w <= -Math.PI) w += 2 * Math.PI;
  else if (w > Math.PI) w -= 2 * Math.PI;
  return w;
}

/** Smallest signed difference a − b, wrapped to (−π, π]. */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(a - b);
}

/** Rotate the point (x, y) by angle θ. */
export function rotate(theta: number, x: number, y: number): [number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [c * x - s * y, s * x + c * y];
}

// ---------------------------------------------------------------- SO(2) as a Lie group (Post 21)

/** Rotation matrix C(θ) = [cos θ, −sin θ; sin θ, cos θ]. */
export function toMatrix(theta: number): Mat {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return fromArrays([
    [c, -s],
    [s, c],
  ]);
}

/** Angle of a 2 × 2 rotation matrix. */
export function fromMatrix(C: Mat): number {
  return Math.atan2(C.data[2]!, C.data[0]!);
}

/** θ^ = [0, −θ; θ, 0], the Lie algebra so(2). */
export function hat(theta: number): Mat {
  return fromArrays([
    [0, -theta],
    [theta, 0],
  ]);
}

/** Inverse of hat. */
export function vee(m: Mat): number {
  return m.data[2]!;
}

/**
 * SO(2) with elements stored as angles in (−π, π]. It is commutative, so its adjoint and both
 * Jacobians are the 1 × 1 identity.
 */
export const SO2: LieGroup<number> = {
  name: 'SO(2)',
  dof: 1,
  identity: () => 0,
  compose: (a, b) => wrapAngle(a + b),
  inverse: (a) => wrapAngle(-a),
  exp: (tau: Vec) => wrapAngle(tau[0]!),
  log: (a: number) => Float64Array.of(wrapAngle(a)),
  adjoint: () => eye(1),
  jr: () => eye(1),
  jl: () => eye(1),
  jrInv: () => eye(1),
  jlInv: () => eye(1),
};
