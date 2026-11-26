/**
 * The Rauch–Tung–Striebel smoother (post 18).
 *
 * After a Kalman filter has run forward over all the data, a backward pass corrects each estimate with
 * what was learned later:
 *   C_k     = P_{k|k} Fᵀ P_{k+1|k}⁻¹                      (smoother gain)
 *   x̂_{k|N} = x̂_{k|k} + C_k (x̂_{k+1|N} − x̂_{k+1|k})
 *   P_{k|N} = P_{k|k} + C_k (P_{k+1|N} − P_{k+1|k}) C_kᵀ
 * starting from x̂_{N|N}, P_{N|N}. For a linear-Gaussian model the result equals the batch MAP solution
 * of the whole trajectory.
 */
import {
  add,
  cholesky,
  mul,
  solveCholeskyMat,
  sub,
  symmetrize,
  transpose,
  mulVec,
  vecAdd,
  vecSub,
  type Mat,
} from '../math/matrix';
import { kfRun, type KfState, type KfStep, type LinearModel } from './kf';

/**
 * Smooth a filter run. `init` is the prior at time 0 and `steps[k−1]` the filter's prediction and update
 * at time k; F is the transition used by the filter. Returns smoothed states for times 0 … N.
 */
export function rtsSmooth(init: KfState, steps: readonly KfStep[], F: Mat): KfState[] {
  const N = steps.length;
  const out: KfState[] = new Array(N + 1);
  out[N] = N === 0 ? init : steps[N - 1]!.post;
  for (let k = N - 1; k >= 0; k--) {
    const filt = k === 0 ? init : steps[k - 1]!.post;
    const pred = steps[k]!.prior; // prediction of time k + 1 from time k
    // C = P_{k|k} Fᵀ P_{k+1|k}⁻¹  ⇔  Cᵀ = P_{k+1|k}⁻¹ (F P_{k|k})  (both covariances symmetric)
    const C = transpose(solveCholeskyMat(cholesky(pred.P), mul(F, filt.P)));
    const next = out[k + 1]!;
    const x = vecAdd(filt.x, mulVec(C, vecSub(next.x, pred.x)));
    const P = symmetrize(add(filt.P, mul(mul(C, sub(next.P, pred.P)), transpose(C))));
    out[k] = { x, P };
  }
  return out;
}

/**
 * Fixed-lag smoothing: the estimate of time k using the data up to time k + L (fewer at the end of the
 * run). Computed directly by smoothing the run up to k + L; returns states for times 0 … N.
 */
export function fixedLagSmooth(
  init: KfState,
  m: LinearModel,
  zs: readonly (Float64Array | null)[],
  L: number,
  us?: readonly Float64Array[],
): KfState[] {
  const N = zs.length;
  const steps = kfRun(init, m, zs, us);
  const out: KfState[] = [];
  for (let k = 0; k <= N; k++) {
    const upto = Math.min(N, k + L);
    out.push(rtsSmooth(init, steps.slice(0, upto), m.F)[k]!);
  }
  return out;
}
