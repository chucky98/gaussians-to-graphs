/**
 * The models behind Post 25's AssociationGating widget.
 *
 * Scene: a robot faces a "fence" of landmarks 1 m apart. Its pose estimate is off sideways (by a chosen
 * amount) and it knows that it may be: its covariance is large in that direction. Readings come from the
 * true pose, plus optional clutter. Nearest neighbour and JCBB pair readings with landmarks, and the EKF
 * update with each hypothesis shows what the pairing does to the robot's estimate.
 *
 * Run: EKF-SLAM on Post 24's world without labels: every reading is associated by JCBB (or NN), unpaired
 * readings far from every landmark start new landmarks, and one wrong pairing can be forced at the loop
 * closure to show the damage it does.
 */
import { gate, jcbb, nearestNeighbour, compatibility, type Hypothesis } from '../filters/association';
import { slamAddLandmark, slamInit, slamPredict, slamUpdate, type SlamState } from '../filters/ekf-slam';
import { wrapAngle } from '../geometry/so2';
import { diag, vec, zeros, type Mat, type Vec } from '../math/matrix';
import { createRng } from '../math/rng';
import { rangeBearing } from '../models/range-bearing';
import { controlNoise, sensorNoise, simulateWorld, type World, type WorldRun } from './slam-world';
import { SLAM24, world24 } from './ekf-slam-run';

const DEG = Math.PI / 180;

// ---------------------------------------------------------------- scene

export type Method = 'nn' | 'jcbb';

export interface SceneParams {
  /** Sideways error of the robot's position estimate (m). */
  offset: number;
  /** Number of spurious readings. */
  clutter: number;
  /** Gate probability p: pairs with d² ≤ χ²₂(p) are individually compatible. */
  gateProb: number;
}

export const SCENE = {
  defaults: { offset: 0.6, clutter: 0, gateProb: 0.99 } satisfies SceneParams,
  /** Five landmarks 1 m apart, 4 m ahead of the robot, plus one off to the side. */
  landmarks: [
    [4, -2],
    [4, -1],
    [4, 0],
    [4, 1],
    [4, 2],
    [2.5, -2.8],
  ] as [number, number][],
  /** The robot's estimate: σ ahead 0.15 m, sideways 0.6 m, heading 3°; landmarks known to 5 cm. */
  robotSd: [0.15, 0.6, 3] as [number, number, number],
  landmarkSd: 0.05,
  sigmaR: 0.05,
  sigmaPhiDeg: 1,
  range: 6,
  seed: 25,
} as const;

export const sceneR = (): Mat => diag([SCENE.sigmaR ** 2, (SCENE.sigmaPhiDeg * DEG) ** 2]);

export interface Scene {
  truth: Vec;
  state: SlamState;
  readings: Vec[];
  /** True source of each reading: a landmark slot, or −1 for clutter. */
  source: number[];
}

export function makeScene(p: SceneParams, seed: number = SCENE.seed): Scene {
  const rng = createRng(seed);
  const truth = vec([0, 0, 0]);
  const est = vec([0, p.offset, 0]);
  const n = 3 + 2 * SCENE.landmarks.length;
  const x = new Float64Array(n);
  x.set(est);
  const P = zeros(n, n);
  const [sa, sb, st] = SCENE.robotSd;
  P.data[0] = sa ** 2;
  P.data[n + 1] = sb ** 2;
  P.data[2 * n + 2] = (st * DEG) ** 2;
  SCENE.landmarks.forEach((m, j) => {
    x[3 + 2 * j] = m[0];
    x[4 + 2 * j] = m[1];
    P.data[(3 + 2 * j) * n + 3 + 2 * j] = SCENE.landmarkSd ** 2;
    P.data[(4 + 2 * j) * n + 4 + 2 * j] = SCENE.landmarkSd ** 2;
  });
  // Fixed draws: two per landmark, three per clutter slot (up to 8), whatever the parameters.
  const readings: Vec[] = [];
  const source: number[] = [];
  SCENE.landmarks.forEach((m, j) => {
    const z0 = rangeBearing(truth, vec(m));
    const [a, b] = [rng.normal(), rng.normal()];
    readings.push(vec([z0[0]! + SCENE.sigmaR * a, wrapAngle(z0[1]! + SCENE.sigmaPhiDeg * DEG * b)]));
    source.push(j);
  });
  for (let c = 0; c < 8; c++) {
    const [u, v] = [rng.uniform(), rng.uniform()];
    if (c >= p.clutter) continue;
    // Spurious returns spread over the area in front of the robot (1.5 to 6 m, ±50°).
    readings.push(vec([1.5 + 4.5 * u, (-50 + 100 * v) * DEG]));
    source.push(-1);
  }
  return { truth, state: { x, P, ids: SCENE.landmarks.map((_, j) => j) }, readings, source };
}

export function associate(sc: Scene, method: Method, gateProb: number): Hypothesis {
  return method === 'nn'
    ? nearestNeighbour(sc.state, sc.readings, sceneR(), gateProb)
    : jcbb(sc.state, sc.readings, sceneR(), gateProb);
}

export interface Tally {
  correct: number;
  wrong: number;
  /** Clutter paired with a landmark. */
  clutterAccepted: number;
  /** Real readings left unpaired. */
  missed: number;
}

export function tally(sc: Scene, h: Hypothesis): Tally {
  const t: Tally = { correct: 0, wrong: 0, clutterAccepted: 0, missed: 0 };
  h.forEach((j, i) => {
    const s = sc.source[i]!;
    if (j < 0) {
      if (s >= 0) t.missed++;
    } else if (s < 0) t.clutterAccepted++;
    else if (s === j) t.correct++;
    else t.wrong++;
  });
  return t;
}

/** The state after applying the EKF update for every pair of the hypothesis. */
export function applyHypothesis(sc: Scene, h: Hypothesis): SlamState {
  let s = sc.state;
  h.forEach((j, i) => {
    if (j >= 0) s = slamUpdate(s, sc.readings[i]!, j, sceneR()).state;
  });
  return s;
}

export const positionError = (s: SlamState, truth: Vec) => Math.hypot(s.x[0]! - truth[0]!, s.x[1]! - truth[1]!);

/** d² of every reading to every landmark (for display). */
export const sceneCompatibility = (sc: Scene) => compatibility(sc.state, sc.readings, sceneR());

// ---------------------------------------------------------------- run without labels

export interface ForcedError {
  step: number;
  /** True identity of the landmark whose reading is paired wrongly, and the identity it is paired with. */
  from: number;
  to: number;
}

export interface UnlabelledStep {
  state: SlamState;
  robotError: number;
  /** Pairings made at this step: correct and wrong (by true identity), and new landmarks started. */
  correct: number;
  wrong: number;
  created: number;
  /** New landmarks started for a landmark that is already in the map (a duplicate). */
  duplicates: number;
}

export const RUN25 = {
  gateProb: 0.99,
  /** An unpaired reading starts a landmark only if it is outside the χ²₂(0.9999) gate of every landmark. */
  newProb: 0.9999,
  seed: SLAM24.seed,
  /** The forced error: at the loop closure (step 131), the reading of landmark 15 is paired with landmark 14. */
  forced: { step: 131, from: 15, to: 14 } satisfies ForcedError,
} as const;

export function runUnlabelled(
  method: Method,
  forced: ForcedError | null,
  seed: number = RUN25.seed,
  world: World = world24('default'),
): { run: WorldRun; steps: UnlabelledStep[] } {
  const run = simulateWorld(world, seed);
  const M = controlNoise(world);
  const R = sensorNoise(world);
  let s = slamInit(run.start, diag([1e-10, 1e-10, 1e-10]));
  const steps: UnlabelledStep[] = [{ state: s, robotError: 0, correct: 0, wrong: 0, created: 0, duplicates: 0 }];
  const gNew = gate(RUN25.newProb);
  for (let k = 0; k < world.steps; k++) {
    s = slamPredict(s, run.controls[k]!, world.dt, M);
    const rs = run.readings[k]!;
    const zs = rs.map((r) => r.z);
    let h = s.ids.length
      ? method === 'nn'
        ? nearestNeighbour(s, zs, R, RUN25.gateProb)
        : jcbb(s, zs, R, RUN25.gateProb)
      : zs.map(() => -1);
    if (forced && forced.step === k + 1) {
      const i = rs.findIndex((r) => r.id === forced.from);
      const j = s.ids.indexOf(forced.to);
      if (i >= 0 && j >= 0) {
        h = h.map((v) => (v === j ? -1 : v));
        h[i] = j;
      }
    }
    let correct = 0;
    let wrong = 0;
    let created = 0;
    let duplicates = 0;
    const d2 = s.ids.length ? compatibility(s, zs, R) : zs.map(() => []);
    const before = s;
    h.forEach((j, i) => {
      if (j < 0) return;
      if (before.ids[j] === rs[i]!.id) correct++;
      else wrong++;
      s = slamUpdate(s, zs[i]!, j, R).state;
    });
    h.forEach((j, i) => {
      if (j >= 0) return;
      if (d2[i]!.some((v) => v <= gNew)) return; // ambiguous: neither paired nor clearly new
      if (before.ids.includes(rs[i]!.id)) duplicates++;
      s = slamAddLandmark(s, zs[i]!, R, rs[i]!.id);
      created++;
    });
    const t = run.truths[k]!;
    steps.push({
      state: s,
      robotError: Math.hypot(s.x[0]! - t[0]!, s.x[1]! - t[1]!),
      correct,
      wrong,
      created,
      duplicates,
    });
  }
  return { run, steps };
}
