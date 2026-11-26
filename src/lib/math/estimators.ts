/**
 * Point estimators of a location parameter and the Cramér–Rao lower bound (post 07).
 */
import { normalPdf } from './stats';

export function sampleMean(xs: ArrayLike<number>, n = xs.length): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += xs[i]!;
  return s / n;
}

/** Median of the first n values (average of the two middle values when n is even). */
export function sampleMedian(xs: ArrayLike<number>, n = xs.length): number {
  if (n < 1) throw new RangeError('median of an empty sample');
  const a = Float64Array.from({ length: n }, (_, i) => xs[i]!).sort();
  const h = n >> 1;
  return n % 2 === 1 ? a[h]! : 0.5 * (a[h - 1]! + a[h]!);
}

/**
 * Shrinkage estimator: the mean of n values pulled towards a guess g as if g were worth k extra
 * observations, (n·x̄ + k·g)/(n + k). Biased towards g by k(g − θ)/(n + k), with variance scaled by (n/(n+k))².
 */
export function shrinkToward(mean: number, n: number, guess: number, k: number): number {
  return (n * mean + k * guess) / (n + k);
}

export interface ScalarDensity {
  pdf: (x: number) => number;
  /** Derivative of the pdf. */
  dpdf: (x: number) => number;
  /** Variance of the noise. */
  variance: number;
  /** Half-width of the integration range for numerics. */
  range: number;
}

export function gaussianNoise(sigma: number): ScalarDensity {
  return {
    pdf: (x) => normalPdf(x / sigma) / sigma,
    dpdf: (x) => (-x / (sigma * sigma)) * (normalPdf(x / sigma) / sigma),
    variance: sigma * sigma,
    range: 12 * sigma,
  };
}

/** Mixture (1 − ε)·N(0, σ₁²) + ε·N(0, σ₂²): mostly normal noise with occasional large errors. */
export function contaminatedNoise(sigma1: number, sigma2: number, eps: number): ScalarDensity {
  const a = gaussianNoise(sigma1);
  const b = gaussianNoise(sigma2);
  return {
    pdf: (x) => (1 - eps) * a.pdf(x) + eps * b.pdf(x),
    dpdf: (x) => (1 - eps) * a.dpdf(x) + eps * b.dpdf(x),
    variance: (1 - eps) * sigma1 * sigma1 + eps * sigma2 * sigma2,
    range: 12 * Math.max(sigma1, sigma2),
  };
}

/**
 * Fisher information of one observation about a location θ, for x = θ + noise:
 * I = ∫ f'(x)² / f(x) dx (Simpson's rule on a fine grid).
 */
export function fisherInfoLocation(d: ScalarDensity, steps = 40000): number {
  const h = (2 * d.range) / steps;
  let s = 0;
  for (let i = 0; i <= steps; i++) {
    const x = -d.range + i * h;
    const f = d.pdf(x);
    const v = f > 1e-300 ? d.dpdf(x) ** 2 / f : 0;
    s += (i === 0 || i === steps ? 1 : i % 2 === 1 ? 4 : 2) * v;
  }
  return (s * h) / 3;
}

/** Cramér–Rao lower bound on the variance of an unbiased estimator from n i.i.d. observations. */
export function crlb(d: ScalarDensity, n: number): number {
  return 1 / (n * fisherInfoLocation(d));
}
