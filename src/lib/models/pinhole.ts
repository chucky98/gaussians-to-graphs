/**
 * The pinhole camera (Post 31). A camera with pose T_wc = (C, t) (camera-to-world: its axes and position in the
 * world) sees a world point p_w at camera coordinates p_c = Cᵀ (p_w − t), with z along the optical axis, x to
 * the right and y down. The point projects to the pixel
 *   u = f_x x/z + c_x,   v = f_y y/z + c_y,
 * with focal lengths (f_x, f_y) and principal point (c_x, c_y) in pixels.
 */
import * as se3 from '../geometry/se3';
import { fromArrays, mul, transpose, type Mat, type Vec } from '../math/matrix';

export interface Intrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
}

/** Camera coordinates of a world point. */
export function toCamera(T: se3.Pose3, pw: Vec | readonly number[]): Vec {
  return se3.act(se3.inverse(T), pw);
}

export function projectCamera(K: Intrinsics, pc: Vec): Vec {
  return Float64Array.of((K.fx * pc[0]!) / pc[2]! + K.cx, (K.fy * pc[1]!) / pc[2]! + K.cy);
}

export function project(K: Intrinsics, T: se3.Pose3, pw: Vec | readonly number[]): Vec {
  return projectCamera(K, toCamera(T, pw));
}

/**
 * Jacobians of the pixel with respect to a right perturbation of the camera pose, T ⊕ δ with δ = (ρ, θ), and
 * with respect to the world point. With p_c the camera coordinates, ∂p_c/∂δ = [−I, [p_c]×] and ∂p_c/∂p_w = Cᵀ;
 * the projection itself has ∂(u, v)/∂p_c = [f_x/z, 0, −f_x x/z²; 0, f_y/z, −f_y y/z²].
 */
export function projectJacobians(
  K: Intrinsics,
  T: se3.Pose3,
  pw: Vec | readonly number[],
): { dPose: Mat; dPoint: Mat } {
  const pc = toCamera(T, pw);
  const [x, y, z] = [pc[0]!, pc[1]!, pc[2]!];
  const P = fromArrays([
    [K.fx / z, 0, (-K.fx * x) / (z * z)],
    [0, K.fy / z, (-K.fy * y) / (z * z)],
  ]);
  const dPc = fromArrays([
    [-1, 0, 0, 0, -z, y],
    [0, -1, 0, z, 0, -x],
    [0, 0, -1, -y, x, 0],
  ]);
  return { dPose: mul(P, dPc), dPoint: mul(P, transpose(T.C)) };
}
