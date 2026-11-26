/**
 * Filter consistency checks (post 13): NEES and NIS with chi-square bounds.
 *
 * NEES  ε_k = (x̂_k − x_k)ᵀ P_k⁻¹ (x̂_k − x_k)  needs the true state (simulation only); for a consistent
 *        filter it is χ² with n_x degrees of freedom.
 * NIS   ε_{ν,k} = ν_kᵀ S_k⁻¹ ν_k  needs only the filter's own innovations; χ² with n_z dof.
 * Averages: over M independent runs, M·ε̄_k ~ χ²_{M n}. Over K time steps of one run, the innovations
 * of an optimal filter are white, so K·(time-average NIS) ~ χ²_{K n_z}.
 */
import { cholesky, solveCholesky, vecSub, dot, type Mat, type Vec } from '../math/matrix';
import { chi2Quantile } from '../math/stats';

/** Normalized estimation error squared (x̂ − x)ᵀ P⁻¹ (x̂ − x). */
export function nees(xHat: Vec, P: Mat, xTrue: Vec): number {
  const e = vecSub(xHat, xTrue);
  return dot(e, solveCholesky(cholesky(P), e));
}

/** Normalized innovation squared νᵀ S⁻¹ ν. */
export function nis(nu: Vec, S: Mat): number {
  return dot(nu, solveCholesky(cholesky(S), nu));
}

/**
 * Two-sided chi-square bounds for the average of `count` independent χ²_dof variables:
 * the average lies in [lo, hi] with probability `prob` when the filter is consistent.
 */
export function averageBounds(dof: number, count: number, prob = 0.95): { lo: number; hi: number } {
  if (!(dof > 0) || !(count >= 1)) throw new RangeError('averageBounds: need dof > 0 and count ≥ 1');
  const a = (1 - prob) / 2;
  const n = dof * count;
  return { lo: chi2Quantile(a, n) / count, hi: chi2Quantile(1 - a, n) / count };
}

export type Verdict = 'consistent' | 'overconfident' | 'underconfident';

/**
 * Classify a sequence of averaged statistics against their bounds: if most values are above the upper
 * bound the filter is overconfident (its covariance is too small); if most are below the lower bound,
 * underconfident; otherwise consistent. `share` is the fraction needed (default one half).
 */
export function verdict(values: readonly number[], b: { lo: number; hi: number }, share = 0.5): Verdict {
  const above = values.filter((v) => v > b.hi).length / values.length;
  const below = values.filter((v) => v < b.lo).length / values.length;
  if (above > share) return 'overconfident';
  if (below > share) return 'underconfident';
  return 'consistent';
}

/** Fraction of values inside [lo, hi]. */
export function fractionInside(values: readonly number[], b: { lo: number; hi: number }): number {
  return values.filter((v) => v >= b.lo && v <= b.hi).length / values.length;
}
