/**
 * The operations every matrix Lie group in this series shares (DESIGN §5.1), written once for any group
 * that implements {@link LieGroup}. Conventions follow Solà, Deray, Atchuthan, "A micro Lie theory for
 * state estimation in robotics" (2018): right-⊕ and right-⊖, Jacobians defined by right perturbations,
 * and tangent vectors ordered translation first, rotation last (τ = (ρ, θ)).
 *
 *   X ⊕ τ = X ∘ Exp(τ)                       (2)
 *   Y ⊖ X = Log(X⁻¹ ∘ Y)                     (3)
 *   df/dX = lim_{τ→0} (f(X ⊕ τ) ⊖ f(X)) / τ  (the right Jacobian of f)
 */
import { add, identity as eye, mul, scale, transpose, type Mat, type Vec } from '../math/matrix';

export interface LieGroup<G> {
  readonly name: string;
  /** Degrees of freedom: the dimension of the tangent space. */
  readonly dof: number;
  identity(): G;
  compose(a: G, b: G): G;
  inverse(a: G): G;
  /** ℝⁿ → group. */
  exp(tau: Vec): G;
  /** group → ℝⁿ; the inverse of exp on its principal domain (rotation angle in (−π, π]). */
  log(g: G): Vec;
  /** Ad_X: maps a tangent vector at X to the tangent space at the identity, Exp(Ad_X τ) = X Exp(τ) X⁻¹. */
  adjoint(g: G): Mat;
  /** Right Jacobian: Exp(τ + δ) ≈ Exp(τ) Exp(J_r(τ) δ). */
  jr(tau: Vec): Mat;
  /** Left Jacobian: Exp(τ + δ) ≈ Exp(J_l(τ) δ) Exp(τ). */
  jl(tau: Vec): Mat;
  jrInv(tau: Vec): Mat;
  jlInv(tau: Vec): Mat;
}

export function scaleVec(v: Vec, s: number): Vec {
  return v.map((x) => x * s);
}

/** X ⊕ τ = X ∘ Exp(τ): move from X along τ, expressed in X's own (body) frame. */
export function oplus<G>(G: LieGroup<G>, X: G, tau: Vec): G {
  return G.compose(X, G.exp(tau));
}

/** Y ⊖ X = Log(X⁻¹ ∘ Y): the tangent vector at X that reaches Y, so that X ⊕ (Y ⊖ X) = Y. */
export function ominus<G>(G: LieGroup<G>, Y: G, X: G): Vec {
  return G.log(G.compose(G.inverse(X), Y));
}

/** Geodesic interpolation X ⊕ t (Y ⊖ X); t = 0 gives X, t = 1 gives Y. For SO(3) this is slerp. */
export function interpolate<G>(G: LieGroup<G>, X: G, Y: G, t: number): G {
  return oplus(G, X, scaleVec(ominus(G, Y, X), t));
}

/** Jacobians of X ∘ Y: d/dX = Ad_{Y⁻¹}, d/dY = I. */
export function composeJacobians<G>(G: LieGroup<G>, _X: G, Y: G): { dX: Mat; dY: Mat } {
  return { dX: G.adjoint(G.inverse(Y)), dY: eye(G.dof) };
}

/** Jacobian of X⁻¹ with respect to X: −Ad_X. */
export function inverseJacobian<G>(G: LieGroup<G>, X: G): Mat {
  return scale(G.adjoint(X), -1);
}

/** Jacobians of X ⊕ τ: d/dX = Ad_{Exp(τ)⁻¹}, d/dτ = J_r(τ). */
export function oplusJacobians<G>(G: LieGroup<G>, _X: G, tau: Vec): { dX: Mat; dTau: Mat } {
  return { dX: G.adjoint(G.inverse(G.exp(tau))), dTau: G.jr(tau) };
}

/** Jacobians of τ = Y ⊖ X: d/dY = J_r⁻¹(τ), d/dX = −J_l⁻¹(τ). */
export function ominusJacobians<G>(G: LieGroup<G>, Y: G, X: G): { dY: Mat; dX: Mat } {
  const tau = ominus(G, Y, X);
  return { dY: G.jrInv(tau), dX: scale(G.jlInv(tau), -1) };
}

/**
 * Covariance of Y = X ∘ Z for independent X = X̄ ⊕ δx and Z = Z̄ ⊕ δz with tangent covariances Px, Pz:
 * to first order δy = Ad_{Z̄⁻¹} δx + δz, so Py = Ad_{Z̄⁻¹} Px Ad_{Z̄⁻¹}ᵀ + Pz (Post 22).
 */
export function composeCovariance<G>(G: LieGroup<G>, Z: G, Px: Mat, Pz: Mat): Mat {
  const A = G.adjoint(G.inverse(Z));
  return add(mul(mul(A, Px), transpose(A)), Pz);
}
