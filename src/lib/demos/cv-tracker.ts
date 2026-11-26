/**
 * Pure model behind the CVTracker2D widget (post 12): a warehouse's ceiling cameras report a
 * forklift's position once per second. A constant-velocity Kalman filter estimates its position and
 * its velocity, which nobody measures.
 */
import { kfRun, type KfState, type KfStep } from '../filters/kf';
import { diag, vec, type Vec } from '../math/matrix';
import { createRng } from '../math/rng';
import { cvModel } from '../models/linear';

export type CvPreset = 'wander' | 'turn';

export const CV = {
  steps: 40,
  dt: 1,
  /** Filter prior: position (5, 15) ± 2 m; velocity unknown, (0, 0) ± 2 m/s (1σ per axis). */
  prior: { x: [5, 15, 0, 0], sd: [2, 2, 2, 2] },
  /** The true forklift starts near the prior position, driving east at about 1.5 m/s. */
  truthStart: { v: [1.5, 0], vSd: 0.2 },
  seed: 50,
  /** "turn" preset: east at 1.4 m/s, then a quick left turn to north at t = 20 s. */
  turn: { speed: 1.4, at: 20, over: 2 },
};

export interface CvParams {
  /** White-noise acceleration density q (m²/s³): the velocity wanders by √(q dt) per step. */
  q: number;
  /** Camera position noise σ (m). */
  sigma: number;
}

export const CV_DEFAULTS: CvParams = { q: 0.01, sigma: 0.5 };
export const CV_LIMITS = {
  q: { min: 0.001, max: 1, step: 0.001 },
  sigma: { min: 0.1, max: 2, step: 0.05 },
};

export const model = (p: CvParams) => cvModel(2, CV.dt, p.q, p.sigma);
export const priorState = (): KfState => ({ x: vec(CV.prior.x), P: diag(CV.prior.sd.map((s) => s * s)) });

export interface CvScenario {
  /** True states [px, py, vx, vy] at t = 0 … steps. */
  truth: Vec[];
  zs: Vec[];
}

/**
 * "wander": the truth follows the filter's own model (initial state drawn from the prior, velocity
 * random walk with density q). "turn": a scripted path the model does not expect. Normal draws come in
 * a fixed order, so changing q or σ rescales the same luck.
 */
export function makeScenario(preset: CvPreset, p: CvParams, seed = CV.seed): CvScenario {
  const rng = createRng(seed);
  const n0 = [rng.normal(), rng.normal(), rng.normal(), rng.normal()];
  const truth: Vec[] = [];
  const zs: Vec[] = [];
  const dt = CV.dt;
  if (preset === 'wander') {
    const v0 = CV.truthStart.v;
    let x = vec([
      CV.prior.x[0]! + CV.prior.sd[0]! * n0[0]!,
      CV.prior.x[1]! + CV.prior.sd[1]! * n0[1]!,
      v0[0]! + CV.truthStart.vSd * n0[2]!,
      v0[1]! + CV.truthStart.vSd * n0[3]!,
    ]);
    truth.push(x);
    for (let k = 1; k <= CV.steps; k++) {
      // Exact discretization of white-noise acceleration: velocity jump and its correlated position part.
      const a1 = rng.normal();
      const a2 = rng.normal();
      const b1 = rng.normal();
      const b2 = rng.normal();
      const sv = Math.sqrt(p.q * dt);
      const dvx = sv * a1;
      const dvy = sv * a2;
      // Position part: conditional on dv, extra variance q dt³/12 (Q = q[[dt³/3, dt²/2],[dt²/2, dt]]).
      const sp = Math.sqrt((p.q * dt ** 3) / 12);
      x = vec([
        x[0]! + x[2]! * dt + (dvx * dt) / 2 + sp * b1,
        x[1]! + x[3]! * dt + (dvy * dt) / 2 + sp * b2,
        x[2]! + dvx,
        x[3]! + dvy,
      ]);
      truth.push(x);
      zs.push(vec([x[0]! + p.sigma * rng.normal(), x[1]! + p.sigma * rng.normal()]));
    }
  } else {
    const { speed, at, over } = CV.turn;
    const heading = (t: number) => (t <= at ? 0 : t >= at + over ? Math.PI / 2 : ((t - at) / over) * (Math.PI / 2));
    let px = CV.prior.x[0]!;
    let py = CV.prior.x[1]!;
    truth.push(vec([px, py, speed, 0]));
    for (let k = 1; k <= CV.steps; k++) {
      // Integrate the path finely so the turn is a smooth arc.
      for (let j = 0; j < 20; j++) {
        const t = (k - 1) * dt + ((j + 0.5) * dt) / 20;
        px += (speed * Math.cos(heading(t)) * dt) / 20;
        py += (speed * Math.sin(heading(t)) * dt) / 20;
      }
      const h = heading(k * dt);
      truth.push(vec([px, py, speed * Math.cos(h), speed * Math.sin(h)]));
      // Keep the same number of draws per step as "wander".
      rng.normal();
      rng.normal();
      rng.normal();
      rng.normal();
      zs.push(vec([px + p.sigma * rng.normal(), py + p.sigma * rng.normal()]));
    }
  }
  return { truth, zs };
}

export function runCv(s: CvScenario, p: CvParams): KfStep[] {
  return kfRun(priorState(), model(p), s.zs);
}

/** Half-steps as in Tracker1D: t = 2k − 1 after the prediction of step k, t = 2k after its update. */
export const T_MAX = 2 * CV.steps;
export function stateAt(steps: readonly KfStep[], t: number): KfState {
  if (t <= 0) return priorState();
  const k = Math.ceil(t / 2);
  return t % 2 === 1 ? steps[k - 1]!.prior : steps[k - 1]!.post;
}

export const speedOf = (x: Vec) => Math.hypot(x[2]!, x[3]!);
/** Standard deviation of one state component. */
export const sdOf = (s: KfState, i: number) => Math.sqrt(s.P.data[i * 4 + i]!);

/** Fraction of steps whose updated vx lies within ±1.96σ of the truth. */
export function velocityCoverage(steps: readonly KfStep[], truth: readonly Vec[], comp = 2): number {
  let inside = 0;
  for (let k = 1; k <= steps.length; k++) {
    const s = steps[k - 1]!.post;
    if (Math.abs(s.x[comp]! - truth[k]![comp]!) <= 1.96 * sdOf(s, comp)) inside++;
  }
  return inside / steps.length;
}

/** Plot window: the bounding box of the path and the fixes, padded, at least 20 m × 12 m. */
export function viewBox(s: CvScenario): { x: [number, number]; y: [number, number] } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of [...s.truth, ...s.zs]) {
    x0 = Math.min(x0, p[0]!);
    x1 = Math.max(x1, p[0]!);
    y0 = Math.min(y0, p[1]!);
    y1 = Math.max(y1, p[1]!);
  }
  const pad = 3;
  const grow = (a: number, b: number, min: number): [number, number] => {
    const c = (a + b) / 2;
    const h = Math.max((b - a) / 2 + pad, min / 2);
    return [Math.floor(c - h), Math.ceil(c + h)];
  };
  return { x: grow(x0, x1, 20), y: grow(y0, y1, 12) };
}
