/**
 * Pure model behind the RLSStream widget (post 08): calibrating a robot's drive motor online.
 * Wheel speed ω (rad/s) against PWM duty u (%): ω = x₁ + x₂·u, with x₁ an offset from friction and
 * x₂ the gain. Measurements stream in from the wheel encoder while the robot drives.
 */
import { diag, vec, type Vec } from '../math/matrix';
import { createRng } from '../math/rng';
import { batchSolution, rlsRun, type RlsState, type RlsStep } from '../filters/rls';

export type MotorPreset = 'steady' | 'sag';

export const MOTOR = {
  offset: -1.0,
  gain: 0.25,
  /** Gain after the battery sags (−20%). */
  sagGain: 0.2,
  sagAt: 60,
  steps: 120,
  /** Encoder speed noise (1σ), rad/s. */
  sigma: 0.8,
  dutyRange: [20, 100] as [number, number],
  seed: 8,
  /** Datasheet guess: offset 0 ± 2 rad/s, gain 0.2 ± 0.1 rad/s per %. */
  prior: { x: [0, 0.2] as [number, number], sd: [2, 0.1] as [number, number] },
  betaDefault: 1,
  betaLimits: { min: 0.8, max: 1, step: 0.01 },
};

export interface Stream {
  duty: number[];
  speed: number[];
  /** True gain at each step. */
  trueGain: number[];
}

export function makeStream(preset: MotorPreset, seed: number): Stream {
  const rng = createRng(seed);
  const duty: number[] = [];
  const speed: number[] = [];
  const trueGain: number[] = [];
  for (let k = 0; k < MOTOR.steps; k++) {
    const u = rng.uniformRange(MOTOR.dutyRange[0], MOTOR.dutyRange[1]);
    const g = preset === 'sag' && k >= MOTOR.sagAt ? MOTOR.sagGain : MOTOR.gain;
    duty.push(u);
    trueGain.push(g);
    speed.push(MOTOR.offset + g * u + MOTOR.sigma * rng.normal());
  }
  return { duty, speed, trueGain };
}

export function priorState(): RlsState {
  return { x: vec(MOTOR.prior.x), P: diag(MOTOR.prior.sd.map((s) => s * s)) };
}

export function rows(s: Stream): Vec[] {
  return s.duty.map((u) => vec([1, u]));
}

/** RLS state after each of the stream's measurements. */
export function runRls(s: Stream, beta: number): RlsStep[] {
  return rlsRun(priorState(), rows(s), s.speed, MOTOR.sigma ** 2, beta);
}

/** The batch solution using the first k measurements (same weights as RLS). */
export function batchAt(s: Stream, k: number, beta: number): RlsState {
  return batchSolution(priorState(), rows(s).slice(0, k), s.speed.slice(0, k), MOTOR.sigma ** 2, beta);
}

/** Standard deviation of the fitted speed at duty u: √(aᵀPa), a = (1, u). */
export function lineStd(st: RlsState, u: number): number {
  const P = st.P.data;
  return Math.sqrt(P[0]! + 2 * u * P[1]! + u * u * P[3]!);
}

/** First step after `from` at which the gain estimate stays within `tol` (relative) of the truth. */
export function settleStep(
  steps: readonly RlsStep[],
  trueGain: readonly number[],
  from: number,
  tol: number,
): number | null {
  for (let k = from; k < steps.length; k++) {
    let ok = true;
    for (let j = k; j < steps.length; j++) {
      if (Math.abs(steps[j]!.x[1]! / trueGain[j]! - 1) > tol) {
        ok = false;
        break;
      }
    }
    if (ok) return k;
  }
  return null;
}
