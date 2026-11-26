/**
 * The (multivariate) Kalman filter (post 12).
 *
 * Model:  x_k = F x_{k−1} + B u_k + w_k,  w_k ~ N(0, Q)
 *         z_k = H x_k + v_k,              v_k ~ N(0, R)
 *
 *   predict:  x̂⁻ = F x̂ + B u,   P⁻ = F P Fᵀ + Q
 *   update:   ν = z − H x̂⁻,  S = H P⁻ Hᵀ + R,  K = P⁻ Hᵀ S⁻¹,
 *             x̂ = x̂⁻ + K ν,   P = (I − K H) P⁻ (I − K H)ᵀ + K R Kᵀ   (Joseph form)
 *
 * Numerical rules (DESIGN §5.1): Joseph form by default, symmetrize after every step, never invert
 * when a Cholesky solve will do.
 */
import {
  add,
  cholesky,
  dot,
  identity,
  inverse,
  mul,
  mulVec,
  solveCholesky,
  solveCholeskyMat,
  sub,
  symmetrize,
  transpose,
  vecAdd,
  vecSub,
  zeros,
  getBlock,
  scale,
  type Mat,
  type Vec,
} from '../math/matrix';

export interface KfState {
  x: Vec;
  P: Mat;
}

export interface MotionModel {
  F: Mat;
  Q: Mat;
  B?: Mat;
}

export interface MeasurementModel {
  H: Mat;
  R: Mat;
}

export type LinearModel = MotionModel & MeasurementModel;

export function kfPredict(s: KfState, m: MotionModel, u?: Vec): KfState {
  let x = mulVec(m.F, s.x);
  if (m.B && u) x = vecAdd(x, mulVec(m.B, u));
  const P = symmetrize(add(mul(mul(m.F, s.P), transpose(m.F)), m.Q));
  return { x, P };
}

export interface KfUpdate {
  state: KfState;
  /** Innovation ν = z − H x̂⁻. */
  nu: Vec;
  /** Innovation covariance S = H P⁻ Hᵀ + R. */
  S: Mat;
  /** Gain K = P⁻ Hᵀ S⁻¹ (n_x × n_z). */
  K: Mat;
  /** Normalized innovation squared νᵀ S⁻¹ ν. */
  nis: number;
}

export function kfUpdate(s: KfState, z: Vec, m: MeasurementModel, opts: { joseph?: boolean } = {}): KfUpdate {
  const joseph = opts.joseph ?? true;
  const H = m.H;
  const PHt = mul(s.P, transpose(H));
  const S = symmetrize(add(mul(H, PHt), m.R));
  const L = cholesky(S);
  // K = P Hᵀ S⁻¹  ⇔  Kᵀ = S⁻¹ (H P)  (P and S symmetric).
  const K = transpose(solveCholeskyMat(L, transpose(PHt)));
  const nu = vecSub(z, mulVec(H, s.x));
  const x = vecAdd(s.x, mulVec(K, nu));
  const IKH = sub(identity(s.x.length), mul(K, H));
  const P = joseph
    ? symmetrize(add(mul(mul(IKH, s.P), transpose(IKH)), mul(mul(K, m.R), transpose(K))))
    : symmetrize(mul(IKH, s.P));
  const nis = dot(nu, solveCholesky(L, nu));
  return { state: { x, P }, nu, S, K, nis };
}

export interface KfStep {
  prior: KfState;
  post: KfState;
  /** null when there was no measurement at this step. */
  update: KfUpdate | null;
}

/** Predict then (optionally) update, for each step. `us[k]` may be omitted for models without B. */
export function kfRun(
  init: KfState,
  m: LinearModel,
  zs: readonly (Vec | null)[],
  us?: readonly Vec[],
  opts: { joseph?: boolean } = {},
): KfStep[] {
  const out: KfStep[] = [];
  let s = init;
  for (let k = 0; k < zs.length; k++) {
    const prior = kfPredict(s, m, us?.[k]);
    const z = zs[k]!;
    if (z === null) {
      out.push({ prior, post: prior, update: null });
      s = prior;
    } else {
      const u = kfUpdate(prior, z, m, opts);
      out.push({ prior, post: u.state, update: u });
      s = u.state;
    }
  }
  return out;
}

/**
 * Batch MAP estimate of the whole trajectory x_0 … x_N of a linear-Gaussian model, from the prior on
 * x_0, every motion step and every measurement: minimize
 *   ‖x_0 − x̂_0‖²_{P_0⁻¹} + Σ_k ‖x_k − F x_{k−1} − B u_k‖²_{Q⁻¹} + Σ_k ‖z_k − H x_k‖²_{R⁻¹}
 * by forming the information matrix Λ and vector η and solving Λ x = η (dense; for tests and small
 * demos). Returns every state's mean and marginal covariance.
 */
export function batchLinearGaussian(
  init: KfState,
  m: LinearModel,
  zs: readonly (Vec | null)[],
  us?: readonly Vec[],
): { x: Vec[]; P: Mat[] } {
  const n = init.x.length;
  const N = zs.length;
  const dim = n * (N + 1);
  const Lam = zeros(dim, dim);
  const eta = new Float64Array(dim);
  // Add Aᵀ W A and Aᵀ W b for a residual b − A x that touches blocks (index → coefficient matrix).
  const addFactor = (blocks: [number, Mat][], b: Vec, W: Mat) => {
    for (const [i, Ai] of blocks) {
      const AiW = mul(transpose(Ai), W);
      const r = mulVec(AiW, b);
      for (let a = 0; a < n; a++) eta[i * n + a]! += r[a]!;
      for (const [j, Aj] of blocks) {
        const blk = mul(AiW, Aj);
        for (let a = 0; a < n; a++)
          for (let c = 0; c < n; c++) Lam.data[(i * n + a) * dim + j * n + c]! += blk.data[a * n + c]!;
      }
    }
  };
  const I = identity(n);
  const mF = scale(m.F, -1);
  addFactor([[0, I]], init.x, inverse(init.P, { spd: true }));
  const Qi = inverse(m.Q, { spd: true });
  const Ri = inverse(m.R, { spd: true });
  const HtRiH = mul(mul(transpose(m.H), Ri), m.H);
  for (let k = 1; k <= N; k++) {
    const bu = m.B && us ? mulVec(m.B, us[k - 1]!) : new Float64Array(n);
    addFactor(
      [
        [k, I],
        [k - 1, mF],
      ],
      bu,
      Qi,
    );
    const z = zs[k - 1]!;
    if (z !== null) {
      // Measurement residual z − H x_k: information Hᵀ R⁻¹ H and vector Hᵀ R⁻¹ z.
      const r = mulVec(mul(transpose(m.H), Ri), z);
      for (let a = 0; a < n; a++) {
        eta[k * n + a]! += r[a]!;
        for (let c = 0; c < n; c++) Lam.data[(k * n + a) * dim + k * n + c]! += HtRiH.data[a * n + c]!;
      }
    }
  }
  const Lc = cholesky(Lam);
  const sol = solveCholesky(Lc, eta);
  const cov = solveCholeskyMat(Lc, identity(dim));
  const xs: Vec[] = [];
  const Ps: Mat[] = [];
  for (let k = 0; k <= N; k++) {
    xs.push(sol.slice(k * n, (k + 1) * n));
    Ps.push(symmetrize(getBlock(cov, k * n, k * n, n, n)));
  }
  return { x: xs, P: Ps };
}
