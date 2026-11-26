/**
 * Pure model behind the EKFLocalization widget (post 15): the delivery robot drives a loop around a
 * hall whose reflective markers are mapped. Its wheels follow the commands only approximately; its
 * lidar measures the range and bearing of markers within range. An EKF localizes it.
 */
import { ekfPredict, ekfUpdate, type NonlinearMeasurement, type NonlinearMotion } from '../filters/ekf';
import { nees } from '../filters/consistency';
import type { KfState } from '../filters/kf';
import { wrapAngle } from '../geometry/so2';
import { diag, mul, transpose, vec, type Vec } from '../math/matrix';
import { createRng } from '../math/rng';
import { rangeBearing, rangeBearingJacobians } from '../models/range-bearing';
import {
  velocityJacobianControl,
  velocityJacobianState,
  velocityMotion,
  type VelocityControl,
} from '../models/unicycle';

export const HALL = {
  area: { x: [-2, 22] as [number, number], y: [-2, 14] as [number, number] },
  landmarks: [
    [2, 10],
    [8, 12.5],
    [14, 11],
    [19.5, 8],
    [18, 1],
    [12, -0.5],
    [5, 0.5],
    [10, 6],
  ] as [number, number][],
  start: [2, 2, 0] as [number, number, number],
  dt: 0.5,
  seed: 155,
};

export interface EkfParams {
  /** Wheel noise: actual speed and turn rate around the command. */
  sigmaV: number;
  sigmaW: number;
  /** Lidar noise and range. */
  sigmaR: number;
  sigmaPhiDeg: number;
  range: number;
  /** Initial estimate error (m, m, degrees) and the filter's initial standard deviations. */
  initErr: [number, number, number];
  initSd: [number, number, number];
}

export type EkfPreset = 'default' | 'blind' | 'lost';
export const EKF_PRESETS: Record<EkfPreset, EkfParams> = {
  default: {
    sigmaV: 0.1,
    sigmaW: 0.05,
    sigmaR: 0.1,
    sigmaPhiDeg: 2,
    range: 5,
    initErr: [0, 0, 0],
    initSd: [0.1, 0.1, 2],
  },
  /** No markers within reach: the EKF can only dead-reckon. */
  blind: {
    sigmaV: 0.1,
    sigmaW: 0.05,
    sigmaR: 0.1,
    sigmaPhiDeg: 2,
    range: 0,
    initErr: [0, 0, 0],
    initSd: [0.1, 0.1, 2],
  },
  /** Starts 4.5 m off and facing the wrong way by 150°, and says it has no idea of its heading. */
  lost: {
    sigmaV: 0.1,
    sigmaW: 0.05,
    sigmaR: 0.1,
    sigmaPhiDeg: 2,
    range: 5,
    initErr: [4, -2, 150],
    initSd: [3, 3, 180],
  },
};

export const EKF_LIMITS = {
  sigmaW: { min: 0.005, max: 0.2, step: 0.005 },
  sigmaPhiDeg: { min: 0.5, max: 15, step: 0.5 },
  range: { min: 0, max: 12, step: 0.5 },
};

const deg = Math.PI / 180;

/** The commanded route: one lap of a rounded rectangle at 1 m/s, then the first straight again. */
export function route(): VelocityControl[] {
  const straight = (m: number) => Array.from({ length: Math.round(m / HALL.dt) }, () => ({ v: 1, w: 0 }));
  const turn = () => Array.from({ length: Math.round(2 / HALL.dt) }, () => ({ v: 1, w: Math.PI / 4 }));
  const lap = [
    ...straight(14),
    ...turn(),
    ...straight(6),
    ...turn(),
    ...straight(14),
    ...turn(),
    ...straight(6),
    ...turn(),
  ];
  return [...lap, ...straight(12)];
}

export interface Sighting {
  index: number;
  z: Vec;
}

export interface EkfStep {
  truth: Vec;
  /** Dead reckoning: the commands integrated without any sensing. */
  odom: Vec;
  prior: KfState;
  post: KfState;
  seen: Sighting[];
  nees: number;
}

export interface EkfRun {
  init: KfState;
  truth0: Vec;
  steps: EkfStep[];
}

const motion = (p: EkfParams): NonlinearMotion<VelocityControl> => {
  const M = diag([p.sigmaV ** 2, p.sigmaW ** 2]);
  return {
    f: (x, u) => velocityMotion(x, u, HALL.dt),
    F: (x, u) => velocityJacobianState(x, u, HALL.dt),
    Q: (x, u) => {
      const V = velocityJacobianControl(x, u, HALL.dt);
      return mul(mul(V, M), transpose(V));
    },
    normalize: (x) => vec([x[0]!, x[1]!, wrapAngle(x[2]!)]),
  };
};

const measurement = (p: EkfParams, m: Vec): NonlinearMeasurement => ({
  h: (x) => rangeBearing(x, m),
  H: (x) => rangeBearingJacobians(x, m).Hx,
  R: diag([p.sigmaR ** 2, (p.sigmaPhiDeg * deg) ** 2]),
  residual: (z, zh) => vec([z[0]! - zh[0]!, wrapAngle(z[1]! - zh[1]!)]),
});

/** Pose error with a wrapped heading. */
export const poseError = (a: Vec, b: Vec) => vec([a[0]! - b[0]!, a[1]! - b[1]!, wrapAngle(a[2]! - b[2]!)]);

export function runEkf(p: EkfParams, seed = HALL.seed): EkfRun {
  const rng = createRng(seed);
  const cmds = route();
  const truth0 = vec(HALL.start);
  const init: KfState = {
    x: vec([truth0[0]! + p.initErr[0], truth0[1]! + p.initErr[1], wrapAngle(truth0[2]! + p.initErr[2] * deg)]),
    P: diag([p.initSd[0] ** 2, p.initSd[1] ** 2, (p.initSd[2] * deg) ** 2]),
  };
  const mot = motion(p);
  const marks = HALL.landmarks.map(([x, y]) => vec([x, y]));
  let truth = truth0;
  let odom = init.x;
  let s = init;
  const steps: EkfStep[] = [];
  for (const u of cmds) {
    // Fixed number of draws per step (2 for the wheels, 2 per marker), whatever is visible.
    const a = rng.normal();
    const b = rng.normal();
    const noise = marks.map(() => [rng.normal(), rng.normal()] as const);
    truth = velocityMotion(truth, { v: u.v + p.sigmaV * a, w: u.w + p.sigmaW * b }, HALL.dt);
    odom = velocityMotion(odom, u, HALL.dt);
    const prior = ekfPredict(s, mot, u);
    let post = prior;
    const seen: Sighting[] = [];
    marks.forEach((m, index) => {
      const z0 = rangeBearing(truth, m);
      if (z0[0]! > p.range) return;
      const z = vec([z0[0]! + p.sigmaR * noise[index]![0], wrapAngle(z0[1]! + p.sigmaPhiDeg * deg * noise[index]![1])]);
      seen.push({ index, z });
      post = ekfUpdate(post, z, measurement(p, m), { normalize: mot.normalize }).state;
    });
    s = post;
    const e = poseError(post.x, truth);
    steps.push({ truth, odom, prior, post, seen, nees: nees(e, post.P, vec([0, 0, 0])) });
  }
  return { init, truth0, steps };
}

export const posErr = (x: Vec, t: Vec) => Math.hypot(x[0]! - t[0]!, x[1]! - t[1]!);

/** Fraction of steps whose NEES is inside the single-run 95% χ²₃ interval [0.216, 9.348]. */
export function neesCoverage(r: EkfRun, from = 0): number {
  const s = r.steps.slice(from);
  return s.filter((x) => x.nees >= 0.2158 && x.nees <= 9.3484).length / s.length;
}
