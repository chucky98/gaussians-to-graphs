/**
 * The model behind Post 23's CorrelationsEmerge widget: EKF-SLAM on a small loop with six landmarks.
 * At every step it reports the estimates, their 95% ellipses and the strength of every correlation
 * (largest canonical correlation) between the robot's position and each landmark, and between landmarks.
 */
import { block, canonicalCorrelation, type SlamState } from '../filters/ekf-slam';
import type { Mat } from '../math/matrix';
import { runEkfSlam, simulateWorld, type SlamStep, type World, type WorldRun } from './slam-world';

/** Six landmarks around a 4 m circle, alternately 1.6 m outside and 1.4 m inside it. */
const LANDMARKS: [number, number][] = Array.from({ length: 6 }, (_, i) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / 6 + 0.3;
  const r = i % 2 ? 2.6 : 5.6;
  return [r * Math.cos(a), r * Math.sin(a)];
});

export const CORR = {
  world: {
    landmarks: LANDMARKS,
    radius: 4,
    speed: 0.5,
    steps: 120,
    dt: 0.5,
    sigmaV: 0.05,
    sigmaW: 0.05,
    sigmaR: 0.1,
    sigmaPhiDeg: 2,
    range: 2.5,
  } satisfies World,
  /** Most typical of seeds 1–40 (robot and landmark uncertainty before and after closing the loop, error). */
  seed: 20,
  /** Correlations weaker than this are not drawn. */
  minLink: 0.2,
} as const;

export interface CorrRun {
  run: WorldRun;
  steps: SlamStep[];
}

export function corrRun(seed: number = CORR.seed): CorrRun {
  const run = simulateWorld(CORR.world, seed);
  return { run, steps: runEkfSlam(CORR.world, run) };
}

/** The loop closure: the first step, after the start, at which landmark 0 is seen again after being out of view. */
export function closureStep(r: CorrRun): number {
  return r.steps.findIndex((s, k) => k > 20 && s.seen.includes(0) && !r.steps[k - 1]!.seen.includes(0));
}

export interface Link {
  /** Slot of one end (−1 = robot) and of the other. */
  a: number;
  b: number;
  rho: number;
}

export interface Snapshot {
  state: SlamState;
  robotCov: Mat;
  landmarks: { id: number; slot: number; mean: [number, number]; cov: Mat }[];
  links: Link[];
  /** √(σx² + σy²) of the robot position, and the mean of that quantity over the landmarks. */
  robotSd: number;
  meanLandmarkSd: number;
}

const sd2 = (m: Mat) => Math.sqrt(m.data[0]! + m.data[3]!);

export function snapshot(r: CorrRun, k: number): Snapshot {
  const s = r.steps[k]!.state;
  const landmarks = s.ids.map((id, slot) => ({
    id,
    slot,
    mean: [s.x[3 + 2 * slot]!, s.x[4 + 2 * slot]!] as [number, number],
    cov: block(s, slot),
  }));
  const links: Link[] = [];
  for (let a = -1; a < s.ids.length; a++)
    for (let b = a + 1; b < s.ids.length; b++) links.push({ a, b, rho: canonicalCorrelation(s, a, b) });
  const robotCov = block(s, -1);
  return {
    state: s,
    robotCov,
    landmarks,
    links,
    robotSd: sd2(robotCov),
    meanLandmarkSd: landmarks.length ? landmarks.reduce((t, l) => t + sd2(l.cov), 0) / landmarks.length : 0,
  };
}

/** √(σx² + σy²) of one landmark (by identity) at step k, or NaN if it is not yet in the map. */
export function landmarkSd(r: CorrRun, k: number, id: number): number {
  const s = r.steps[k]!.state;
  const j = s.ids.indexOf(id);
  return j < 0 ? NaN : sd2(block(s, j));
}
