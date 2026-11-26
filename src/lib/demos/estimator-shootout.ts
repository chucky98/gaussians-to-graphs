/**
 * Pure model behind the EstimatorShootout widget (post 07): a GPS receiver on a surveyed benchmark.
 * The true east offset is 0 m; each fix adds noise. Three estimators, M repeated experiments.
 */
import {
  contaminatedNoise,
  crlb,
  gaussianNoise,
  sampleMean,
  sampleMedian,
  shrinkToward,
  type ScalarDensity,
} from '../math/estimators';
import { createRng } from '../math/rng';
import { histogram } from '../math/stats';

export type NoiseKind = 'open' | 'urban';
export type EstimatorId = 'mean' | 'median' | 'shrink';

export const SHOOTOUT = {
  trials: 2000,
  nMax: 100,
  seed: 7,
  truth: 0,
  /** "Yesterday's estimate", the value the shrinkage estimator pulls towards. */
  guess: 2,
  kDefault: 5,
  nDefault: 10,
  /** Sample sizes offered by the slider (roughly log-spaced). */
  nValues: [1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 50, 70, 100] as const,
  kLimits: { min: 0, max: 30, step: 1 },
  xDomain: [-8, 8] as [number, number],
};

export const NOISE: Record<
  NoiseKind,
  { label: string; density: ScalarDensity; sigma1: number; sigma2: number; eps: number }
> = {
  open: { label: 'Open sky: every fix ±3 m', density: gaussianNoise(3), sigma1: 3, sigma2: 3, eps: 0 },
  urban: {
    label: 'Near buildings: 1 fix in 10 reflected (±30 m)',
    density: contaminatedNoise(3, 30, 0.1),
    sigma1: 3,
    sigma2: 30,
    eps: 0.1,
  },
};

export interface Draws {
  /** trials × nMax standard normals. */
  z: Float64Array;
  /** trials × nMax uniforms (which component each fix comes from). */
  u: Float64Array;
}

/** All random numbers for one seed. Fix i of trial t is the same whatever n, noise model or k. */
export function makeDraws(seed: number): Draws {
  const { trials, nMax } = SHOOTOUT;
  const rng = createRng(seed);
  const z = new Float64Array(trials * nMax);
  const u = new Float64Array(trials * nMax);
  for (let i = 0; i < z.length; i++) {
    z[i] = rng.normal();
    u[i] = rng.uniform();
  }
  return { z, u };
}

/** The noisy fixes of one trial under a noise model. */
export function fixes(noise: NoiseKind, d: Draws, trial: number, n: number): Float64Array {
  const { nMax, truth } = SHOOTOUT;
  const { sigma1, sigma2, eps } = NOISE[noise];
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = trial * nMax + i;
    out[i] = truth + (d.u[j]! < eps ? sigma2 : sigma1) * d.z[j]!;
  }
  return out;
}

export type Estimates = Record<EstimatorId, Float64Array>;

export function estimates(noise: NoiseKind, d: Draws, n: number, k: number): Estimates {
  const M = SHOOTOUT.trials;
  const mean = new Float64Array(M);
  const median = new Float64Array(M);
  const shrink = new Float64Array(M);
  for (let t = 0; t < M; t++) {
    const xs = fixes(noise, d, t, n);
    mean[t] = sampleMean(xs);
    median[t] = sampleMedian(xs);
    shrink[t] = shrinkToward(mean[t]!, n, SHOOTOUT.guess, k);
  }
  return { mean, median, shrink };
}

export interface Summary {
  bias: number;
  std: number;
  rmse: number;
}

export function summarize(est: Float64Array): Summary {
  const n = est.length;
  let m = 0;
  for (const v of est) m += v;
  m /= n;
  let v2 = 0;
  let se = 0;
  for (const v of est) {
    v2 += (v - m) ** 2;
    se += (v - SHOOTOUT.truth) ** 2;
  }
  return { bias: m - SHOOTOUT.truth, std: Math.sqrt(v2 / n), rmse: Math.sqrt(se / n) };
}

/** Standard deviation an unbiased estimator cannot beat: √CRLB. */
const crlbOne = new Map<NoiseKind, number>();
export function crlbStd(noise: NoiseKind, n: number): number {
  let c1 = crlbOne.get(noise);
  if (c1 === undefined) {
    c1 = crlb(NOISE[noise].density, 1);
    crlbOne.set(noise, c1);
  }
  return Math.sqrt(c1 / n);
}

export interface CurvePoint {
  n: number;
  mean: number;
  median: number;
  shrink: number;
  crlb: number;
}

/** RMSE of each estimator against sample size, over all slider values. */
export function rmseCurve(noise: NoiseKind, d: Draws, k: number): CurvePoint[] {
  return SHOOTOUT.nValues.map((n) => {
    const e = estimates(noise, d, n, k);
    return {
      n,
      mean: summarize(e.mean).rmse,
      median: summarize(e.median).rmse,
      shrink: summarize(e.shrink).rmse,
      crlb: crlbStd(noise, n),
    };
  });
}

/**
 * Means and medians for every slider sample size, computed once per (noise model, seed) — the
 * expensive part (sorting for medians). Shrinkage is a function of the mean, so changing k is cheap.
 */
export interface Precomputed {
  noise: NoiseKind;
  means: Float64Array[];
  medians: Float64Array[];
}

export function precompute(noise: NoiseKind, d: Draws): Precomputed {
  const M = SHOOTOUT.trials;
  const means: Float64Array[] = [];
  const medians: Float64Array[] = [];
  for (const n of SHOOTOUT.nValues) {
    const mu = new Float64Array(M);
    const md = new Float64Array(M);
    for (let t = 0; t < M; t++) {
      const xs = fixes(noise, d, t, n);
      mu[t] = sampleMean(xs);
      md[t] = sampleMedian(xs);
    }
    means.push(mu);
    medians.push(md);
  }
  return { noise, means, medians };
}

/** Estimates at slider index i (n = nValues[i]) with shrinkage strength k. */
export function estimatesAt(pc: Precomputed, i: number, k: number): Estimates {
  const n = SHOOTOUT.nValues[i]!;
  const mean = pc.means[i]!;
  return { mean, median: pc.medians[i]!, shrink: mean.map((m) => shrinkToward(m, n, SHOOTOUT.guess, k)) };
}

/** RMSE curve over all slider sizes from precomputed estimates. */
export function rmseCurveFrom(pc: Precomputed, k: number): CurvePoint[] {
  return SHOOTOUT.nValues.map((n, i) => {
    const e = estimatesAt(pc, i, k);
    return {
      n,
      mean: summarize(e.mean).rmse,
      median: summarize(e.median).rmse,
      shrink: summarize(e.shrink).rmse,
      crlb: crlbStd(pc.noise, n),
    };
  });
}

/** Histogram of estimates as a density over the plot's x-range (values outside are dropped). */
export function estimateHistogram(est: Float64Array, bins = 64): { edges: Float64Array; density: Float64Array } {
  const [lo, hi] = SHOOTOUT.xDomain;
  const h = histogram(est, bins, lo, hi);
  const w = (hi - lo) / bins;
  return { edges: h.edges, density: h.counts.map((c) => c / (est.length * w)) };
}
