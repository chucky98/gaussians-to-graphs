/**
 * Pure model behind the MotionModelSampler widget (post 14): the delivery robot is told to drive at
 * speed v while turning at rate ω. Its wheels do not obey exactly: every half second the actual speed
 * and turn rate differ from the command by Gaussian noise. Where does it end up?
 */
import { getBlock, add, mul, transpose, zeros, vec, diag, type Mat, type Vec } from '../math/matrix';
import { createRng } from '../math/rng';
import { mahalanobis2 } from '../math/gaussian';
import { chi2Quantile, sampleCov } from '../math/stats';
import { velocityJacobianControl, velocityJacobianState, velocityMotion } from '../models/unicycle';

export const SAMPLER = { dt: 0.5, samples: 600, paths: 25, seed: 14 };

export interface SamplerParams {
  /** Commanded speed (m/s) and turn rate (rad/s). */
  v: number;
  w: number;
  /** How long the command runs (s). */
  duration: number;
  /** Standard deviation of the actual speed and turn rate around the command. */
  sigmaV: number;
  sigmaW: number;
}

export type SamplerPreset = 'gentle' | 'banana';
export const SAMPLER_PRESETS: Record<SamplerPreset, SamplerParams> = {
  gentle: { v: 1, w: 0.3, duration: 6, sigmaV: 0.1, sigmaW: 0.15 },
  /** Poor heading control on a long drive: the heading spreads over about ±2 rad (95%). */
  banana: { v: 1, w: 0.3, duration: 8, sigmaV: 0.1, sigmaW: 0.5 },
};

export const SAMPLER_LIMITS = {
  v: { min: 0, max: 2, step: 0.05 },
  w: { min: -1, max: 1, step: 0.05 },
  duration: { min: 1, max: 10, step: 0.5 },
  sigmaV: { min: 0, max: 0.5, step: 0.01 },
  sigmaW: { min: 0, max: 0.8, step: 0.01 },
};

export const stepsOf = (p: SamplerParams) => Math.round(p.duration / SAMPLER.dt);
const START = vec([0, 0, 0]);

export interface SampleSet {
  /** End positions, interleaved [x0, y0, x1, y1, …]. */
  ends: Float64Array;
  /** End poses. */
  endPoses: Vec[];
  /** Full paths of the first few samples. */
  paths: Vec[][];
}

/** Sample the motion model. Sample i uses its own seeded stream, so changing the duration keeps its luck. */
export function sampleMotion(p: SamplerParams, seed = SAMPLER.seed): SampleSet {
  const n = stepsOf(p);
  const ends = new Float64Array(2 * SAMPLER.samples);
  const endPoses: Vec[] = [];
  const paths: Vec[][] = [];
  for (let i = 0; i < SAMPLER.samples; i++) {
    const rng = createRng(seed * 100003 + i);
    let x = START;
    const path = [x];
    for (let k = 0; k < n; k++) {
      x = velocityMotion(x, { v: p.v + p.sigmaV * rng.normal(), w: p.w + p.sigmaW * rng.normal() }, SAMPLER.dt);
      if (i < SAMPLER.paths) path.push(x);
    }
    ends[2 * i] = x[0]!;
    ends[2 * i + 1] = x[1]!;
    endPoses.push(x);
    if (i < SAMPLER.paths) paths.push(path);
  }
  return { ends, endPoses, paths };
}

/** The noise-free path. */
export function nominalPath(p: SamplerParams): Vec[] {
  const out = [START];
  for (let k = 0; k < stepsOf(p); k++) out.push(velocityMotion(out[k]!, { v: p.v, w: p.w }, SAMPLER.dt));
  return out;
}

/**
 * First-order propagation, as an EKF would do it: P ← F P Fᵀ + V M Vᵀ each step, with M = diag(σv², σω²)
 * the control noise and V M Vᵀ its image in state space.
 */
export function linearized(p: SamplerParams): { mean: Vec; P: Mat } {
  let x = START;
  let P = zeros(3, 3);
  const M = diag([p.sigmaV ** 2, p.sigmaW ** 2]);
  const u = { v: p.v, w: p.w };
  for (let k = 0; k < stepsOf(p); k++) {
    const F = velocityJacobianState(x, u, SAMPLER.dt);
    const V = velocityJacobianControl(x, u, SAMPLER.dt);
    P = add(mul(mul(F, P), transpose(F)), mul(mul(V, M), transpose(V)));
    x = velocityMotion(x, u, SAMPLER.dt);
  }
  return { mean: x, P };
}

export interface SamplerStats {
  /** Position block of the linearized covariance and of the sample covariance. */
  linMean: [number, number];
  linCov: Mat;
  mcMean: [number, number];
  mcCov: Mat;
  /** Fraction of the samples inside the linearized 95% ellipse. */
  insideLin: number;
  /** Standard deviation of the final heading (samples), rad. */
  headingSd: number;
}

export function samplerStats(p: SamplerParams, s: SampleSet): SamplerStats {
  const lin = linearized(p);
  const linCov = getBlock(lin.P, 0, 0, 2, 2);
  const pts = s.endPoses.map((x) => vec([x[0]!, x[1]!]));
  const mc = sampleCov(pts);
  const g = { mean: vec([lin.mean[0]!, lin.mean[1]!]), cov: linCov };
  const c = chi2Quantile(0.95, 2);
  let inside = 0;
  const degenerate = linCov.data[0]! * linCov.data[3]! - linCov.data[1]! ** 2 <= 1e-18;
  if (!degenerate) for (const q of pts) if (mahalanobis2(g, q) <= c) inside++;
  // Heading spread: angles wrap, so measure around the nominal heading.
  const th0 = lin.mean[2]!;
  const d = s.endPoses.map((x) => Math.atan2(Math.sin(x[2]! - th0), Math.cos(x[2]! - th0)));
  const md = d.reduce((a, b) => a + b, 0) / d.length;
  const headingSd = Math.sqrt(d.reduce((a, b) => a + (b - md) ** 2, 0) / (d.length - 1));
  return {
    linMean: [lin.mean[0]!, lin.mean[1]!],
    linCov,
    mcMean: [mc.mean[0]!, mc.mean[1]!],
    mcCov: mc.cov,
    insideLin: degenerate ? NaN : inside / pts.length,
    headingSd,
  };
}
