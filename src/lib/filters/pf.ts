/**
 * Particle filter building blocks (post 17).
 *
 * The belief is a set of N_p samples x⁽ⁱ⁾ with weights w⁽ⁱ⁾ summing to 1.
 *   predict:   draw x⁽ⁱ⁾ ~ p(x_k | x⁽ⁱ⁾_{k−1}, u_k)              (sample the motion model)
 *   weight:    w⁽ⁱ⁾ ∝ w⁽ⁱ⁾ p(z_k | x⁽ⁱ⁾)                      (importance weights, in log space)
 *   resample:  draw N_p particles with probabilities w⁽ⁱ⁾ and reset the weights to 1/N_p
 * The effective sample size N_eff = 1 / Σ w⁽ⁱ⁾² measures how many particles carry the belief.
 */
import type { Rng } from '../math/rng';

/** Normalize log-weights in place-safe fashion; returns weights summing to 1 and the log normalizer. */
export function normalizeLogWeights(logw: ArrayLike<number>): { w: Float64Array; logSum: number } {
  let m = -Infinity;
  for (let i = 0; i < logw.length; i++) m = Math.max(m, logw[i]!);
  if (!Number.isFinite(m)) throw new RangeError('normalizeLogWeights: all weights are zero');
  let s = 0;
  const w = new Float64Array(logw.length);
  for (let i = 0; i < logw.length; i++) {
    w[i] = Math.exp(logw[i]! - m);
    s += w[i]!;
  }
  for (let i = 0; i < w.length; i++) w[i]! /= s;
  return { w, logSum: m + Math.log(s) };
}

/** Effective sample size 1 / Σ wᵢ² of normalized weights (N for equal weights, 1 for one particle). */
export function effectiveSampleSize(w: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += w[i]! * w[i]!;
  return 1 / s;
}

export type ResamplingScheme = 'multinomial' | 'stratified' | 'systematic';

/**
 * Indices of the particles to keep. All three schemes draw each particle i on average N wᵢ times.
 * - multinomial: N independent draws from the weights;
 * - stratified: one draw in each interval [j/N, (j+1)/N);
 * - systematic: one random offset u, then the points (u + j)/N; particle i is drawn ⌊N wᵢ⌋ or ⌈N wᵢ⌉ times.
 */
export function resampleIndices(w: ArrayLike<number>, scheme: ResamplingScheme, rng: Rng, n = w.length): Int32Array {
  const cdf = new Float64Array(w.length);
  let c = 0;
  for (let i = 0; i < w.length; i++) {
    c += w[i]!;
    cdf[i] = c;
  }
  cdf[w.length - 1] = 1; // guard against rounding
  const out = new Int32Array(n);
  const pick = (u: number, from: number) => {
    let i = from;
    while (i < cdf.length - 1 && cdf[i]! <= u) i++;
    return i;
  };
  if (scheme === 'multinomial') {
    const us = Float64Array.from({ length: n }, () => rng.uniform()).sort();
    let i = 0;
    for (let j = 0; j < n; j++) out[j] = i = pick(us[j]!, i);
  } else {
    const u0 = rng.uniform();
    let i = 0;
    for (let j = 0; j < n; j++) {
      const u = (j + (scheme === 'systematic' ? u0 : rng.uniform())) / n;
      out[j] = i = pick(u, i);
    }
  }
  return out;
}

/** How many times each particle was drawn. */
export function counts(idx: ArrayLike<number>, n: number): Int32Array {
  const c = new Int32Array(n);
  for (let j = 0; j < idx.length; j++) c[idx[j]!]!++;
  return c;
}
