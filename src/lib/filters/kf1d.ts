/**
 * The Kalman filter in one dimension (post 11).
 *
 * Model: x_k = x_{k−1} + u_k + w_k,  w_k ~ N(0, Q)      (motion: known move plus noise)
 *        z_k = x_k + v_k,           v_k ~ N(0, R)      (a direct, noisy reading of the state)
 *
 *   predict:  x̂_{k|k−1} = x̂_{k−1|k−1} + u_k,   P_{k|k−1} = P_{k−1|k−1} + Q
 *   update:   K_k = P_{k|k−1} / (P_{k|k−1} + R),  x̂_{k|k} = x̂_{k|k−1} + K_k (z_k − x̂_{k|k−1}),
 *             P_{k|k} = (1 − K_k)² P_{k|k−1} + K_k² R   (Joseph form; equals (1 − K_k) P_{k|k−1})
 *
 * The update is the normalized product of two Gaussians: the prediction and the likelihood N(z_k, R).
 */
import { inverse, type Mat } from '../math/matrix';
import { lstsq } from '../math/leastsquares';

export interface Kf1State {
  /** Mean x̂. */
  x: number;
  /** Variance P. */
  P: number;
}

export interface Kf1Update {
  state: Kf1State;
  /** Kalman gain K = P⁻/(P⁻ + R). */
  K: number;
  /** Innovation ν = z − x̂⁻. */
  nu: number;
  /** Innovation variance S = P⁻ + R. */
  S: number;
}

export function predict1(s: Kf1State, u: number, Q: number): Kf1State {
  if (Q < 0) throw new RangeError('predict1: Q must be non-negative');
  return { x: s.x + u, P: s.P + Q };
}

export function update1(s: Kf1State, z: number, R: number): Kf1Update {
  if (!(R > 0)) throw new RangeError('update1: R must be positive');
  const S = s.P + R;
  const K = s.P / S;
  const nu = z - s.x;
  const P = (1 - K) * (1 - K) * s.P + K * K * R;
  return { state: { x: s.x + K * nu, P }, K, nu, S };
}

export interface Kf1Step {
  /** Belief after the prediction of step k. */
  prior: Kf1State;
  /** Belief after the update (equal to `prior` when there was no reading). */
  post: Kf1State;
  /** Reading used, or null. */
  z: number | null;
  /** Gain used (0 without a reading). */
  K: number;
  nu: number | null;
}

/** Run predict/update over a sequence of moves and (optional) readings. */
export function run1(init: Kf1State, us: readonly number[], zs: readonly (number | null)[], Q: number, R: number) {
  if (us.length !== zs.length) throw new RangeError('run1: us and zs differ in length');
  const out: Kf1Step[] = [];
  let s = init;
  for (let k = 0; k < us.length; k++) {
    const prior = predict1(s, us[k]!, Q);
    const z = zs[k]!;
    if (z === null) {
      out.push({ prior, post: prior, z: null, K: 0, nu: null });
      s = prior;
    } else {
      const u = update1(prior, z, R);
      out.push({ prior, post: u.state, z, K: u.K, nu: u.nu });
      s = u.state;
    }
  }
  return out;
}

/**
 * Steady state of the scalar filter with a reading at every step: the predicted variance solves
 * P⁻ = P⁻R/(P⁻ + R) + Q, i.e. P⁻ = (Q + √(Q² + 4QR))/2.
 */
export function steadyState1(Q: number, R: number): { Ppred: number; Ppost: number; K: number } {
  if (!(Q >= 0) || !(R > 0)) throw new RangeError('steadyState1: need Q ≥ 0 and R > 0');
  const Ppred = (Q + Math.sqrt(Q * Q + 4 * Q * R)) / 2;
  const K = Ppred / (Ppred + R);
  return { Ppred, Ppost: (1 - K) * Ppred, K };
}

/**
 * Batch MAP estimate of the whole trajectory x_0 … x_n from the prior, all moves and all readings,
 * as one weighted least-squares problem. Returns the estimates and their marginal variances.
 * Used to check that the filter's last estimate equals the batch answer (DESIGN §8.1).
 */
export function batchMap1(
  init: Kf1State,
  us: readonly number[],
  zs: readonly (number | null)[],
  Q: number,
  R: number,
): { x: number[]; P: number[] } {
  const n = us.length + 1;
  const rows: number[][] = [];
  const b: number[] = [];
  const w: number[] = [];
  const row = (pairs: [number, number][]) => {
    const r = new Array<number>(n).fill(0);
    for (const [j, v] of pairs) r[j] = v;
    return r;
  };
  rows.push(row([[0, 1]]));
  b.push(init.x);
  w.push(1 / init.P);
  for (let k = 1; k < n; k++) {
    rows.push(
      row([
        [k, 1],
        [k - 1, -1],
      ]),
    );
    b.push(us[k - 1]!);
    w.push(1 / Q);
    const z = zs[k - 1]!;
    if (z !== null) {
      rows.push(row([[k, 1]]));
      b.push(z);
      w.push(1 / R);
    }
  }
  const A: Mat = { rows: rows.length, cols: n, data: Float64Array.from(rows.flat()) };
  const sol = lstsq(A, Float64Array.from(b), Float64Array.from(w));
  // Marginal variances: diagonal of (AᵀWA)⁻¹.
  const info: Mat = { rows: n, cols: n, data: new Float64Array(n * n) };
  for (let i = 0; i < A.rows; i++)
    for (let j = 0; j < n; j++) {
      const aij = A.data[i * n + j]!;
      if (aij === 0) continue;
      for (let l = 0; l < n; l++) info.data[j * n + l]! += w[i]! * aij * A.data[i * n + l]!;
    }
  const cov = inverse(info, { spd: true });
  return { x: Array.from(sol.x), P: Array.from({ length: n }, (_, i) => cov.data[i * n + i]!) };
}
