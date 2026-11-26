/**
 * Pure model behind the InfoVsCov widget (post 19): estimate the whole trajectory, not just the current
 * state, and compare the trajectory's information matrix Ω (sparse, banded) with its covariance P = Ω⁻¹
 * (dense), as steps are added.
 */
import { trajectoryInformation, type KfState, type LinearModel } from '../filters/kf';
import { diag, fromArrays, inverse, vec, type Mat, type Vec } from '../math/matrix';
import { createRng } from '../math/rng';
import { constantVelocity } from '../models/linear';
import { TRACKER_DEFAULTS, initBelief, makeScenario, Qof, Rof } from './tracker-1d';

export type InfoScenario = 'corridor' | 'aisle';

export const INFO = {
  maxSteps: { corridor: 40, aisle: 25 } as Record<InfoScenario, number>,
  seed: 19,
  /** Colour scale: |entry| / max over this many decades; exact zeros are left blank. */
  decades: 12,
};

interface Setup {
  model: LinearModel;
  init: KfState;
  zs: (Vec | null)[];
  us?: Vec[];
  /** Numbers per step. */
  n: number;
}

function setup(sc: InfoScenario, seed: number): Setup {
  if (sc === 'corridor') {
    const p = TRACKER_DEFAULTS;
    const s = makeScenario('steady', p, seed);
    return {
      model: {
        F: fromArrays([[1]]),
        B: fromArrays([[1]]),
        Q: fromArrays([[Qof(p)]]),
        H: fromArrays([[1]]),
        R: fromArrays([[Rof(p)]]),
      },
      init: { x: vec([initBelief().x]), P: fromArrays([[initBelief().P]]) },
      zs: s.zs.map((z) => vec([z!])),
      us: s.zs.map(() => vec([1])),
      n: 1,
    };
  }
  // A forklift moving along an aisle: position and velocity, position fixes once per second.
  const { F, Q } = constantVelocity(1, 1, 0.01);
  const R = fromArrays([[0.25]]);
  const rng = createRng(seed);
  let x = vec([0, 1.5]);
  const zs: Vec[] = [];
  for (let k = 0; k < INFO.maxSteps.aisle; k++) {
    const dv = 0.1 * rng.normal();
    x = vec([x[0]! + x[1]! + dv / 2, x[1]! + dv]);
    zs.push(vec([x[0]! + 0.5 * rng.normal()]));
  }
  return { model: { F, Q, H: fromArrays([[1, 0]]), R }, init: { x: vec([0, 0]), P: diag([4, 4]) }, zs, n: 2 };
}

export interface Matrices {
  size: number;
  /** Numbers per step. */
  n: number;
  Omega: Mat;
  P: Mat;
  nnzOmega: number;
  nnzP: number;
}

/** Ω and P of the trajectory x_0 … x_k after k steps of data. */
export function matricesAt(sc: InfoScenario, k: number, seed = INFO.seed): Matrices {
  const s = setup(sc, seed);
  const { Lambda } = trajectoryInformation(s.init, s.model, s.zs.slice(0, k), s.us?.slice(0, k));
  const P = inverse(Lambda, { spd: true });
  const nnz = (M: Mat) => M.data.reduce((a, v) => a + (v !== 0 ? 1 : 0), 0);
  return { size: Lambda.rows, n: s.n, Omega: Lambda, P, nnzOmega: nnz(Lambda), nnzP: nnz(P) };
}

/** Values for the heat map: |a|/max on a log scale over INFO.decades, mapped to (0.08, 1]; exact zeros to 0. */
export function logMagnitude(M: Mat): Float64Array {
  let max = 0;
  for (const v of M.data) max = Math.max(max, Math.abs(v));
  return M.data.map((v) => {
    if (v === 0 || max === 0) return 0;
    const t = 1 + Math.log10(Math.abs(v) / max) / INFO.decades;
    return 0.08 + 0.92 * Math.max(0, Math.min(1, t));
  });
}

/** Correlation between the first and last state's positions: how far the coupling reaches in P. */
export function endToEndCorrelation(m: Matrices): number {
  const s = m.size;
  const last = s - m.n;
  return m.P.data[last]! / Math.sqrt(m.P.data[0]! * m.P.data[last * s + last]!);
}
