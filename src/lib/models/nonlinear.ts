/**
 * Test functions for uncertainty propagation (DESIGN §5.1 `models/`), each with its analytic Jacobian.
 * Used by post 04 (and again by the UKF in post 16).
 */
import { fromArrays, mulVec, vec, type Mat, type Vec } from '../math/matrix';

export interface VectorFunction {
  readonly id: string;
  readonly inDim: number;
  readonly outDim: number;
  f(x: Vec): Vec;
  /** Analytic Jacobian ∂f/∂x at x (outDim × inDim). */
  jacobian(x: Vec): Mat;
}

/** (r, θ) ↦ (r cos θ, r sin θ): a range-and-bearing reading turned into a position. */
export const polarToCartesian: VectorFunction = {
  id: 'polar',
  inDim: 2,
  outDim: 2,
  f: (x) => vec([x[0]! * Math.cos(x[1]!), x[0]! * Math.sin(x[1]!)]),
  jacobian: (x) => {
    const [r, t] = [x[0]!, x[1]!];
    return fromArrays([
      [Math.cos(t), -r * Math.sin(t)],
      [Math.sin(t), r * Math.cos(t)],
    ]);
  },
};

export const square: VectorFunction = {
  id: 'square',
  inDim: 1,
  outDim: 1,
  f: (x) => vec([x[0]! * x[0]!]),
  jacobian: (x) => fromArrays([[2 * x[0]!]]),
};

export const sine: VectorFunction = {
  id: 'sine',
  inDim: 1,
  outDim: 1,
  f: (x) => vec([Math.sin(x[0]!)]),
  jacobian: (x) => fromArrays([[Math.cos(x[0]!)]]),
};

/** A fixed linear map (rotate by 30° and stretch), for which linearization is exact. */
export const LINEAR_A = fromArrays([
  [1.3 * Math.cos(Math.PI / 6), -0.7 * Math.sin(Math.PI / 6)],
  [1.3 * Math.sin(Math.PI / 6), 0.7 * Math.cos(Math.PI / 6)],
]);

export const linearMap: VectorFunction = {
  id: 'linear',
  inDim: 2,
  outDim: 2,
  f: (x) => mulVec(LINEAR_A, x),
  jacobian: () => LINEAR_A,
};

/** Exact mean and variance of x² for x ~ N(μ, σ²). */
export function squareMoments(mu: number, sigma: number): { mean: number; variance: number } {
  const s2 = sigma * sigma;
  return { mean: mu * mu + s2, variance: 4 * mu * mu * s2 + 2 * s2 * s2 };
}

/** Exact mean and variance of sin x for x ~ N(μ, σ²). */
export function sineMoments(mu: number, sigma: number): { mean: number; variance: number } {
  const s2 = sigma * sigma;
  const mean = Math.sin(mu) * Math.exp(-s2 / 2);
  const second = 0.5 * (1 - Math.exp(-2 * s2) * Math.cos(2 * mu)); // E[sin² x]
  return { mean, variance: second - mean * mean };
}

/** Exact mean of (r cos θ, r sin θ) for independent r ~ N(μr, σr²), θ ~ N(μθ, σθ²). */
export function polarMean(muR: number, muT: number, sigmaT: number): [number, number] {
  const k = muR * Math.exp(-(sigmaT * sigmaT) / 2);
  return [k * Math.cos(muT), k * Math.sin(muT)];
}
