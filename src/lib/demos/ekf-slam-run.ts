/**
 * The model behind Post 24's EKFSLAM widget: a robot drives 1.6 laps of a 6 m circle through 16 landmarks
 * and maps them with EKF-SLAM. For each step it reports the estimates, the correlation matrix of the whole
 * state (for the heat map) and how much of it is "filled in". `consistencyRuns` gives the run-averaged NEES
 * of the robot pose over many seeds, for the post's section on inconsistency.
 */
import { averageBounds, nees } from '../filters/consistency';
import { block, type SlamState } from '../filters/ekf-slam';
import { wrapAngle } from '../geometry/so2';
import type { Mat } from '../math/matrix';
import { runEkfSlam, simulateWorld, type SlamStep, type World, type WorldRun } from './slam-world';

/** 16 landmarks, alternately inside (≈ 3.6 m from the centre) and outside (≈ 8.2 m) a 6 m circle. */
const LANDMARKS: [number, number][] = [
  [2.34, -7.81],
  [2.05, -2.86],
  [7.05, -3.71],
  [3.62, -1.03],
  [8.4, 1.09],
  [3.26, 2.17],
  [3.88, 7.12],
  [0.73, 3.88],
  [-0.95, 8.35],
  [-1.89, 2.87],
  [-6.09, 4.75],
  [-3.91, 0.32],
  [-7.55, -1.66],
  [-3.2, -2.29],
  [-4.79, -6.15],
  [-0.98, -3.63],
];

export type HeadingNoise = 'default' | 'high';

export const SLAM24 = {
  base: {
    landmarks: LANDMARKS,
    radius: 6,
    speed: 0.5,
    steps: 240,
    dt: 0.5,
    sigmaV: 0.05,
    sigmaW: 0.05,
    sigmaR: 0.1,
    sigmaPhiDeg: 2,
    range: 3.5,
  } satisfies World,
  sigmaW: { default: 0.05, high: 0.1 } as Record<HeadingNoise, number>,
  seed: 18,
  /** |correlation| above which a pair counts as "strongly correlated". */
  strong: 0.5,
} as const;

export const world24 = (noise: HeadingNoise): World => ({ ...SLAM24.base, sigmaW: SLAM24.sigmaW[noise] });

export interface Run24 {
  world: World;
  run: WorldRun;
  steps: SlamStep[];
}

export function run24(noise: HeadingNoise = 'default', seed: number = SLAM24.seed): Run24 {
  const world = world24(noise);
  const run = simulateWorld(world, seed);
  return { world, run, steps: runEkfSlam(world, run) };
}

/**
 * The loop closure: the step, after the first half lap, at which the robot's position uncertainty drops
 * the most in one step (a reading of a landmark mapped long before).
 */
export function closureStep24(r: Run24): number {
  let best = -1;
  let drop = 0;
  for (let k = Math.round(r.world.steps / 4); k < r.steps.length; k++) {
    const d = robotSd(r.steps[k - 1]!.state) - robotSd(r.steps[k]!.state);
    if (d > drop) [best, drop] = [k, d];
  }
  return best;
}

/** |correlation coefficient| of every pair of state entries, row-major (for the heat map). */
export function correlationMagnitudes(s: SlamState): Float64Array {
  const n = s.x.length;
  const d = Array.from({ length: n }, (_, i) => Math.sqrt(s.P.data[i * n + i]!));
  const out = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) out[i * n + j] = Math.min(1, Math.abs(s.P.data[i * n + j]!) / (d[i]! * d[j]!));
  return out;
}

/** Share of landmark–landmark coordinate pairs (off the 2 × 2 diagonal blocks) with |correlation| ≥ threshold. */
export function strongShare(s: SlamState, threshold: number = SLAM24.strong): number {
  const n = s.x.length;
  const c = correlationMagnitudes(s);
  let hit = 0;
  let total = 0;
  for (let i = 3; i < n; i++)
    for (let j = 3; j < n; j++) {
      if (Math.floor((i - 3) / 2) === Math.floor((j - 3) / 2)) continue;
      total++;
      if (c[i * n + j]! >= threshold) hit++;
    }
  return total ? hit / total : 0;
}

const sd2 = (m: Mat) => Math.sqrt(m.data[0]! + m.data[3]!);
export const robotSd = (s: SlamState) => sd2(block(s, -1));
export function meanLandmarkSd(s: SlamState): number {
  return s.ids.length ? s.ids.reduce((t, _, j) => t + sd2(block(s, j)), 0) / s.ids.length : 0;
}

/** Robot position error of the estimate at step k. */
export function robotError(r: Run24, k: number): number {
  const s = r.steps[k]!.state;
  const t = k === 0 ? r.run.start : r.run.truths[k - 1]!;
  return Math.hypot(s.x[0]! - t[0]!, s.x[1]! - t[1]!);
}

/** Run-averaged NEES of the robot pose (3 degrees of freedom) at every step, over `runs` seeds. */
export function consistencyRuns(
  noise: HeadingNoise,
  runs = 50,
): { nees: Float64Array; bounds: { lo: number; hi: number } } {
  const world = world24(noise);
  const acc = new Float64Array(world.steps + 1);
  for (let seed = 1; seed <= runs; seed++) {
    const run = simulateWorld(world, seed);
    const steps = runEkfSlam(world, run);
    for (let k = 1; k <= world.steps; k++) {
      const s = steps[k]!.state;
      const t = run.truths[k - 1]!;
      // Unwrap the estimated heading next to the true one before comparing.
      const e = Float64Array.of(s.x[0]!, s.x[1]!, t[2]! + wrapAngle(s.x[2]! - t[2]!));
      acc[k]! += nees(e, block(s, -1, 3), t) / runs;
    }
  }
  return { nees: acc, bounds: averageBounds(3, runs) };
}
