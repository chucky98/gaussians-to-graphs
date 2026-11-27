/** Pure model behind the DriftFan widget (post 01): odometry-only runs around a loop. */
import { between, pose, type Pose2 } from '../geometry/se2';
import { betweenFactorSE2, priorFactorSE2, type Factor } from '../graph/factors';
import { optimizeGraph } from '../graph/solver';
import { getPose2, pose2, values } from '../graph/values';
import { angleDiff } from '../geometry/so2';
import { diag, vec, type Mat } from '../math/matrix';
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

// ---------------------------------------------------------------- closing the loop (Post 1 follow-up, Part 4)

/**
 * Each run again, but optimized as a pose graph (Post 27) with two loop closures: at the end of each lap the
 * robot recognizes its starting point. The odometry factors carry the run's own noisy readings with their true
 * noise level; the loop closures say "this pose is the start", to within 2 cm and 0.5°. Every pose of the run
 * is corrected using all of its data (this is smoothing, not filtering).
 */
export function closeLoops(p: DriftParams): Pose2[][] {
  const { start, readings } = LOOP;
  const level = Math.max(p.noisePct / 100, 1e-4);
  const truth = deadReckon(start, readings);
  return Array.from({ length: p.runs }, (_, r) => {
    const noisy = applyOdometryNoise(
      readings,
      p.noisePct / 100,
      odometryNoiseDraws(runSeed(p.seed, r), readings.length),
    );
    const odometry = noisy.map((u, k) => ({ i: k, j: k + 1, z: pose(u.d, 0, u.dtheta) }));
    const initial = deadReckon(start, noisy);
    const factors: Factor[] = [priorFactorSE2('x0', start, diag([1e8, 1e8, 1e8]))];
    noisy.forEach((_, k) => {
      const s2 = level * level * readings[k]!.d;
      factors.push(betweenFactorSE2(`x${k}`, `x${k + 1}`, odometry[k]!.z, diag([1 / s2, 1e6, 1 / s2]), 'odometry'));
    });
    const loopInfo = diag([1 / 0.02 ** 2, 1 / 0.02 ** 2, 1 / ((0.5 * Math.PI) / 180) ** 2]);
    for (const end of [LAP_STEPS, 2 * LAP_STEPS])
      factors.push(betweenFactorSE2('x0', `x${end}`, between(truth[0]!, truth[end]!), loopInfo, 'loop'));
    const v = values(initial.map((q, k) => [`x${k}`, pose2(q)] as const));
    const its = optimizeGraph(factors, v, { method: 'gn', maxIterations: 5 });
    const out = its.at(-1)!.values;
    return initial.map((_, k) => getPose2(out, `x${k}`));
  });
}
