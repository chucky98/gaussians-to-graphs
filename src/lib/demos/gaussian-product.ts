/**
 * Pure model behind the GaussianProduct widget (post 11): a predicted position and a position fix,
 * both Gaussian, and their normalized product (the Kalman update in one dimension).
 */
import { update1 } from '../filters/kf1d';

export interface ProductParams {
  /** Prediction: mean and standard deviation (m). */
  mu1: number;
  s1: number;
  /** Reading z and its standard deviation √R (m). */
  mu2: number;
  s2: number;
}

export const PRODUCT_DEFAULTS: ProductParams = { mu1: 12, s1: 0.5, mu2: 12.8, s2: 0.3 };

export const PRODUCT_LIMITS = {
  mu: { min: 9, max: 17, step: 0.05 },
  sigma: { min: 0.15, max: 2, step: 0.01 },
  xDomain: [8, 18] as [number, number],
};

export interface ProductResult {
  /** Gain K = σ₁²/(σ₁² + σ₂²). */
  K: number;
  mean: number;
  sigma: number;
}

/** Posterior of the 1D Kalman update: prediction N(μ₁, σ₁²) times likelihood N(z, σ₂²), normalized. */
export function combine(p: ProductParams): ProductResult {
  const u = update1({ x: p.mu1, P: p.s1 * p.s1 }, p.mu2, p.s2 * p.s2);
  return { K: u.K, mean: u.state.x, sigma: Math.sqrt(u.state.P) };
}

/** Smallest "nice" y-axis top that fits all three peaks with a little headroom. */
export function yTop(p: ProductParams): number {
  return densityTop(Math.min(p.s1, p.s2, combine(p).sigma));
}

export const clampTo = (v: number, lim: { min: number; max: number; step: number }) =>
  Math.round(Math.min(lim.max, Math.max(lim.min, v)) / lim.step) * lim.step;

/** Nice y-axis top for densities whose narrowest standard deviation is `minSigma`. */
export function densityTop(minSigma: number): number {
  const peak = 1 / (minSigma * Math.sqrt(2 * Math.PI));
  const levels = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return levels.find((l) => l >= 1.1 * peak) ?? levels[levels.length - 1]!;
}
