/** Planar rotations (DESIGN §5.1). Phase 1 subset: angle wrapping and point rotation. */

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
