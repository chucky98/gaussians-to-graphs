/**
 * Recursive least squares with exponential forgetting (post 08).
 *
 * Model: yₖ = aₖᵀx + vₖ, vₖ ~ N(0, r). State: estimate x̂ and covariance P. One step:
 *   Kₖ = P aₖ / (β r + aₖᵀ P aₖ)        (gain)
 *   x̂ ← x̂ + Kₖ (yₖ − aₖᵀ x̂)            (correct by the innovation)
 *   P ← (P − Kₖ aₖᵀ P) / β              (shrink, then inflate by forgetting)
 * With β = 1 this reproduces the batch MAP / weighted least-squares solution exactly; with β < 1,
 * the batch problem in which a measurement k steps old has weight βᵏ.
 */
import {
  cholesky,
  getBlock,
  mul,
  mulVec,
  scale,
  solveCholesky,
  sub,
  symmetrize,
  transpose,
  type Mat,
  type Vec,
  add,
  zeros,
  inverse,
  colMat,
} from '../math/matrix';

export interface RlsState {
  x: Vec;
  P: Mat;
}

export interface RlsStep extends RlsState {
  /** Gain Kₖ used in this step. */
  K: Vec;
  /** Innovation yₖ − aₖᵀx̂ (before the update). */
  innovation: number;
}

export function rlsUpdate(s: RlsState, a: Vec, y: number, r: number, beta = 1): RlsStep {
  if (!(beta > 0 && beta <= 1)) throw new RangeError('forgetting factor must be in (0, 1]');
  if (!(r > 0)) throw new RangeError('measurement variance must be positive');
  const Pa = mulVec(s.P, a);
  let denom = beta * r;
  for (let i = 0; i < a.length; i++) denom += a[i]! * Pa[i]!;
  const K = Pa.map((v) => v / denom);
  let pred = 0;
  for (let i = 0; i < a.length; i++) pred += a[i]! * s.x[i]!;
  const innovation = y - pred;
  const x = s.x.map((xi, i) => xi + K[i]! * innovation);
  // P − K (aᵀP) = P − K Paᵀ (P symmetric)
  const n = a.length;
  const KPa = zeros(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) KPa.data[i * n + j] = K[i]! * Pa[j]!;
  const P = symmetrize(scale(sub(s.P, KPa), 1 / beta));
  return { x, P, K, innovation };
}

/** Run RLS over a stream; returns the state after every measurement (index k = after k+1 updates). */
export function rlsRun(init: RlsState, rows: readonly Vec[], ys: readonly number[], r: number, beta = 1): RlsStep[] {
  const out: RlsStep[] = [];
  let s: RlsState = init;
  rows.forEach((a, k) => {
    const st = rlsUpdate(s, a, ys[k]!, r, beta);
    out.push(st);
    s = st;
  });
  return out;
}

/**
 * The batch problem RLS solves: minimize β^N (x − x₀)ᵀP₀⁻¹(x − x₀) + Σₖ β^(N−1−k) (yₖ − aₖᵀx)²/r
 * over the first N measurements. Returns the minimizer and its (forgetting-scaled) covariance.
 */
export function batchSolution(
  init: RlsState,
  rows: readonly Vec[],
  ys: readonly number[],
  r: number,
  beta = 1,
): RlsState {
  const N = rows.length;
  const n = init.x.length;
  const P0inv = inverse(init.P, { spd: true });
  let H = scale(P0inv, beta ** N);
  let g = mulVec(H, init.x);
  for (let k = 0; k < N; k++) {
    const w = beta ** (N - 1 - k) / r;
    const A = colMat(rows[k]!);
    H = add(H, scale(mul(A, transpose(A)), w));
    g = g.map((gi, i) => gi + w * rows[k]![i]! * ys[k]!);
  }
  const L = cholesky(symmetrize(H));
  const x = solveCholesky(L, g);
  const P = getBlock(inverse(symmetrize(H), { spd: true }), 0, 0, n, n);
  return { x, P };
}
