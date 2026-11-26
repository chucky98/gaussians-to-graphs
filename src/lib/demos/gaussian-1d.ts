/** Pure model behind the Gaussian1D widget (post 02). */
import { pdf1 } from '../math/gaussian';
import { probWithinSigma } from '../math/stats';

export const GAUSSIAN_1D_DEFAULTS = { mu: 0, sigma: 1 } as const;
export const GAUSSIAN_1D_LIMITS = {
  mu: { min: -3, max: 3, step: 0.1 },
  sigma: { min: 0.4, max: 2.5, step: 0.05 },
  xDomain: [-8, 8] as [number, number],
  yDomain: [0, 1.05] as [number, number],
} as const;

export interface Band {
  k: 1 | 2 | 3;
  lo: number;
  hi: number;
  /** P(|x − μ| ≤ kσ), independent of μ and σ. */
  prob: number;
}

export function bands(mu: number, sigma: number): Band[] {
  return ([1, 2, 3] as const).map((k) => ({ k, lo: mu - k * sigma, hi: mu + k * sigma, prob: probWithinSigma(k) }));
}

/** Peak density 1/(σ√(2π)). */
export function peak(sigma: number): number {
  return 1 / (sigma * Math.sqrt(2 * Math.PI));
}

/** Sampled density curve on [lo, hi]. */
export function curve(mu: number, sigma: number, lo: number, hi: number, n = 241): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const x = lo + ((hi - lo) * i) / (n - 1);
    return [x, pdf1(x, mu, sigma)];
  });
}

/** Density curve restricted to [a, b] (for shading the area under it). */
export function areaPolygon(mu: number, sigma: number, a: number, b: number, n = 121): [number, number][] {
  const pts = curve(mu, sigma, a, b, n);
  return [[a, 0], ...pts, [b, 0]];
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** σ from dragging the inflection-point handle to x (handle sits at μ + σ). */
export function sigmaFromHandle(x: number, mu: number): number {
  const { min, max } = GAUSSIAN_1D_LIMITS.sigma;
  return clamp(Math.abs(x - mu), min, max);
}

export function muFromHandle(x: number): number {
  const { min, max } = GAUSSIAN_1D_LIMITS.mu;
  return clamp(x, min, max);
}
