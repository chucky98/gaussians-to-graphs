/** Pure model behind the DriftFan widget (post 01): odometry-only runs around a loop. */
import type { Pose2 } from '../geometry/se2';
import { angleDiff } from '../geometry/so2';
import { vec, type Mat } from '../math/matrix';
import { sampleCov } from '../math/stats';
import { applyOdometryNoise, deadReckon, odometryNoiseDraws, runSeed } from '../sim/odometry';
import { stadiumLoop } from '../sim/trajectories';

export const DRIFT_DEFAULTS = {
  /** Noise level p as a percentage: error std per √metre (cm per √m and 0.01 rad per √m). */
  noisePct: 3,
  runs: 30,
  seed: 1,
  showTruth: true,
} as const;

export const DRIFT_LIMITS = {
  noisePct: { min: 0, max: 10, step: 0.5 },
  runs: { min: 1, max: 100, step: 1 },
  xDomain: [-10, 10] as [number, number],
  yDomain: [-7, 7] as [number, number],
} as const;

export interface DriftParams {
  noisePct: number;
  runs: number;
  seed: number;
}

export interface DriftSim {
  truth: Pose2[];
  /** runs[r][k]: dead-reckoned pose of run r after k readings. */
  runs: Pose2[][];
  /** Distance driven after k readings, metres. */
  distance: Float64Array;
  /** Index k at which each lap ends. */
  lapEnds: number[];
  /** Number of readings K (poses are indexed 0..K). */
  steps: number;
}

const LOOP = stadiumLoop();
const LAP_STEPS = LOOP.readings.length / 2;
/** Number of odometry readings in the two-lap drive. */
export const DRIFT_STEPS = LOOP.readings.length;

/** Simulate all runs. Run r always uses the same noise draws, so changing p or N is smooth. */
export function simulate(p: DriftParams): DriftSim {
  const { start, readings } = LOOP;
  const truth = deadReckon(start, readings);
  const level = p.noisePct / 100;
  const runs = Array.from({ length: p.runs }, (_, r) =>
    deadReckon(start, applyOdometryNoise(readings, level, odometryNoiseDraws(runSeed(p.seed, r), readings.length))),
  );
  const distance = new Float64Array(readings.length + 1);
  readings.forEach((u, k) => (distance[k + 1] = distance[k]! + u.d));
  return { truth, runs, distance, lapEnds: [LAP_STEPS, 2 * LAP_STEPS], steps: readings.length };
}

/** Position error of each run at step k (Euclidean distance to the truth), metres. */
export function positionErrors(sim: DriftSim, k: number): number[] {
  const t = sim.truth[k]!;
  return sim.runs.map((run) => Math.hypot(run[k]!.x - t.x, run[k]!.y - t.y));
}

/** Root-mean-square position error over runs at step k. */
export function rmsError(sim: DriftSim, k: number): number {
  const e = positionErrors(sim, k);
  return e.length === 0 ? 0 : Math.sqrt(e.reduce((s, v) => s + v * v, 0) / e.length);
}

/** RMS heading error over runs at step k, radians. */
export function rmsHeadingError(sim: DriftSim, k: number): number {
  const t = sim.truth[k]!.theta;
  const e = sim.runs.map((run) => angleDiff(run[k]!.theta, t));
  return e.length === 0 ? 0 : Math.sqrt(e.reduce((s, v) => s + v * v, 0) / e.length);
}

/** RMS error curve over all steps. */
export function rmsCurve(sim: DriftSim): Float64Array {
  return Float64Array.from({ length: sim.steps + 1 }, (_, k) => rmsError(sim, k));
}

/** Sample mean and covariance of the runs' positions at step k (null with fewer than 3 runs or no spread). */
export function spreadAt(sim: DriftSim, k: number): { mean: [number, number]; cov: Mat } | null {
  if (sim.runs.length < 3) return null;
  const s = sampleCov(sim.runs.map((run) => vec([run[k]!.x, run[k]!.y])));
  const det = s.cov.data[0]! * s.cov.data[3]! - s.cov.data[1]! ** 2;
  if (!(det > 1e-12)) return null;
  return { mean: [s.mean[0]!, s.mean[1]!], cov: s.cov };
}

/** Interleaved [x0, y0, x1, y1, …] of one trajectory, for canvas drawing. */
export function toXY(poses: readonly Pose2[]): Float64Array {
  const out = new Float64Array(2 * poses.length);
  poses.forEach((q, i) => {
    out[2 * i] = q.x;
    out[2 * i + 1] = q.y;
  });
  return out;
}
