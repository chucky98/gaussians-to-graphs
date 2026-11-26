/** Descriptive statistics, the normal CDF and chi-square quantiles (DESIGN §5.1). */
import { zeros, type Mat, type Vec } from './matrix';

// ---------------------------------------------------------------- special functions

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** ln Γ(x) for x > 0 (Lanczos, g = 7; ~15 significant digits). */
export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const xx = x - 1;
  let a = LANCZOS[0]!;
  const t = xx + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i]! / (xx + i);
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized lower incomplete gamma P(a, x) = γ(a, x)/Γ(a). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (!Number.isFinite(x)) return 1;
  const lnPrefix = a * Math.log(x) - x - logGamma(a);
  if (x < a + 1) {
    // Series expansion.
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
    }
    return Math.min(1, sum * Math.exp(lnPrefix));
  }
  // Continued fraction for Q(a, x) (modified Lentz).
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.max(0, 1 - Math.exp(lnPrefix) * h);
}

/** Standard normal CDF Φ(x), via erf(t) = P(½, t²). */
export function normalCdf(x: number): number {
  const p = gammaP(0.5, (x * x) / 2);
  return x >= 0 ? 0.5 * (1 + p) : 0.5 * (1 - p);
}

/** Standard normal density φ(x). */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Probability that a Gaussian sample lies within ±k standard deviations: erf(k/√2). */
export function probWithinSigma(k: number): number {
  return gammaP(0.5, (k * k) / 2);
}

/** Φ⁻¹(p) by Newton iteration on Φ (bracketed; accurate to ~1e-12). */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    throw new RangeError('p must be in [0, 1]');
  }
  let lo = -40;
  let hi = 40;
  let x = 0;
  for (let i = 0; i < 200; i++) {
    const f = normalCdf(x) - p;
    if (Math.abs(f) < 1e-15) break;
    if (f > 0) hi = x;
    else lo = x;
    const step = f / normalPdf(x);
    let next = x - step;
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
    if (Math.abs(next - x) < 1e-14 * Math.max(1, Math.abs(x))) {
      x = next;
      break;
    }
    x = next;
  }
  return x;
}

/** Chi-square CDF with `dof` degrees of freedom. */
export function chi2Cdf(x: number, dof: number): number {
  return gammaP(dof / 2, x / 2);
}

/**
 * Chi-square quantile: the value q with P(χ²_dof ≤ q) = p.
 * Starts from the Wilson–Hilferty approximation and refines with safeguarded Newton
 * on the exact CDF, so it is accurate to ~1e-10 for any dof ≥ 1.
 */
export function chi2Quantile(p: number, dof: number): number {
  if (!(dof > 0)) throw new RangeError('dof must be positive');
  if (!(p >= 0 && p <= 1)) throw new RangeError('p must be in [0, 1]');
  if (p === 0) return 0;
  if (p === 1) return Infinity;
  if (dof === 2) return -2 * Math.log1p(-p); // exact closed form
  const z = normalQuantile(p);
  const h = 2 / (9 * dof);
  let x = Math.max(1e-12, dof * (1 - h + z * Math.sqrt(h)) ** 3);
  let lo = 0;
  let hi = Math.max(10 * dof, 2 * x, 100);
  while (chi2Cdf(hi, dof) < p) hi *= 2;
  const k = dof / 2;
  const lnNorm = -k * Math.LN2 - logGamma(k);
  for (let i = 0; i < 200; i++) {
    const f = chi2Cdf(x, dof) - p;
    if (f > 0) hi = x;
    else lo = x;
    const pdf = Math.exp(lnNorm + (k - 1) * Math.log(x) - x / 2);
    let next = x - f / pdf;
    if (!(next > lo && next < hi) || !Number.isFinite(next)) next = 0.5 * (lo + hi);
    if (Math.abs(next - x) <= 1e-13 * Math.max(1, x)) return next;
    x = next;
  }
  return x;
}

// ---------------------------------------------------------------- descriptive

export function mean(xs: ArrayLike<number>): number {
  if (xs.length === 0) throw new RangeError('mean of empty sample');
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i]!;
  return s / xs.length;
}

/** Sample variance. `ddof = 1` (default) gives the unbiased estimator. */
export function variance(xs: ArrayLike<number>, ddof = 1): number {
  const n = xs.length;
  if (n - ddof <= 0) throw new RangeError('not enough samples for variance');
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < n; i++) s += (xs[i]! - m) ** 2;
  return s / (n - ddof);
}

/** Sample mean vector and covariance (ddof = 1) of a list of equal-length vectors. */
export function sampleCov(samples: readonly Vec[], ddof = 1): { mean: Vec; cov: Mat } {
  const n = samples.length;
  if (n - ddof <= 0) throw new RangeError('not enough samples for covariance');
  const d = samples[0]!.length;
  const mu = new Float64Array(d);
  for (const s of samples) for (let i = 0; i < d; i++) mu[i]! += s[i]! / n;
  const cov = zeros(d, d);
  for (const s of samples) {
    for (let i = 0; i < d; i++) {
      const di = s[i]! - mu[i]!;
      for (let j = i; j < d; j++) cov.data[i * d + j]! += di * (s[j]! - mu[j]!);
    }
  }
  for (let i = 0; i < d; i++) {
    for (let j = i; j < d; j++) {
      const v = cov.data[i * d + j]! / (n - ddof);
      cov.data[i * d + j] = v;
      cov.data[j * d + i] = v;
    }
  }
  return { mean: mu, cov };
}

export interface Histogram {
  /** Bin edges, length bins + 1. */
  edges: Float64Array;
  counts: Float64Array;
}

/** Histogram over [lo, hi) with equal-width bins; values outside are ignored (hi is included). */
export function histogram(xs: ArrayLike<number>, bins: number, lo: number, hi: number): Histogram {
  if (!(bins >= 1) || !(hi > lo)) throw new RangeError('invalid histogram range');
  const edges = Float64Array.from({ length: bins + 1 }, (_, i) => lo + ((hi - lo) * i) / bins);
  const counts = new Float64Array(bins);
  const w = (hi - lo) / bins;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!;
    if (x < lo || x > hi) continue;
    counts[Math.min(bins - 1, Math.floor((x - lo) / w))]! += 1;
  }
  return { edges, counts };
}

/** Effective sample size of (possibly unnormalized) importance weights: (Σw)² / Σw². */
export function ess(weights: ArrayLike<number>): number {
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < weights.length; i++) {
    s += weights[i]!;
    s2 += weights[i]! ** 2;
  }
  return s2 === 0 ? 0 : (s * s) / s2;
}
