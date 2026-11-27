/**
 * The model behind Post 32's DriveYourOwnSLAM widget: a complete, small 2D SLAM system.
 *
 *  - Simulation: a robot driven by (v, ω) commands, noisy wheel odometry, a range–bearing sensor that sees
 *    landmarks within `range`, and occasional ghost readings: reflections that appear 0.4–0.9 m from a real
 *    landmark, close enough to be paired with it.
 *  - Front end: each reading is turned into a landmark position from the current pose estimate and paired with
 *    the nearest mapped landmark within `gate` metres, or starts a new landmark. Pairing a reading with a
 *    landmark mapped long ago is a loop closure; switching off loop closure allows pairing only with landmarks
 *    seen in the last `window` steps, so revisited landmarks are mapped again as duplicates.
 *  - Back end: a factor graph with a prior on the first pose, odometry factors and one range–bearing factor per
 *    paired reading, re-optimized after every step by a few Levenberg–Marquardt iterations from the previous
 *    solution, optionally with a Cauchy kernel on the readings.
 *
 * Everything is deterministic given the seed and the sequence of commands, so a drive can be replayed.
 */
import * as se2 from '../geometry/se2';
import { wrapAngle } from '../geometry/so2';
import { betweenFactorSE2, priorFactorSE2, rangeBearingFactor, type Factor } from '../graph/factors';
import { kernel, robustHooks } from '../graph/robust';
import { optimizeGraph } from '../graph/solver';
import { getPoint, getPose2, point2, pose2, type Values } from '../graph/values';
import { diag } from '../math/matrix';
import { createRng, type Rng } from '../math/rng';
import { inverseRangeBearing, rangeBearing } from '../models/range-bearing';
import { velocityMotion, type VelocityControl } from '../models/unicycle';

export interface SlamConfig {
  loopClosure: boolean;
  robust: boolean;
  /** Probability per step of one ghost reading (a reflection near a real landmark). */
  clutter: number;
  seed: number;
}

export const MINI = {
  defaults: { loopClosure: true, robust: true, clutter: 0.8, seed: 34 } satisfies SlamConfig,
  dt: 0.5,
  range: 5,
  gate: 1.2,
  window: 30,
  sigma: { v: 0.03, w: 0.03, range: 0.08, bearingDeg: 2 },
  /** Landmarks in a 24 × 16 m area (fixed layout). */
  landmarkSeed: 3201,
  landmarkCount: 36,
  minSpacing: 2.5,
  /** An unpaired reading becomes a landmark only if seen again (within `gate`) within this many steps. */
  confirmSteps: 3,
  extent: [12, 8] as [number, number],
  iterationsPerStep: 3,
  /** More iterations on a step with a loop closure, so the big correction settles before the next pairing. */
  iterationsOnClosure: 10,
  robustScale: 2,
} as const;

/** Landmarks scattered at random, but at least `minSpacing` apart (rejection sampling with a fixed seed). */
export function landmarks(): [number, number][] {
  const rng = createRng(MINI.landmarkSeed);
  const out: [number, number][] = [];
  while (out.length < MINI.landmarkCount) {
    const p: [number, number] = [
      Math.round(rng.uniformRange(-MINI.extent[0], MINI.extent[0]) * 10) / 10,
      Math.round(rng.uniformRange(-MINI.extent[1], MINI.extent[1]) * 10) / 10,
    ];
    if (out.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) >= MINI.minSpacing)) out.push(p);
  }
  return out;
}

/** The autopilot: two laps of a rounded rectangle, as (v, ω) commands. */
export function autopilot(): VelocityControl[] {
  const out: VelocityControl[] = [];
  const v = 1;
  const leg = (meters: number) => {
    for (let i = 0; i < Math.round(meters / (v * MINI.dt)); i++) out.push({ v, w: 0 });
  };
  const turn = () => {
    // A quarter turn of radius 1.5 m.
    const n = Math.round(((Math.PI / 2) * 1.5) / (v * MINI.dt));
    for (let i = 0; i < n; i++) out.push({ v, w: Math.PI / 2 / (n * MINI.dt) });
  };
  for (let lap = 0; lap < 2; lap++) {
    leg(16);
    turn();
    leg(8);
    turn();
    leg(16);
    turn();
    leg(8);
    turn();
  }
  return out;
}

export const START = se2.pose(-8, -6, 0);

export interface MapLandmark {
  key: string;
  /** True landmark this map entry was created from (for scoring only; −1 for clutter). */
  source: number;
  lastSeen: number;
}

export interface PipelineState {
  step: number;
  truth: se2.Pose2[];
  values: Values;
  factors: Factor[];
  map: MapLandmark[];
  /** Readings at the latest step, as world points from the estimate, and what they were paired with. */
  latest: { at: [number, number]; landmark: number; source: number; closure: boolean }[];
  /** Counts so far. */
  pairings: number;
  wrongPairings: number;
  closures: number;
}

const poseKey = (k: number) => `x${k}`;

export interface Pipeline {
  readonly state: PipelineState;
  step(u: VelocityControl): PipelineState;
}

export function createPipeline(cfg: SlamConfig): Pipeline {
  const rng: Rng = createRng(cfg.seed);
  const L = landmarks();
  const s = MINI.sigma;
  // Odometry noise per step: along the motion σ_v Δt, heading σ_ω Δt (and a little sideways, from the turn).
  const odomInfo = diag([1 / (s.v * MINI.dt) ** 2, 1 / (0.5 * s.w * MINI.dt * MINI.dt) ** 2, 1 / (s.w * MINI.dt) ** 2]);
  const R = diag([1 / s.range ** 2, 1 / ((s.bearingDeg * Math.PI) / 180) ** 2]);
  const state: PipelineState = {
    step: 0,
    truth: [START],
    values: new Map([[poseKey(0), pose2(START)]]),
    factors: [priorFactorSE2(poseKey(0), START, diag([1e6, 1e6, 1e6]))],
    map: [],
    latest: [],
    pairings: 0,
    wrongPairings: 0,
    closures: 0,
  };
  const candidates: { at: [number, number]; step: number; source: number }[] = [];
  const hooks = cfg.robust ? robustHooks(kernel('cauchy', MINI.robustScale), (f) => f.type === 'range-bearing') : {};
  const step = (u: VelocityControl): PipelineState => {
    const k = state.step + 1;
    // Fixed draws per step: 2 for the wheels, 2 per landmark, 4 for clutter.
    const [a, b] = [rng.normal(), rng.normal()];
    const noise = L.map(() => [rng.normal(), rng.normal()] as const);
    const [c0, c1, c2, c3] = [rng.uniform(), rng.uniform(), rng.uniform(), rng.uniform()];
    // Truth follows the commanded motion; the odometry reports it with noise.
    const prevT = state.truth[k - 1]!;
    const p = velocityMotion(Float64Array.of(prevT.x, prevT.y, prevT.theta), u, MINI.dt);
    const truth = se2.pose(p[0]!, p[1]!, p[2]!);
    state.truth.push(truth);
    const reported: VelocityControl = { v: u.v + s.v * a, w: u.w + s.w * b };
    const q = velocityMotion(Float64Array.of(0, 0, 0), reported, MINI.dt);
    const z = se2.pose(q[0]!, q[1]!, q[2]!);
    // New pose: predicted from the latest estimate of the previous pose.
    const prevEst = getPose2(state.values, poseKey(k - 1));
    const values = new Map(state.values);
    values.set(poseKey(k), pose2(se2.compose(prevEst, z)));
    state.factors.push(betweenFactorSE2(poseKey(k - 1), poseKey(k), z, odomInfo, 'odometry'));
    // Readings: visible landmarks, plus clutter.
    const readings: { z: Float64Array; source: number }[] = [];
    L.forEach((m, j) => {
      const zz = rangeBearing(Float64Array.of(truth.x, truth.y, truth.theta), Float64Array.of(m[0], m[1]));
      if (zz[0]! > MINI.range) return;
      readings.push({
        source: j,
        z: Float64Array.of(
          zz[0]! + s.range * noise[j]![0],
          wrapAngle(zz[1]! + ((s.bearingDeg * Math.PI) / 180) * noise[j]![1]),
        ),
      });
    });
    // A ghost reading (a reflection): a visible landmark seen 0.4–0.9 m away from where it really is. It passes
    // the gate of that landmark, so the front end pairs it, and it becomes an outlier the back end must handle.
    const visible = readings.filter((r) => r.source >= 0);
    if (c0 < cfg.clutter && visible.length) {
      const j = visible[Math.floor(c1 * visible.length)]!.source;
      const ang = 2 * Math.PI * c2;
      const off = 0.4 + 0.5 * c3;
      const gp = Float64Array.of(L[j]![0] + off * Math.cos(ang), L[j]![1] + off * Math.sin(ang));
      const zz = rangeBearing(Float64Array.of(truth.x, truth.y, truth.theta), gp);
      readings.push({ source: -1, z: zz });
    }
    // Front end: pair each reading with the nearest landmark within the gate, or start a new one.
    const est = getPose2(values, poseKey(k));
    const pv = Float64Array.of(est.x, est.y, est.theta);
    state.latest = [];
    for (const r of readings) {
      const w = inverseRangeBearing(pv, r.z);
      let best = -1;
      let bestD: number = MINI.gate;
      state.map.forEach((lm, i) => {
        if (!cfg.loopClosure && k - lm.lastSeen > MINI.window) return;
        const mp = getPoint(values, lm.key);
        const d = Math.hypot(mp[0]! - w[0]!, mp[1]! - w[1]!);
        if (d < bestD) [best, bestD] = [i, d];
      });
      if (best < 0) {
        // Not a known landmark: keep it as a candidate until it is seen again nearby.
        const c = candidates.find(
          (cd) => k - cd.step <= MINI.confirmSteps && Math.hypot(cd.at[0] - w[0]!, cd.at[1] - w[1]!) < MINI.gate,
        );
        if (!c) {
          candidates.push({ at: [w[0]!, w[1]!], step: k, source: r.source });
          continue;
        }
        candidates.splice(candidates.indexOf(c), 1);
        const key = `l${state.map.length}`;
        state.map.push({ key, source: c.source, lastSeen: k });
        values.set(key, point2(w[0]!, w[1]!));
        best = state.map.length - 1;
      } else {
        const lm = state.map[best]!;
        const closure = k - lm.lastSeen > MINI.window;
        if (closure) state.closures++;
        state.pairings++;
        if (lm.source !== r.source) state.wrongPairings++;
        lm.lastSeen = k;
        state.latest.push({ at: [w[0]!, w[1]!], landmark: best, source: r.source, closure });
      }
      state.factors.push(rangeBearingFactor(poseKey(k), state.map[best]!.key, r.z, R));
    }
    // Back end: a few LM iterations from the current estimate.
    const closed = state.latest.some((l) => l.closure);
    const its = optimizeGraph(state.factors, values, {
      method: 'lm',
      maxIterations: closed ? MINI.iterationsOnClosure : MINI.iterationsPerStep,
      ...hooks,
    });
    state.values = its.at(-1)!.values;
    state.step = k;
    return state;
  };
  return {
    get state() {
      return state;
    },
    step,
  };
}

/** Position error of every pose estimate against the truth (RMS) and of the latest pose. */
export function errors(st: PipelineState): { rms: number; latest: number } {
  let s = 0;
  for (let k = 0; k <= st.step; k++) {
    const e = getPose2(st.values, poseKey(k));
    s += (e.x - st.truth[k]!.x) ** 2 + (e.y - st.truth[k]!.y) ** 2;
  }
  const e = getPose2(st.values, poseKey(st.step));
  return {
    rms: Math.sqrt(s / (st.step + 1)),
    latest: Math.hypot(e.x - st.truth[st.step]!.x, e.y - st.truth[st.step]!.y),
  };
}

/** Dead reckoning: the odometry composed from the start, for comparison. */
export function deadReckoningError(cfg: SlamConfig, controls: readonly VelocityControl[]): number {
  const rng = createRng(cfg.seed);
  const L = landmarks();
  let T = START;
  let E = START;
  let s = 0;
  controls.forEach((u) => {
    const [a, b] = [rng.normal(), rng.normal()];
    L.forEach(() => [rng.normal(), rng.normal()]);
    rng.uniform();
    rng.uniform();
    rng.uniform();
    rng.uniform();
    const p = velocityMotion(Float64Array.of(T.x, T.y, T.theta), u, MINI.dt);
    T = se2.pose(p[0]!, p[1]!, p[2]!);
    const q = velocityMotion(
      Float64Array.of(0, 0, 0),
      { v: u.v + MINI.sigma.v * a, w: u.w + MINI.sigma.w * b },
      MINI.dt,
    );
    E = se2.compose(E, se2.pose(q[0]!, q[1]!, q[2]!));
    s += (E.x - T.x) ** 2 + (E.y - T.y) ** 2;
  });
  return Math.sqrt(s / Math.max(1, controls.length));
}

/** Run the autopilot (or any command list) through the pipeline. */
export function runDrive(cfg: SlamConfig, controls: readonly VelocityControl[] = autopilot()): PipelineState {
  const p = createPipeline(cfg);
  for (const u of controls) p.step(u);
  return p.state;
}

export interface Snapshot {
  step: number;
  /** Interleaved x, y of the true and estimated poses. */
  truth: Float64Array;
  estimate: Float64Array;
  robotTrue: [number, number, number];
  robotEst: [number, number, number];
  /** Mapped landmarks: position, and whether it duplicates an earlier entry of the same real landmark. */
  map: { x: number; y: number; duplicate: boolean }[];
  /** Readings at the latest step: where the estimate puts them, the landmark paired, ghost or not, closure or not. */
  latest: { at: [number, number]; to: [number, number]; ghost: boolean; closure: boolean }[];
  rms: number;
  latestError: number;
  pairings: number;
  wrongPairings: number;
  closures: number;
}

/** A compact, transferable summary of the pipeline state, for drawing. */
export function snapshot(st: PipelineState): Snapshot {
  const truth = Float64Array.from(st.truth.flatMap((p) => [p.x, p.y]));
  const est = Array.from({ length: st.step + 1 }, (_, k) => getPose2(st.values, poseKey(k)));
  const seen = new Set<number>();
  const map = st.map.map((m) => {
    const p = getPoint(st.values, m.key);
    const duplicate = m.source >= 0 && seen.has(m.source);
    if (m.source >= 0) seen.add(m.source);
    return { x: p[0]!, y: p[1]!, duplicate };
  });
  const e = errors(st);
  const t = st.truth[st.step]!;
  const r = est[st.step]!;
  return {
    step: st.step,
    truth,
    estimate: Float64Array.from(est.flatMap((p) => [p.x, p.y])),
    robotTrue: [t.x, t.y, t.theta],
    robotEst: [r.x, r.y, r.theta],
    map,
    latest: st.latest.map((l) => ({
      at: l.at,
      to: [map[l.landmark]!.x, map[l.landmark]!.y],
      ghost: l.source < 0,
      closure: l.closure,
    })),
    rms: e.rms,
    latestError: e.latest,
    pairings: st.pairings,
    wrongPairings: st.wrongPairings,
    closures: st.closures,
  };
}

/** Manual driving: forward, or forward while turning left or right. */
export const MANUAL: Record<'forward' | 'left' | 'right', VelocityControl> = {
  forward: { v: 1, w: 0 },
  left: { v: 1, w: 0.8 },
  right: { v: 1, w: -0.8 },
};
