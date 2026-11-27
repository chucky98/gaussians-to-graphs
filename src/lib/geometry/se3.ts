/**
 * Rigid motions in 3D, SE(3) (DESIGN §5.1; summarized in Post 21, used in Post 31). A pose is a rotation
 * C and a translation t, mapping body-frame points into the world: p_w = C p_b + t. Tangent vectors are
 * τ = (ρ, φ) ∈ ℝ⁶, translation part first. Closed forms follow Solà et al. (2018), App. D, and Barfoot
 * (2024), §7.1 (the block Q of the Jacobians).
 */
import { add, getBlock, mul, mulVec, scale, setBlock, sub, transpose, zeros, type Mat, type Vec } from '../math/matrix';
import type { LieGroup } from './lie';
import { qCoeffB, qCoeffC, sinc3 } from './series';
import * as so3 from './so3';

export interface Pose3 {
  /** 3 × 3 rotation. */
  C: Mat;
  /** Translation (length 3). */
  t: Vec;
}

const rho = (tau: Vec) => tau.subarray(0, 3);
const phi = (tau: Vec) => tau.subarray(3, 6);

export function identity(): Pose3 {
  return { C: so3.SO3.identity(), t: new Float64Array(3) };
}

export function compose(a: Pose3, b: Pose3): Pose3 {
  const t = mulVec(a.C, b.t);
  for (let i = 0; i < 3; i++) t[i]! += a.t[i]!;
  return { C: mul(a.C, b.C), t };
}

export function inverse(a: Pose3): Pose3 {
  const Ct = transpose(a.C);
  return { C: Ct, t: mulVec(Ct, a.t).map((v) => -v) };
}

export function act(a: Pose3, p: Vec | readonly number[]): Vec {
  const out = mulVec(a.C, Float64Array.from(p));
  for (let i = 0; i < 3; i++) out[i]! += a.t[i]!;
  return out;
}

/** Homogeneous 4 × 4 matrix [C t; 0 1]. */
export function toMatrix(a: Pose3): Mat {
  let m = zeros(4, 4);
  m = setBlock(m, 0, 0, a.C);
  for (let i = 0; i < 3; i++) m.data[i * 4 + 3] = a.t[i]!;
  m.data[15] = 1;
  return m;
}

/** τ^ = [φ^ ρ; 0 0], the Lie algebra se(3). */
export function hat(tau: Vec): Mat {
  let m = zeros(4, 4);
  m = setBlock(m, 0, 0, so3.hat(phi(tau)));
  for (let i = 0; i < 3; i++) m.data[i * 4 + 3] = tau[i]!;
  return m;
}

export function vee(m: Mat): Vec {
  const w = so3.vee(getBlock(m, 0, 0, 3, 3));
  return Float64Array.of(m.data[3]!, m.data[7]!, m.data[11]!, w[0]!, w[1]!, w[2]!);
}

/** Exp(τ) = (Exp(φ), J_l(φ) ρ). */
export function exp(tau: Vec): Pose3 {
  return { C: so3.exp(phi(tau)), t: mulVec(so3.jl(phi(tau)), rho(tau)) };
}

/** Log(T) = (J_l⁻¹(φ) t, φ) with φ = Log(C). */
export function log(T: Pose3): Vec {
  const p = so3.log(T.C);
  const r = mulVec(so3.jlInv(p), T.t);
  return Float64Array.of(r[0]!, r[1]!, r[2]!, p[0]!, p[1]!, p[2]!);
}

/** Ad_T = [C, [t]× C; 0, C]. */
export function adjoint(T: Pose3): Mat {
  let m = zeros(6, 6);
  m = setBlock(m, 0, 0, T.C);
  m = setBlock(m, 0, 3, mul(so3.hat(T.t), T.C));
  m = setBlock(m, 3, 3, T.C);
  return m;
}

/**
 * The 3 × 3 block Q(ρ, φ) of the SE(3) left Jacobian (Barfoot 2024, §7.1.5):
 * Q = ½ρ^ + a(φ^ρ^ + ρ^φ^ + φ^ρ^φ^) + b(φ^φ^ρ^ + ρ^φ^φ^ − 3φ^ρ^φ^) + c(φ^ρ^φ^φ^ + φ^φ^ρ^φ^)
 * with a = (θ − sin θ)/θ³, b = (θ² + 2cos θ − 2)/(2θ⁴), c = (2θ − 3 sin θ + θ cos θ)/(2θ⁵).
 */
export function qBlock(r: Vec, p: Vec): Mat {
  const t = Math.hypot(p[0]!, p[1]!, p[2]!);
  const R = so3.hat(r);
  const P = so3.hat(p);
  const PR = mul(P, R);
  const RP = mul(R, P);
  const PRP = mul(PR, P);
  const PPR = mul(P, PR);
  const RPP = mul(RP, P);
  const PRPP = mul(PRP, P);
  const PPRP = mul(P, PRP);
  let Q = scale(R, 0.5);
  Q = add(Q, scale(add(add(PR, RP), PRP), sinc3(t)));
  Q = add(Q, scale(sub(add(PPR, RPP), scale(PRP, 3)), qCoeffB(t)));
  Q = add(Q, scale(add(PRPP, PPRP), qCoeffC(t)));
  return Q;
}

/** J_l(τ) = [J_l(φ), Q(ρ, φ); 0, J_l(φ)]. */
export function jl(tau: Vec): Mat {
  const J = so3.jl(phi(tau));
  let m = zeros(6, 6);
  m = setBlock(m, 0, 0, J);
  m = setBlock(m, 0, 3, qBlock(rho(tau), phi(tau)));
  m = setBlock(m, 3, 3, J);
  return m;
}

/** J_l⁻¹(τ) = [J_l⁻¹, −J_l⁻¹ Q J_l⁻¹; 0, J_l⁻¹]. */
export function jlInv(tau: Vec): Mat {
  const Ji = so3.jlInv(phi(tau));
  const Q = qBlock(rho(tau), phi(tau));
  let m = zeros(6, 6);
  m = setBlock(m, 0, 0, Ji);
  m = setBlock(m, 0, 3, scale(mul(mul(Ji, Q), Ji), -1));
  m = setBlock(m, 3, 3, Ji);
  return m;
}

const neg = (tau: Vec) => tau.map((v) => -v);

/** J_r(τ) = J_l(−τ). */
export function jr(tau: Vec): Mat {
  return jl(neg(tau));
}

export function jrInv(tau: Vec): Mat {
  return jlInv(neg(tau));
}

/** Jacobians of T p: d/dT = [C, −C [p]×] (3 × 6), d/dp = C. */
export function actJacobians(T: Pose3, p: Vec | readonly number[]): { dT: Mat; dP: Mat } {
  let dT = zeros(3, 6);
  dT = setBlock(dT, 0, 0, T.C);
  dT = setBlock(dT, 0, 3, scale(mul(T.C, so3.hat(p)), -1));
  return { dT, dP: T.C };
}

export const SE3: LieGroup<Pose3> = {
  name: 'SE(3)',
  dof: 6,
  identity,
  compose,
  inverse,
  exp,
  log,
  adjoint,
  jr,
  jl,
  jrInv,
  jlInv,
};
