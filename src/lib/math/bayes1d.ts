/**
 * One-dimensional Bayesian inference on a grid (post 06): prior × likelihood → posterior.
 * Densities are sampled at cell centres of a uniform grid and normalized so Σ p·Δ = 1.
 */

export interface Grid {
  lo: number;
  hi: number;
  n: number;
  /** Cell width. */
  dx: number;
  /** Cell centres. */
  x: Float64Array;
}

export function makeGrid(lo: number, hi: number, n: number): Grid {
  if (!(hi > lo) || n < 2) throw new RangeError('invalid grid');
  const dx = (hi - lo) / n;
  return { lo, hi, n, dx, x: Float64Array.from({ length: n }, (_, i) => lo + (i + 0.5) * dx) };
}

/** Scale non-negative values so they integrate to 1 over the grid. Throws if they are all zero. */
export function normalize(g: Grid, v: Float64Array): Float64Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]!;
  s *= g.dx;
  if (!(s > 0) || !Number.isFinite(s)) throw new Error('cannot normalize: no probability mass on the grid');
  return v.map((p) => p / s);
}

/** Log-likelihood of readings zᵢ ~ N(d, σ²) as a function of d on the grid (up to a constant). */
export function gaussianLogLik(g: Grid, readings: readonly number[], sigma: number): Float64Array {
  return g.x.map((d) => readings.reduce((acc, z) => acc - (0.5 * (z - d) ** 2) / (sigma * sigma), 0));
}

/**
 * Posterior ∝ prior^κ · exp(logLik) on the grid. κ is the prior weight: 1 is ordinary Bayes,
 * 0 ignores the prior (the posterior is then the normalized likelihood). Computed in log space.
 */
export function posterior(g: Grid, prior: Float64Array, logLik: Float64Array, kappa = 1): Float64Array {
  const logp = new Float64Array(g.n);
  let max = -Infinity;
  for (let i = 0; i < g.n; i++) {
    const lp = kappa === 0 ? 0 : prior[i]! > 0 ? kappa * Math.log(prior[i]!) : -Infinity;
    logp[i] = lp + logLik[i]!;
    if (logp[i]! > max) max = logp[i]!;
  }
  if (max === -Infinity) throw new Error('prior and likelihood do not overlap');
  return normalize(
    g,
    logp.map((l) => Math.exp(l - max)),
  );
}

/** Likelihood, normalized over the grid for display (it is not a density in d). */
export function normalizedLikelihood(g: Grid, logLik: Float64Array): Float64Array {
  let max = -Infinity;
  for (const l of logLik) max = Math.max(max, l);
  return normalize(
    g,
    logLik.map((l) => Math.exp(l - max)),
  );
}

/** Grid point with the largest value (first one on ties). */
export function argmax(g: Grid, v: Float64Array): number {
  let k = 0;
  for (let i = 1; i < v.length; i++) if (v[i]! > v[k]!) k = i;
  return g.x[k]!;
}

export function gridMean(g: Grid, p: Float64Array): number {
  let s = 0;
  for (let i = 0; i < g.n; i++) s += g.x[i]! * p[i]! * g.dx;
  return s;
}

export function gridStd(g: Grid, p: Float64Array): number {
  const m = gridMean(g, p);
  let s = 0;
  for (let i = 0; i < g.n; i++) s += (g.x[i]! - m) ** 2 * p[i]! * g.dx;
  return Math.sqrt(s);
}

/** Probability mass of p on [a, b]. */
export function massBetween(g: Grid, p: Float64Array, a: number, b: number): number {
  let s = 0;
  for (let i = 0; i < g.n; i++) if (g.x[i]! >= a && g.x[i]! <= b) s += p[i]! * g.dx;
  return s;
}

/**
 * Closed form for a Gaussian prior N(μ₀, σ₀²) with weight κ and readings zᵢ ~ N(d, σ²):
 * the posterior is Gaussian with precision κ/σ₀² + m/σ² and mean equal to the precision-weighted
 * average of μ₀ and the readings. With κ = 0 this is the MLE, the mean of the readings.
 */
export function gaussianPosterior(
  mu0: number,
  sigma0: number,
  kappa: number,
  readings: readonly number[],
  sigma: number,
): { mean: number; std: number } {
  const p0 = kappa / (sigma0 * sigma0);
  const pz = readings.length / (sigma * sigma);
  const prec = p0 + pz;
  if (!(prec > 0)) throw new RangeError('no information: no prior weight and no readings');
  const sumZ = readings.reduce((a, b) => a + b, 0);
  return { mean: (p0 * mu0 + sumZ / (sigma * sigma)) / prec, std: 1 / Math.sqrt(prec) };
}
