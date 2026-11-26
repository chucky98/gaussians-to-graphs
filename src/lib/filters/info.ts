/**
 * The information filter (post 19): the Kalman filter written in terms of the information matrix
 * Ω = P⁻¹ and the information vector ξ = Ω x̂.
 *
 *   update:   Ω ← Ω + Hᵀ R⁻¹ H,   ξ ← ξ + Hᵀ R⁻¹ z                (additive and cheap)
 *   predict:  Ω⁻ = (F Ω⁻¹ Fᵀ + Q)⁻¹,  ξ⁻ = Ω⁻ (F Ω⁻¹ ξ + B u)     (needs inverses: expensive)
 */
import {
  add,
  cholesky,
  inverse,
  mul,
  mulVec,
  solveCholesky,
  symmetrize,
  transpose,
  vecAdd,
  type Mat,
  type Vec,
} from '../math/matrix';
import type { KfState, MeasurementModel, MotionModel } from './kf';

export interface InfoState {
  Omega: Mat;
  xi: Vec;
}

export function toInfo(s: KfState): InfoState {
  const Omega = inverse(s.P, { spd: true });
  return { Omega, xi: mulVec(Omega, s.x) };
}

export function fromInfo(i: InfoState): KfState {
  const L = cholesky(i.Omega);
  return { x: solveCholesky(L, i.xi), P: symmetrize(inverse(i.Omega, { spd: true })) };
}

export function infoUpdate(i: InfoState, z: Vec, m: MeasurementModel): InfoState {
  const HtRi = mul(transpose(m.H), inverse(m.R, { spd: true }));
  return { Omega: symmetrize(add(i.Omega, mul(HtRi, m.H))), xi: vecAdd(i.xi, mulVec(HtRi, z)) };
}

export function infoPredict(i: InfoState, m: MotionModel, u?: Vec): InfoState {
  const L = cholesky(i.Omega);
  const x = solveCholesky(L, i.xi);
  const P = inverse(i.Omega, { spd: true });
  let xp = mulVec(m.F, x);
  if (m.B && u) xp = vecAdd(xp, mulVec(m.B, u));
  const Omega = symmetrize(inverse(add(mul(mul(m.F, P), transpose(m.F)), m.Q), { spd: true }));
  return { Omega, xi: mulVec(Omega, xp) };
}
