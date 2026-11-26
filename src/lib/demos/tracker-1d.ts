/**
 * Pure model behind the Tracker1D widget (post 11): the delivery robot of post 10, now in a straight
 * 40 m corridor, drives 1 m per step on odometry and receives a noisy position fix after every move.
 * A one-dimensional Kalman filter tracks its position.
 */
import { run1, steadyState1, type Kf1State, type Kf1Step } from '../filters/kf1d';
import { createRng } from '../math/rng';

export type TrackerPreset = 'steady' | 'outage';

export const TRACK = {
  steps: 40,
  /** Commanded move per step (m). */
  move: 1,
  /** Initial belief: x̂ = 0, standard deviation 1 m. */
  x0: 0,
  sigma0: 1,
  seed: 7,
  /** Steps without fixes in the "outage" preset: k = from … to − 1 (1-based). */
  outage: { from: 16, to: 26 },
};

export interface TrackerParams {
  /** Motion noise α: error std per 1 m move, so Q = α² (m²). */
  alpha: number;
  /** Fix noise √R (m). */
  sigmaZ: number;
}

export const TRACKER_DEFAULTS: TrackerParams = { alpha: 0.1, sigmaZ: 0.3 };

export const TRACKER_LIMITS = {
  alpha: { min: 0.01, max: 0.5, step: 0.01 },
  sigmaZ: { min: 0.05, max: 1.5, step: 0.05 },
};

export interface Scenario {
  /** True positions x_0 … x_n. */
  truth: number[];
  /** Fix at step k (index k − 1), or null during an outage. */
  zs: (number | null)[];
  us: number[];
}

/**
 * Seeded scenario. The standard-normal draws are taken in a fixed order (start, then per step: motion,
 * fix), so changing α or √R rescales the same luck instead of reshuffling it.
 */
export function makeScenario(preset: TrackerPreset, p: TrackerParams, seed = TRACK.seed): Scenario {
  const rng = createRng(seed);
  const truth = [TRACK.x0 + TRACK.sigma0 * rng.normal()];
  const zs: (number | null)[] = [];
  const us: number[] = [];
  for (let k = 1; k <= TRACK.steps; k++) {
    const w = rng.normal();
    const v = rng.normal();
    const x = truth[k - 1]! + TRACK.move + p.alpha * Math.sqrt(TRACK.move) * w;
    truth.push(x);
    us.push(TRACK.move);
    const out = preset === 'outage' && k >= TRACK.outage.from && k < TRACK.outage.to;
    zs.push(out ? null : x + p.sigmaZ * v);
  }
  return { truth, zs, us };
}

export const Qof = (p: TrackerParams) => p.alpha * p.alpha * TRACK.move;
export const Rof = (p: TrackerParams) => p.sigmaZ * p.sigmaZ;
export const initBelief = (): Kf1State => ({ x: TRACK.x0, P: TRACK.sigma0 ** 2 });

export function runTracker(s: Scenario, p: TrackerParams): Kf1Step[] {
  return run1(initBelief(), s.us, s.zs, Qof(p), Rof(p));
}

export function steady(p: TrackerParams) {
  return steadyState1(Qof(p), Rof(p));
}

/**
 * The widget steps through half-steps: t = 0 is the initial belief; t = 2k − 1 is just after the
 * prediction of step k; t = 2k just after its update.
 */
export interface Phase {
  k: number;
  stage: 'start' | 'predicted' | 'updated';
}
export function phaseOf(t: number): Phase {
  if (t <= 0) return { k: 0, stage: 'start' };
  return { k: Math.ceil(t / 2), stage: t % 2 === 1 ? 'predicted' : 'updated' };
}
export const T_MAX = 2 * TRACK.steps;

/** Belief shown at half-step t. */
export function beliefAt(steps: readonly Kf1Step[], t: number): Kf1State {
  const ph = phaseOf(t);
  if (ph.stage === 'start') return initBelief();
  const s = steps[ph.k - 1]!;
  return ph.stage === 'predicted' ? s.prior : s.post;
}

/** Fraction of steps 1…n whose updated estimate lies within ±1.96σ of the truth. */
export function coverage(steps: readonly Kf1Step[], truth: readonly number[], from = 1): number {
  let inside = 0;
  let n = 0;
  for (let k = from; k <= steps.length; k++) {
    const s = steps[k - 1]!.post;
    n++;
    if (Math.abs(s.x - truth[k]!) <= 1.96 * Math.sqrt(s.P)) inside++;
  }
  return inside / n;
}
