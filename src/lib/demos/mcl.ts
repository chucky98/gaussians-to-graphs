/**
 * Pure model behind the MCL widget (post 17): Monte Carlo localization in the hall of posts 15–16, but
 * the robot does not know where it starts, and the reflective markers are identical, so a reading does
 * not say which marker it came from.
 */
import { effectiveSampleSize, normalizeLogWeights, resampleIndices, type ResamplingScheme } from '../filters/pf';
import { wrapAngle } from '../geometry/so2';
import { vec, type Vec } from '../math/matrix';
import { createRng, type Rng } from '../math/rng';
import { rangeBearing } from '../models/range-bearing';
import { velocityMotion, type VelocityControl } from '../models/unicycle';
import { EKF_PRESETS, HALL, route } from './ekf-localization';

export const MCL = {
  /** The hall's walls (the markers on the boundary are mounted on them). */
  walls: { x: [-0.5, 19.5] as [number, number], y: [-0.5, 12.5] as [number, number] },
  /** The real sensor: post 15's lidar, with a longer range (several markers per scan). */
  sensor: { ...EKF_PRESETS.default, range: 10 },
  /** Probability density floor for a reading that no marker explains (clutter). */
  clutter: 0.01,
  /** Typical: locks on at step 3 with 2,000 particles, never with 500; recovers from a kidnap 43 steps later with augmented MCL (the median over seeds 1–30). */
  seed: 22,
  npOptions: [200, 500, 1000, 2000, 5000],
  npDefault: 2000,
  /**
   * Augmented MCL (Thrun et al., §8.3.5): smoothing rates of the long- and short-term averages of the
   * measurement likelihood. Random particles are injected with probability max(0, 1 − w_fast/w_slow).
   */
  alphaSlow: 0.005,
  alphaFast: 0.05,
  /** Steps in one lap of the route; a kidnapped robot is carried half a lap ahead. */
  lap: 96,
  /**
   * The filter's own sensor and motion models are deliberately wider than the real ones: with a few
   * thousand particles spread over the hall, almost none would fall close enough to score under the
   * true 0.1 m / 2° noise (a standard practice in MCL; see the post).
   */
  model: { sigmaR: 0.5, sigmaPhiDeg: 10, sigmaV: 0.2, sigmaW: 0.15 },
};

export interface MclParams {
  np: number;
  scheme: ResamplingScheme;
  inject: boolean;
  /** Step at which the robot is kidnapped, or null. */
  kidnapAt: number | null;
}
export const MCL_DEFAULTS: MclParams = { np: MCL.npDefault, scheme: 'systematic', inject: false, kidnapAt: null };

export interface Reading {
  z: Vec;
}

export interface MclTruth {
  truths: Vec[];
  /** What the wheel odometry reports at each step: the true motion plus noise. */
  controls: VelocityControl[];
  readings: Reading[][];
}

const deg = Math.PI / 180;
const S = MCL.sensor;
const marks = HALL.landmarks.map(([x, y]) => vec([x, y]));

/** Noise-free pose after `k` steps of the looped route. */
function nominalPose(k: number): Vec {
  let x = vec(HALL.start);
  const lap = route().slice(0, MCL.lap);
  for (let j = 0; j < k; j++) x = velocityMotion(x, lap[j % MCL.lap]!, HALL.dt);
  return x;
}

/**
 * The true run: the robot follows the post-15 loop exactly, reporting noisy odometry and anonymous marker
 * readings. If `kidnapAt` is set, it is picked up after that step and put down half a lap further on, where
 * it carries on with the loop.
 */
export function simulateTruth(kidnapAt: number | null, seed = MCL.seed): MclTruth {
  const rng = createRng(seed);
  const lap = route().slice(0, MCL.lap);
  const n = route().length;
  let truth = vec(HALL.start);
  let offset = 0;
  const truths: Vec[] = [];
  const controls: VelocityControl[] = [];
  const readings: Reading[][] = [];
  for (let k = 0; k < n; k++) {
    const u = lap[(k + offset) % MCL.lap]!;
    const a = rng.normal();
    const b = rng.normal();
    const noise = marks.map(() => [rng.normal(), rng.normal()] as const);
    // The robot follows its loop (as if guided along it); its wheel odometry reports the motion with noise.
    truth = velocityMotion(truth, u, HALL.dt);
    controls.push({ v: u.v + S.sigmaV * a, w: u.w + S.sigmaW * b });
    if (kidnapAt !== null && k + 1 === kidnapAt) {
      offset = MCL.lap / 2;
      truth = nominalPose(k + 1 + offset);
    }
    const rs: Reading[] = [];
    marks.forEach((m, j) => {
      const z0 = rangeBearing(truth, m);
      if (z0[0]! > S.range) return;
      rs.push({ z: vec([z0[0]! + S.sigmaR * noise[j]![0], wrapAngle(z0[1]! + S.sigmaPhiDeg * deg * noise[j]![1])]) });
    });
    truths.push(truth);
    readings.push(rs);
  }
  return { truths, controls, readings };
}

const inside = (x: number, y: number) =>
  x >= MCL.walls.x[0] && x <= MCL.walls.x[1] && y >= MCL.walls.y[0] && y <= MCL.walls.y[1];

function randomPose(rng: Rng, out: Float64Array, i: number) {
  out[3 * i] = MCL.walls.x[0] + rng.uniform() * (MCL.walls.x[1] - MCL.walls.x[0]);
  out[3 * i + 1] = MCL.walls.y[0] + rng.uniform() * (MCL.walls.y[1] - MCL.walls.y[0]);
  out[3 * i + 2] = wrapAngle(-Math.PI + rng.uniform() * 2 * Math.PI);
}

const LOG_2PI = Math.log(2 * Math.PI);
/** Wrap an angle that is at most a few turns away from (−π, π]. */
const wrapFast = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
};

/**
 * Log-likelihood of one anonymous reading for a pose: a mixture over the markers within range (each
 * equally likely to be the one seen) plus a clutter floor. Uses the filter's (wider) sensor model.
 */
export function readingLogLik(x: number, y: number, th: number, z: Vec): number {
  const sr = MCL.model.sigmaR;
  const sp = MCL.model.sigmaPhiDeg * deg;
  const logNorm = -LOG_2PI - Math.log(sr * sp);
  const maxR = S.range + 3 * sr;
  let s = 0;
  for (const m of marks) {
    const dx = m[0]! - x;
    const dy = m[1]! - y;
    const r2 = dx * dx + dy * dy;
    if (r2 > maxR * maxR) continue;
    const er = (z[0]! - Math.sqrt(r2)) / sr;
    if (er * er > 25) continue;
    const ep = wrapFast(z[1]! - (Math.atan2(dy, dx) - th)) / sp;
    s += Math.exp(logNorm - 0.5 * (er * er + ep * ep)) / marks.length;
  }
  return Math.log(s + MCL.clutter);
}

export interface StepSummary {
  ess: number;
  resampled: boolean;
  injected: number;
  /** Weighted mean position and its distance to the truth. */
  mean: [number, number];
  err: number;
  /** Fraction of the weight within 1 m of the true position. */
  near: number;
}

export interface MclState {
  step: number;
  particles: Float64Array;
  weights: Float64Array;
  rng: Rng;
  /** Long- and short-term averages of the measurement likelihood (augmented MCL); 0 until the first reading. */
  wSlow: number;
  wFast: number;
}

export function initialState(p: MclParams, seed = MCL.seed): MclState {
  const rng = createRng(seed * 7919 + p.np);
  const particles = new Float64Array(3 * p.np);
  for (let i = 0; i < p.np; i++) randomPose(rng, particles, i);
  return { step: 0, particles, weights: new Float64Array(p.np).fill(1 / p.np), rng, wSlow: 0, wFast: 0 };
}

export function summarize(s: MclState, truth: Vec): { mean: [number, number]; err: number; near: number } {
  let mx = 0;
  let my = 0;
  let near = 0;
  for (let i = 0; i < s.weights.length; i++) {
    const w = s.weights[i]!;
    const x = s.particles[3 * i]!;
    const y = s.particles[3 * i + 1]!;
    mx += w * x;
    my += w * y;
    if (Math.hypot(x - truth[0]!, y - truth[1]!) <= 1) near += w;
  }
  return { mean: [mx, my], err: Math.hypot(mx - truth[0]!, my - truth[1]!), near };
}

/** One MCL step (motion, weighting, adaptive resampling, optional injection), in place. */
export function mclStep(
  s: MclState,
  p: MclParams,
  u: VelocityControl,
  readings: readonly Reading[],
): { ess: number; resampled: boolean; injected: number } {
  const n = p.np;
  const P = s.particles;
  const logw = new Float64Array(n);
  const logLik = new Float64Array(n);
  const dt = HALL.dt;
  for (let i = 0; i < n; i++) {
    // Velocity motion model (post 14), inlined: chord v·dt·sinc(h) along θ + h, with h = ω dt / 2.
    const v = u.v + MCL.model.sigmaV * s.rng.normal();
    const w = u.w + MCL.model.sigmaW * s.rng.normal();
    const h = (w * dt) / 2;
    const d = v * dt * (Math.abs(h) < 1e-6 ? 1 : Math.sin(h) / h);
    const th = P[3 * i + 2]!;
    const x = P[3 * i]! + d * Math.cos(th + h);
    const y = P[3 * i + 1]! + d * Math.sin(th + h);
    const th2 = wrapFast(th + w * dt);
    P[3 * i] = x;
    P[3 * i + 1] = y;
    P[3 * i + 2] = th2;
    let ll = 0;
    if (!inside(x, y)) ll -= 50; // through a wall: practically impossible
    for (const r of readings) ll += readingLogLik(x, y, th2, r.z);
    logLik[i] = ll;
    logw[i] = Math.log(Math.max(s.weights[i]!, 1e-300)) + ll;
  }
  s.weights = normalizeLogWeights(logw).w;
  const ess = effectiveSampleSize(s.weights);
  // Augmented MCL: compare the short- and long-term average likelihood of the readings.
  let injectProb = 0;
  if (p.inject && readings.length > 0) {
    const wAvg = Math.exp(normalizeLogWeights(logLik).logSum - Math.log(n));
    s.wSlow = s.wSlow === 0 ? wAvg : s.wSlow + MCL.alphaSlow * (wAvg - s.wSlow);
    s.wFast = s.wFast === 0 ? wAvg : s.wFast + MCL.alphaFast * (wAvg - s.wFast);
    injectProb = Math.max(0, 1 - s.wFast / s.wSlow);
  }
  let resampled = false;
  let injected = 0;
  if (ess < n / 2 || injectProb > 0) {
    const idx = resampleIndices(s.weights, p.scheme, s.rng);
    const Q = new Float64Array(3 * n);
    for (let j = 0; j < n; j++) {
      if (injectProb > 0 && s.rng.uniform() < injectProb) {
        randomPose(s.rng, Q, j);
        injected++;
        continue;
      }
      Q[3 * j] = P[3 * idx[j]!]!;
      Q[3 * j + 1] = P[3 * idx[j]! + 1]!;
      Q[3 * j + 2] = P[3 * idx[j]! + 2]!;
    }
    s.particles = Q;
    s.weights = new Float64Array(n).fill(1 / n);
    resampled = true;
  }
  s.step += 1;
  return { ess, resampled, injected };
}

export interface MclRun {
  state: MclState;
  summaries: StepSummary[];
}

/** Run from the start up to step `upto`, returning the particles there and every step's summary. */
export function runMcl(p: MclParams, upto: number, truth: MclTruth, seed = MCL.seed): MclRun {
  const s = initialState(p, seed);
  const summaries: StepSummary[] = [];
  for (let k = 0; k < upto; k++) {
    const r = mclStep(s, p, truth.controls[k]!, truth.readings[k]!);
    summaries.push({ ...r, ...summarize(s, truth.truths[k]!) });
  }
  return { state: s, summaries };
}

/** First step from which at least `frac` of the weight stays within 1 m of the truth until `to`. */
export function lockStep(
  summaries: readonly StepSummary[],
  frac = 0.8,
  from = 0,
  to = summaries.length,
): number | null {
  for (let k = from; k < to; k++) {
    let ok = true;
    for (let j = k; j < to && ok; j++) if (summaries[j]!.near < frac) ok = false;
    if (ok) return k + 1;
  }
  return null;
}

export interface MclSnapshot {
  step: number;
  /** Interleaved particle positions [x0, y0, x1, y1, …] at `step`. */
  xy: Float64Array;
  summaries: StepSummary[];
}

/**
 * A stateful runner for the widget's worker: it keeps the filter state, advances it cheaply when asked
 * for a later step with the same settings, and restarts from scratch otherwise (the run is a pure
 * function of the settings, the seed and the step, so restarting always reproduces it).
 */
export function createMclRunner() {
  let key = '';
  let truth: MclTruth | null = null;
  let state: MclState | null = null;
  let summaries: StepSummary[] = [];
  return {
    run(p: MclParams, seed: number, upto: number): MclSnapshot {
      const k = JSON.stringify([p, seed]);
      if (k !== key || !state || upto < state.step) {
        key = k;
        truth = simulateTruth(p.kidnapAt, seed);
        state = initialState(p, seed);
        summaries = [];
      }
      while (state.step < upto) {
        const j = state.step;
        const r = mclStep(state, p, truth!.controls[j]!, truth!.readings[j]!);
        summaries.push({ ...r, ...summarize(state, truth!.truths[j]!) });
      }
      const n = p.np;
      const xy = new Float64Array(2 * n);
      for (let i = 0; i < n; i++) {
        xy[2 * i] = state.particles[3 * i]!;
        xy[2 * i + 1] = state.particles[3 * i + 1]!;
      }
      return { step: state.step, xy, summaries: summaries.slice() };
    },
  };
}
