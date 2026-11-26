/**
 * The extended Kalman filter (post 15): the Kalman filter applied to nonlinear models by linearizing
 * them at the current estimate.
 *
 *   predict:  x̂⁻ = f(x̂, u),          P⁻ = F P Fᵀ + Q,   F = ∂f/∂x at (x̂, u)
 *   update:   ν = z ⊟ h(x̂⁻),  S = H P⁻ Hᵀ + R,  K = P⁻ Hᵀ S⁻¹,   H = ∂h/∂x at x̂⁻
 *             x̂ = x̂⁻ + K ν,   P = (I − K H) P⁻ (I − K H)ᵀ + K R Kᵀ
 *
 * `⊟` is the model's residual function (e.g. wrapping a bearing difference to (−π, π]). The update itself
 * is the linear one from `kf.ts`, applied to the linearized measurement.
 */
import { add, mul, symmetrize, transpose, vecAdd, type Mat, type Vec } from '../math/matrix';
import { kfUpdate, type KfState, type KfUpdate } from './kf';

export interface NonlinearMotion<U> {
  f: (x: Vec, u: U) => Vec;
  /** Jacobian ∂f/∂x at (x, u). */
  F: (x: Vec, u: U) => Mat;
  /** Process noise in state space at (x, u), e.g. V M Vᵀ for control noise. */
  Q: (x: Vec, u: U) => Mat;
  /** Optional normalization of the state after a step (e.g. wrapping a heading). */
  normalize?: (x: Vec) => Vec;
}

export interface NonlinearMeasurement {
  h: (x: Vec) => Vec;
  /** Jacobian ∂h/∂x at x. */
  H: (x: Vec) => Mat;
  R: Mat;
  /** Residual z ⊟ ẑ; defaults to plain subtraction. */
  residual?: (z: Vec, zHat: Vec) => Vec;
}

export function ekfPredict<U>(s: KfState, m: NonlinearMotion<U>, u: U): KfState {
  const F = m.F(s.x, u);
  const x = m.f(s.x, u);
  return { x: m.normalize ? m.normalize(x) : x, P: symmetrize(add(mul(mul(F, s.P), transpose(F)), m.Q(s.x, u))) };
}

/**
 * EKF update: linearize h at the prior mean, then apply the linear update to the residual. Writing the
 * linearized measurement as z_lin = H x̂⁻ + ν makes `kfUpdate` compute exactly the EKF formulas.
 */
export function ekfUpdate(
  s: KfState,
  z: Vec,
  m: NonlinearMeasurement,
  opts: { joseph?: boolean; normalize?: (x: Vec) => Vec } = {},
): KfUpdate {
  const H = m.H(s.x);
  const zHat = m.h(s.x);
  const nu = m.residual ? m.residual(z, zHat) : z.map((v, i) => v - zHat[i]!);
  // Pseudo-measurement whose linear innovation equals the nonlinear residual ν.
  const Hx = Float64Array.from({ length: H.rows }, (_, i) => {
    let acc = 0;
    for (let j = 0; j < H.cols; j++) acc += H.data[i * H.cols + j]! * s.x[j]!;
    return acc;
  });
  const u = kfUpdate(s, vecAdd(Hx, nu), { H, R: m.R }, { joseph: opts.joseph });
  if (opts.normalize) u.state.x = opts.normalize(u.state.x);
  return u;
}
