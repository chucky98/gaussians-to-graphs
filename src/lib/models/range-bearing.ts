/**
 * Range–bearing sensor (post 14): a lidar or camera on a robot at pose [x, y, θ] reports, for a
 * landmark m = (m_x, m_y), its distance r and its direction φ relative to the robot's heading:
 *   r = ‖m − p‖,   φ = atan2(m_y − y, m_x − x) − θ   (wrapped to (−π, π]).
 */
import { fromArrays, vec, type Mat, type Vec } from '../math/matrix';
import { wrapAngle } from '../geometry/so2';

export function rangeBearing(pose: Vec, m: Vec): Vec {
  const dx = m[0]! - pose[0]!;
  const dy = m[1]! - pose[1]!;
  return vec([Math.hypot(dx, dy), wrapAngle(Math.atan2(dy, dx) - pose[2]!)]);
}

/** Landmark position seen at (r, φ) from a pose: the inverse of the measurement. */
export function inverseRangeBearing(pose: Vec, z: Vec): Vec {
  const a = pose[2]! + z[1]!;
  return vec([pose[0]! + z[0]! * Math.cos(a), pose[1]! + z[0]! * Math.sin(a)]);
}

/** Jacobians of (r, φ) with respect to the pose (2 × 3) and to the landmark (2 × 2). */
export function rangeBearingJacobians(pose: Vec, m: Vec): { Hx: Mat; Hm: Mat } {
  const dx = m[0]! - pose[0]!;
  const dy = m[1]! - pose[1]!;
  const q = dx * dx + dy * dy;
  if (q === 0) throw new RangeError('rangeBearingJacobians: landmark at the sensor');
  const r = Math.sqrt(q);
  return {
    Hx: fromArrays([
      [-dx / r, -dy / r, 0],
      [dy / q, -dx / q, -1],
    ]),
    Hm: fromArrays([
      [dx / r, dy / r],
      [-dy / q, dx / q],
    ]),
  };
}
