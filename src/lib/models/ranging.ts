/**
 * Range-only positioning (trilateration), post 09: a tag at unknown position x measures its distance
 * zᵢ to known anchors mᵢ. Residual rᵢ(x) = ‖x − mᵢ‖ − zᵢ; Jacobian row (x − mᵢ)ᵀ/‖x − mᵢ‖.
 */
import { zeros, type Mat, type Vec } from '../math/matrix';
import type { LsqProblem } from '../graph/solver';

export function rangeProblem(
  anchors: readonly [number, number][],
  ranges: readonly number[],
  sigma: number,
): LsqProblem {
  if (anchors.length !== ranges.length) throw new RangeError('one range per anchor');
  const w = Float64Array.from(anchors, () => 1 / (sigma * sigma));
  return {
    weights: w,
    residual: (x: Vec) => Float64Array.from(anchors, ([ax, ay], i) => Math.hypot(x[0]! - ax, x[1]! - ay) - ranges[i]!),
    jacobian: (x: Vec): Mat => {
      const J = zeros(anchors.length, 2);
      anchors.forEach(([ax, ay], i) => {
        const dx = x[0]! - ax;
        const dy = x[1]! - ay;
        const d = Math.max(Math.hypot(dx, dy), 1e-12);
        J.data[2 * i] = dx / d;
        J.data[2 * i + 1] = dy / d;
      });
      return J;
    },
  };
}
