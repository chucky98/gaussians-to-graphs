/**
 * Linear models for the Kalman filter (post 12).
 * State ordering for `dim` spatial dimensions: [p_1 … p_dim, v_1 … v_dim].
 */
import { fromArrays, type Mat } from '../math/matrix';
import type { LinearModel } from '../filters/kf';

/**
 * Constant-velocity motion with white-noise acceleration of spectral density q (m²/s³) over a step
 * dt: F = [[I, dt I], [0, I]],  Q = q [[dt³/3 I, dt²/2 I], [dt²/2 I, dt I]].
 * Over one step the velocity changes by a random amount with variance q dt.
 */
export function constantVelocity(dim: number, dt: number, q: number): { F: Mat; Q: Mat } {
  if (!(dim >= 1) || !(dt > 0) || !(q >= 0)) throw new RangeError('constantVelocity: bad arguments');
  const n = 2 * dim;
  const F: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const Q: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let d = 0; d < dim; d++) {
    F[d]![dim + d] = dt;
    Q[d]![d] = (q * dt ** 3) / 3;
    Q[d]![dim + d] = (q * dt ** 2) / 2;
    Q[dim + d]![d] = (q * dt ** 2) / 2;
    Q[dim + d]![dim + d] = q * dt;
  }
  return { F: fromArrays(F), Q: fromArrays(Q) };
}

/** Position-only sensor for a constant-velocity state: H = [I 0], R = σ² I. */
export function positionSensor(dim: number, sigma: number): { H: Mat; R: Mat } {
  if (!(sigma > 0)) throw new RangeError('positionSensor: sigma must be positive');
  const H = Array.from({ length: dim }, (_, i) => Array.from({ length: 2 * dim }, (_, j) => (i === j ? 1 : 0)));
  const R = Array.from({ length: dim }, (_, i) => Array.from({ length: dim }, (_, j) => (i === j ? sigma * sigma : 0)));
  return { H: fromArrays(H), R: fromArrays(R) };
}

export function cvModel(dim: number, dt: number, q: number, sigma: number): LinearModel {
  return { ...constantVelocity(dim, dt, q), ...positionSensor(dim, sigma) };
}
