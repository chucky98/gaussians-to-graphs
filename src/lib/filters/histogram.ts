/**
 * Discrete (histogram) Bayes filter in one dimension (post 10).
 *
 * The state is a cell index i ∈ {0, …, n−1}; the belief is a probability vector over the cells.
 *   predict:  bel̄(i) = Σⱼ p(i | j, u) bel(j)        (total probability: a convolution with the motion kernel)
 *   update:   bel(i)  = η p(z | i) bel̄(i)          (Bayes' rule: multiply by the likelihood, then normalize)
 * The corridor can be cyclic (a loop: moves wrap around) or bounded (the robot stops at the ends).
 */
import { normalCdf } from '../math/stats';

export type Belief = Float64Array;

/** Motion kernel: the robot actually moves by offsets[k] cells with probability probs[k]. */
export interface MotionKernel {
  offsets: number[];
  probs: number[];
}

export interface PredictOptions {
  /** Moves wrap around (a loop corridor). Default true. */
  cyclic?: boolean;
  /**
   * Probability that the robot is moved to a uniformly random cell instead ("kidnapping").
   * The predicted belief is (1 − ε)·(convolution) + ε/n. Default 0.
   */
  kidnapProb?: number;
}

export function uniformBelief(n: number): Belief {
  if (!(n > 0)) throw new Error('uniformBelief: need at least one cell');
  return new Float64Array(n).fill(1 / n);
}

/** Point mass on cell i. */
export function pointBelief(n: number, i: number): Belief {
  const b = new Float64Array(n);
  b[i] = 1;
  return b;
}

export function sum(v: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]!;
  return s;
}

/** Scale to sum 1. Returns the belief and the sum before scaling. */
export function normalize(v: ArrayLike<number>): { belief: Belief; total: number } {
  const total = sum(v);
  if (!(total > 0) || !Number.isFinite(total)) throw new Error('normalize: total mass must be positive and finite');
  const b = new Float64Array(v.length);
  for (let i = 0; i < v.length; i++) b[i] = v[i]! / total;
  return { belief: b, total };
}

/**
 * A move of `meanCells` with Gaussian error of standard deviation `stdCells`, rounded to whole cells:
 * the probability of offset j is the Gaussian mass in [j − ½, j + ½]. With std 0 it is an exact shift.
 */
export function gaussianKernel(meanCells: number, stdCells: number, tail = 5): MotionKernel {
  if (stdCells < 0) throw new Error('gaussianKernel: negative std');
  if (stdCells === 0) return { offsets: [Math.round(meanCells)], probs: [1] };
  const lo = Math.floor(meanCells - tail * stdCells - 0.5);
  const hi = Math.ceil(meanCells + tail * stdCells + 0.5);
  const offsets: number[] = [];
  const raw: number[] = [];
  for (let j = lo; j <= hi; j++) {
    const p = normalCdf((j + 0.5 - meanCells) / stdCells) - normalCdf((j - 0.5 - meanCells) / stdCells);
    if (p > 1e-12) {
      offsets.push(j);
      raw.push(p);
    }
  }
  const t = sum(raw);
  return { offsets, probs: raw.map((p) => p / t) };
}

/** Prediction step: convolve the belief with the motion kernel (plus an optional kidnapping term). */
export function predict(bel: ArrayLike<number>, kernel: MotionKernel, opts: PredictOptions = {}): Belief {
  const n = bel.length;
  const cyclic = opts.cyclic ?? true;
  const eps = opts.kidnapProb ?? 0;
  if (eps < 0 || eps > 1) throw new Error('predict: kidnapProb must be in [0, 1]');
  const out = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const bj = bel[j]!;
    if (bj === 0) continue;
    for (let k = 0; k < kernel.offsets.length; k++) {
      let i = j + kernel.offsets[k]!;
      if (cyclic) i = ((i % n) + n) % n;
      else i = Math.min(n - 1, Math.max(0, i));
      out[i]! += bj * kernel.probs[k]!;
    }
  }
  if (eps > 0) {
    const total = sum(bel);
    for (let i = 0; i < n; i++) out[i] = (1 - eps) * out[i]! + (eps * total) / n;
  }
  return out;
}

/**
 * Update step: multiply by the likelihood p(z | i) and normalize.
 * `evidence` = Σᵢ p(z | i) bel̄(i) = p(z | earlier data), the normalizer 1/η.
 */
export function update(bel: ArrayLike<number>, likelihood: ArrayLike<number>): { belief: Belief; evidence: number } {
  if (bel.length !== likelihood.length) throw new Error('update: size mismatch');
  const prod = new Float64Array(bel.length);
  for (let i = 0; i < bel.length; i++) prod[i] = bel[i]! * likelihood[i]!;
  const { belief, total } = normalize(prod);
  return { belief, evidence: total };
}

/** Offset drawn from the kernel by inverse CDF of a uniform u ∈ [0, 1). */
export function sampleOffset(kernel: MotionKernel, u: number): number {
  let c = 0;
  for (let k = 0; k < kernel.offsets.length; k++) {
    c += kernel.probs[k]!;
    if (u < c) return kernel.offsets[k]!;
  }
  return kernel.offsets[kernel.offsets.length - 1]!;
}

/** Index of the largest entry (first one on ties). */
export function argmax(v: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i]! > v[best]!) best = i;
  return best;
}

/** Probability mass within `halfWidth` cells of `center` (wrapping around on a cyclic corridor). */
export function massNear(bel: ArrayLike<number>, center: number, halfWidth: number, cyclic = true): number {
  const n = bel.length;
  let m = 0;
  for (let d = -halfWidth; d <= halfWidth; d++) {
    let i = center + d;
    if (cyclic) i = ((i % n) + n) % n;
    else if (i < 0 || i >= n) continue;
    m += bel[i]!;
  }
  return m;
}

/** Shannon entropy in bits (log₂ n for a uniform belief, 0 for certainty). */
export function entropyBits(bel: ArrayLike<number>): number {
  let h = 0;
  for (let i = 0; i < bel.length; i++) {
    const p = bel[i]!;
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}
