/**
 * Pure model behind the BayesGrid1D widget (post 06): how far is the wall?
 * A robot's prior belief about its distance d to a wall, combined with ultrasonic range readings.
 */
import {
  argmax,
  gaussianLogLik,
  gridMean,
  gridStd,
  makeGrid,
  massBetween,
  normalize,
  normalizedLikelihood,
  posterior,
  type Grid,
} from '../math/bayes1d';
import { pdf1 } from '../math/gaussian';
import { createRng } from '../math/rng';

export type PriorKind = 'odometry' | 'none' | 'doorways';

export const GRID: Grid = makeGrid(0, 5, 1000);

export const BAYES_DEFAULTS = {
  prior: 'odometry' as PriorKind,
  /** Ultrasonic reading noise (1σ), metres. */
  sigma: 0.2,
  /** Prior weight κ (1 = ordinary Bayes). */
  kappa: 1,
  /** Readings shown at the start. */
  initialReadings: 2,
  seed: 6,
  maxReadings: 30,
};

export const BAYES_LIMITS = {
  kappa: { min: 0, max: 5, step: 0.1 },
  shift: { min: -1.5, max: 1.5, step: 0.05 },
  densityMax: 4.5,
};

export interface PriorSpec {
  label: string;
  /** Where the robot really is (hidden by default). */
  truth: number;
  density: (d: number) => number;
  /** x position of the draggable handle (the prior's peak or centre). */
  anchor: number;
}

/** The three priors, each optionally shifted sideways by dragging. */
export function priorSpec(kind: PriorKind, shift = 0): PriorSpec {
  switch (kind) {
    case 'odometry':
      return {
        label: 'Odometry says about 2 m (±0.3 m)',
        truth: 2.6,
        density: (d) => pdf1(d, 2 + shift, 0.3),
        anchor: 2 + shift,
      };
    case 'none':
      return {
        label: 'No idea: anywhere from 0.2 to 4.8 m',
        truth: 2.6,
        density: (d) => (d >= 0.2 + shift && d <= 4.8 + shift ? 1 : 0),
        anchor: 2.5 + shift,
      };
    case 'doorways':
      return {
        label: 'In one of two identical doorways (1.2 m or 3.0 m)',
        truth: 3.0,
        density: (d) => 0.5 * pdf1(d, 1.2 + shift, 0.15) + 0.5 * pdf1(d, 3.0 + shift, 0.15),
        anchor: 2.1 + shift,
      };
  }
}

/** The ultrasonic readings the robot would take, in order: zₖ = truth + σ·noise (seeded). */
export function readingSequence(kind: PriorKind): number[] {
  const { seed, sigma, maxReadings } = BAYES_DEFAULTS;
  const rng = createRng(seed);
  const truth = priorSpec(kind).truth;
  return Array.from({ length: maxReadings }, () => truth + sigma * rng.normal());
}

export interface Inference {
  prior: Float64Array;
  likelihood: Float64Array | null;
  post: Float64Array;
  mle: number | null;
  /** The most likely distance, or null when there is no unique one (flat top or tied peaks). */
  map: number | null;
  /** Locations of all near-highest peaks (two entries when the posterior is ambiguous). */
  mapCandidates: number[];
  postMean: number;
  postStd: number;
}

export function infer(kind: PriorKind, shift: number, readings: readonly number[], kappa: number): Inference {
  const spec = priorSpec(kind, shift);
  const prior = normalize(GRID, GRID.x.map(spec.density));
  const ll = gaussianLogLik(GRID, readings, BAYES_DEFAULTS.sigma);
  const post =
    readings.length === 0 && kappa === 0
      ? normalize(
          GRID,
          GRID.x.map(() => 1),
        )
      : posterior(GRID, prior, ll, kappa);
  const likelihood = readings.length > 0 ? normalizedLikelihood(GRID, ll) : null;
  return {
    prior,
    likelihood,
    post,
    mle: likelihood ? argmax(GRID, likelihood) : null,
    ...modes(post),
    postMean: gridMean(GRID, post),
    postStd: gridStd(GRID, post),
  };
}

/**
 * Highest point(s) of a density on the grid. A flat top (more than 5% of the grid within 1e-9 of the
 * maximum) has no unique maximizer; separated local maxima within 1% of the maximum are all reported.
 */
export function modes(p: Float64Array): { map: number | null; mapCandidates: number[] } {
  let max = 0;
  for (const v of p) max = Math.max(max, v);
  let flat = 0;
  for (const v of p) if (v >= max * (1 - 1e-9)) flat++;
  if (flat > 0.05 * p.length) return { map: null, mapCandidates: [] };
  const peaks: number[] = [];
  for (let i = 0; i < p.length; i++) {
    const left = i === 0 ? -Infinity : p[i - 1]!;
    const right = i === p.length - 1 ? -Infinity : p[i + 1]!;
    if (p[i]! >= 0.99 * max && p[i]! >= left && p[i]! > right) {
      const x = GRID.x[i]!;
      if (peaks.every((q) => Math.abs(q - x) > 0.2)) peaks.push(x);
    }
  }
  return { map: peaks.length === 1 ? peaks[0]! : null, mapCandidates: peaks };
}

/** Posterior probability that the robot is at the far doorway (d > 2.1 m) in the doorways preset. */
export function farDoorwayProbability(post: Float64Array, shift = 0): number {
  return massBetween(GRID, post, 2.1 + shift, GRID.hi);
}

export function clampShift(s: number): number {
  return Math.min(BAYES_LIMITS.shift.max, Math.max(BAYES_LIMITS.shift.min, Math.round(s * 20) / 20));
}
