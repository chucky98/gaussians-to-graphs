/**
 * Pure model behind the CorridorRobot widget (post 10): a delivery robot on the loop corridor around a
 * building's core. It knows the map (where the doors are) but not where it is. It drives forward 1 m at
 * a time and has a sideways door detector that reports "door" or "wall".
 *
 * The corridor is a loop, so moves wrap around. Position is discretized into 0.5 m cells.
 */
import {
  argmax,
  gaussianKernel,
  massNear,
  predict,
  sampleOffset,
  uniformBelief,
  update,
  type Belief,
} from '../filters/histogram';
import { createRng } from '../math/rng';

export type Action = 'move' | 'sense' | 'kidnap';

export const CORRIDOR = {
  /** Loop length, metres. */
  length: 30,
  /** Cell size, metres. */
  cell: 0.25,
  /**
   * Door openings [from, to) in metres along the loop. Two pairs share the same 3 m spacing (1/4 and
   * 10/13), so one pair of doors is not enough to tell where the robot is.
   */
  doors: [
    [1, 2],
    [4, 5],
    [10, 11],
    [13, 14],
    [20, 21.5],
    [25, 26],
  ] as [number, number][],
  /** Commanded move per step, metres. */
  move: 1,
  /** True starting position, metres (cell start). */
  start: 0,
  /** Typical, not lucky: localizes after about 20 moves (the median over seeds 1–100 is 19). */
  seed: 18,
  /** Kidnapping probability per move (ε) when the "allow for kidnapping" option is on. */
  kidnapProb: 0.001,
  /** Move–sense pairs already done in the "tracking" preset (two laps). */
  trackingPairs: 60,
  /** "Near the truth" means within this many metres. */
  nearTol: 1,
  maxActions: 400,
};
export const N_CELLS = Math.round(CORRIDOR.length / CORRIDOR.cell);

export interface CorridorParams {
  /** Motion error std per 1 m move (α), metres. */
  alpha: number;
  /** p(z = door | at a door). */
  hit: number;
  /** p(z = door | at a wall). */
  falseAlarm: number;
  /** Model kidnapping in the prediction step. */
  allowKidnap: boolean;
}

export const CORRIDOR_DEFAULTS: CorridorParams = {
  alpha: 0.1,
  hit: 0.9,
  falseAlarm: 0.05,
  allowKidnap: false,
};

export const CORRIDOR_LIMITS = {
  alpha: { min: 0, max: 1, step: 0.05 },
  /** Kept away from 0 and 1 so that no reading is ever impossible (the update could divide by zero). */
  hit: { min: 0.5, max: 0.99, step: 0.01 },
  falseAlarm: { min: 0.01, max: 0.5, step: 0.01 },
};

/** Cell centre in metres. */
export const cellCenter = (i: number) => (i + 0.5) * CORRIDOR.cell;

export function isDoorCell(i: number, doors = CORRIDOR.doors): boolean {
  const x = cellCenter(i);
  return doors.some(([a, b]) => x >= a && x < b);
}

export const DOOR_MASK: boolean[] = Array.from({ length: N_CELLS }, (_, i) => isDoorCell(i));

/** Likelihood p(z | cell) for every cell, z = true for "door". */
export function likelihood(z: boolean, p: CorridorParams, mask: readonly boolean[] = DOOR_MASK): Float64Array {
  return Float64Array.from(mask, (door) => {
    const pDoor = door ? p.hit : p.falseAlarm;
    return z ? pDoor : 1 - pDoor;
  });
}

export function motionKernel(p: CorridorParams) {
  return gaussianKernel(CORRIDOR.move / CORRIDOR.cell, p.alpha / CORRIDOR.cell);
}

export interface Frame {
  /** Action that produced this frame (null for the initial frame). */
  action: Action | null;
  /** True cell of the robot. */
  truth: number;
  /** Belief after the action. */
  belief: Belief;
  /** Belief before the action. */
  before: Belief;
  /** For a sense action: the reading (true = door) and the likelihood used. */
  reading: boolean | null;
  lik: Float64Array | null;
  /** For a sense action: p(z_k | earlier data), how expected the reading was (the normalizer 1/η). */
  evidence: number | null;
  /** Number of moves and senses so far. */
  moves: number;
  senses: number;
}

/**
 * Run a sequence of actions from a uniform belief. Each action draws exactly one uniform number, so
 * the same seed gives the same "luck" whatever the parameters (common random numbers).
 */
export function run(actions: readonly Action[], params: CorridorParams, seed = CORRIDOR.seed): Frame[] {
  const rng = createRng(seed);
  const kernel = motionKernel(params);
  const n = N_CELLS;
  let truth = Math.round(CORRIDOR.start / CORRIDOR.cell);
  let bel: Belief = uniformBelief(n);
  let moves = 0;
  let senses = 0;
  const frames: Frame[] = [
    { action: null, truth, belief: bel, before: bel, reading: null, lik: null, evidence: null, moves, senses },
  ];
  for (const a of actions) {
    const u = rng.uniform();
    const before = bel;
    let reading: boolean | null = null;
    let lik: Float64Array | null = null;
    let evidence: number | null = null;
    if (a === 'move') {
      truth = (((truth + sampleOffset(kernel, u)) % n) + n) % n;
      bel = predict(bel, kernel, { cyclic: true, kidnapProb: params.allowKidnap ? CORRIDOR.kidnapProb : 0 });
      moves += 1;
    } else if (a === 'sense') {
      reading = u < (DOOR_MASK[truth] ? params.hit : params.falseAlarm);
      lik = likelihood(reading, params);
      const up = update(bel, lik);
      bel = up.belief;
      evidence = up.evidence;
      senses += 1;
    } else {
      // Teleport at least a quarter of the loop away; the filter is not told.
      truth = (truth + n / 4 + Math.floor(u * (n / 2))) % n;
    }
    frames.push({ action: a, truth, belief: bel, before, reading, lik, evidence, moves, senses });
  }
  return frames;
}

export type CorridorPreset = 'fresh' | 'tracking';

/** Actions already taken when the widget opens: none, or two laps of move–sense (localized). */
export function presetActions(preset: CorridorPreset): Action[] {
  return preset === 'tracking' ? autoActions(CORRIDOR.trackingPairs) : [];
}

/** n move-then-sense pairs, starting with a sense at the start position. */
export function autoActions(pairs: number): Action[] {
  const a: Action[] = ['sense'];
  for (let i = 0; i < pairs; i++) a.push('move', 'sense');
  return a;
}

/** Next action for autoplay: sense after a move (or at the start), otherwise move. */
export function nextAuto(actions: readonly Action[]): Action {
  const last = actions[actions.length - 1];
  return last === undefined || last === 'move' || last === 'kidnap' ? 'sense' : 'move';
}

export interface Summary {
  /** Probability within ±1 m of the true position. */
  nearTruth: number;
  /** Most likely cell and its probability. */
  best: number;
  bestProb: number;
  /** Distance (m, along the loop) from the most likely cell to the truth. */
  bestError: number;
}

export function loopDistance(i: number, j: number): number {
  const d = Math.abs(i - j) % N_CELLS;
  return Math.min(d, N_CELLS - d) * CORRIDOR.cell;
}

export function summarize(f: Frame): Summary {
  const best = argmax(f.belief);
  return {
    nearTruth: massNear(f.belief, f.truth, Math.round(CORRIDOR.nearTol / CORRIDOR.cell)),
    best,
    bestProb: f.belief[best]!,
    bestError: loopDistance(best, f.truth),
  };
}

/** Local maxima of the belief holding at least `minMass` within ±1 m (separate hypotheses). */
export function modes(bel: Belief, minMass = 0.1): number[] {
  const n = bel.length;
  const out: number[] = [];
  const h = Math.round(CORRIDOR.nearTol / CORRIDOR.cell);
  for (let i = 0; i < n; i++) {
    let isMax = true;
    for (let d = -h; d <= h && isMax; d++) {
      if (d === 0) continue;
      const j = (((i + d) % n) + n) % n;
      if (bel[j]! > bel[i]! || (bel[j] === bel[i] && j < i)) isMax = false;
    }
    if (isMax && massNear(bel, i, h) >= minMass) out.push(i);
  }
  return out;
}
