/**
 * Simulated worlds for the EKF-SLAM posts (23–25): a robot drives laps of a circle through a field of
 * point landmarks, with noisy wheels and a range–bearing sensor of limited range. Readings carry the true
 * landmark identity; Post 25 hides it from the filter.
 */
import { wrapAngle } from '../geometry/so2';
import { diag, vec, type Mat, type Vec } from '../math/matrix';
import { createRng } from '../math/rng';
import { rangeBearing } from '../models/range-bearing';
import { velocityMotion, type VelocityControl } from '../models/unicycle';
import { slamAddLandmark, slamInit, slamPredict, slamUpdate, slotOf, type SlamState } from '../filters/ekf-slam';

const DEG = Math.PI / 180;

export interface World {
  landmarks: readonly (readonly [number, number])[];
  /** Circle the robot drives around (centre at the origin), its speed, and the number of steps. */
  radius: number;
  speed: number;
  steps: number;
  dt: number;
  /** Wheel noise (std of v in m/s and ω in rad/s) and sensor noise (m, degrees); sensor range (m). */
  sigmaV: number;
  sigmaW: number;
  sigmaR: number;
  sigmaPhiDeg: number;
  range: number;
}

export interface Reading {
  id: number;
  z: Vec;
}

export interface WorldRun {
  start: Vec;
  /** Controls as reported by the odometry (what the filter uses). */
  controls: VelocityControl[];
  /** True pose after each step. */
  truths: Vec[];
  /** Readings taken after each step. */
  readings: Reading[][];
}

/** Start at the bottom of the circle, heading counter-clockwise. */
export const startPose = (w: World): Vec => vec([0, -w.radius, 0]);

export function simulateWorld(w: World, seed: number): WorldRun {
  const rng = createRng(seed);
  const start = startPose(w);
  const u: VelocityControl = { v: w.speed, w: w.speed / w.radius };
  let truth = start;
  const controls: VelocityControl[] = [];
  const truths: Vec[] = [];
  const readings: Reading[][] = [];
  for (let k = 0; k < w.steps; k++) {
    // A fixed number of draws per step (2 for the wheels, 2 per landmark), whatever is visible.
    const a = rng.normal();
    const b = rng.normal();
    const noise = w.landmarks.map(() => [rng.normal(), rng.normal()] as const);
    // The robot follows its planned circle exactly; its odometry reports the controls with noise, and
    // the filter only sees the reports. (Statistically the same as noisy motion with exact reports, but the
    // path, and so which landmarks are seen when, does not depend on the seed.)
    truth = velocityMotion(truth, u, w.dt);
    const r: Reading[] = [];
    w.landmarks.forEach((m, id) => {
      const z0 = rangeBearing(truth, vec([m[0], m[1]]));
      if (z0[0]! > w.range) return;
      r.push({
        id,
        z: vec([z0[0]! + w.sigmaR * noise[id]![0], wrapAngle(z0[1]! + w.sigmaPhiDeg * DEG * noise[id]![1])]),
      });
    });
    controls.push({ v: u.v + w.sigmaV * a, w: u.w + w.sigmaW * b });
    truths.push(truth);
    readings.push(r);
  }
  return { start, controls, truths, readings };
}

export const controlNoise = (w: World): Mat => diag([w.sigmaV ** 2, w.sigmaW ** 2]);
export const sensorNoise = (w: World): Mat => diag([w.sigmaR ** 2, (w.sigmaPhiDeg * DEG) ** 2]);

export interface SlamStep {
  state: SlamState;
  /** Identities read at this step, and which of them were first sightings. */
  seen: number[];
  added: number[];
}

/**
 * EKF-SLAM with known data association. The start pose is known exactly (it defines the map's frame).
 * Returns the state after every step; index 0 is the start.
 */
export function runEkfSlam(w: World, run: WorldRun): SlamStep[] {
  let s = slamInit(run.start, diag([1e-10, 1e-10, 1e-10]));
  const M = controlNoise(w);
  const R = sensorNoise(w);
  const out: SlamStep[] = [{ state: s, seen: [], added: [] }];
  for (let k = 0; k < w.steps; k++) {
    s = slamPredict(s, run.controls[k]!, w.dt, M);
    const added: number[] = [];
    for (const r of run.readings[k]!) {
      const j = slotOf(s, r.id);
      if (j < 0) {
        s = slamAddLandmark(s, r.z, R, r.id);
        added.push(r.id);
      } else s = slamUpdate(s, r.z, j, R).state;
    }
    out.push({ state: s, seen: run.readings[k]!.map((r) => r.id), added });
  }
  return out;
}
