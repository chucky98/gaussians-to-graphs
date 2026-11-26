/**
 * The unscented transform and the unscented Kalman filter (post 16).
 *
 * Sigma points (scaled unscented transform, Julier & Uhlmann; Wan & van der Merwe):
 *   λ = α²(n + κ) − n,   X₀ = μ,   X_{±i} = μ ± (√((n + λ) Σ))_i   (columns of a Cholesky factor)
 *   W₀ᵐ = λ/(n + λ),   W₀ᶜ = W₀ᵐ + 1 − α² + β,   Wᵢᵐ = Wᵢᶜ = 1/(2(n + λ))
 * Push every point through f and take the weighted mean and covariance of the images.
 *
 * Angles: outputs may need a custom weighted mean (e.g. a circular mean for a heading) and a custom
 * difference (wrapping). Both default to the plain vector operations.
 */
import {
  add,
  cholesky,
  mul,
  scale,
  solveCholeskyMat,
  symmetrize,
  transpose,
  zeros,
  type Mat,
  type Vec,
} from '../math/matrix';
import type { Gaussian } from '../math/gaussian';
import type { KfState, KfUpdate } from './kf';
import { dot, solveCholesky, vecAdd, mulVec } from '../math/matrix';

export interface UtParams {
  alpha: number;
  beta: number;
  kappa: number;
}

export interface SigmaPoints {
  X: Vec[];
  Wm: number[];
  Wc: number[];
  lambda: number;
}

export function sigmaPoints(g: Gaussian, p: UtParams): SigmaPoints {
  const n = g.mean.length;
  const lambda = p.alpha * p.alpha * (n + p.kappa) - n;
  if (!(n + lambda > 0)) throw new RangeError('sigmaPoints: need n + λ > 0');
  const L = cholesky(scale(g.cov, n + lambda));
  const X: Vec[] = [g.mean];
  for (const sign of [1, -1])
    for (let i = 0; i < n; i++) {
      const x = new Float64Array(g.mean);
      for (let r = 0; r < n; r++) x[r]! += sign * L.data[r * n + i]!;
      X.push(x);
    }
  const w = 1 / (2 * (n + lambda));
  const Wm = [lambda / (n + lambda), ...new Array<number>(2 * n).fill(w)];
  const Wc = [Wm[0]! + 1 - p.alpha * p.alpha + p.beta, ...new Array<number>(2 * n).fill(w)];
  return { X, Wm, Wc, lambda };
}

export interface SpaceOps {
  /** Weighted mean of points (default: Σ wᵢ yᵢ). */
  mean?: (ys: readonly Vec[], w: readonly number[]) => Vec;
  /** Difference a − b (default: plain subtraction). */
  diff?: (a: Vec, b: Vec) => Vec;
}

const plainMean = (ys: readonly Vec[], w: readonly number[]) => {
  const m = new Float64Array(ys[0]!.length);
  ys.forEach((y, i) => y.forEach((v, j) => (m[j]! += w[i]! * v)));
  return m;
};
const plainDiff = (a: Vec, b: Vec) => a.map((v, i) => v - b[i]!);

function outer(a: Vec, b: Vec, w: number): Mat {
  const M = zeros(a.length, b.length);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) M.data[i * b.length + j] = w * a[i]! * b[j]!;
  return M;
}

export interface UtResult extends Gaussian {
  /** Images of the sigma points. */
  Y: Vec[];
  sp: SigmaPoints;
  /** Cross-covariance between input and output, Σ Wᶜ (X − μ)(Y − ȳ)ᵀ. */
  cross: Mat;
}

export function unscentedTransform(
  g: Gaussian,
  f: (x: Vec) => Vec,
  p: UtParams,
  out: SpaceOps = {},
  inp: SpaceOps = {},
): UtResult {
  const sp = sigmaPoints(g, p);
  const Y = sp.X.map(f);
  const mean = (out.mean ?? plainMean)(Y, sp.Wm);
  const dOut = out.diff ?? plainDiff;
  const dIn = inp.diff ?? plainDiff;
  let cov = zeros(mean.length, mean.length);
  let cross = zeros(g.mean.length, mean.length);
  Y.forEach((y, i) => {
    const dy = dOut(y, mean);
    cov = add(cov, outer(dy, dy, sp.Wc[i]!));
    cross = add(cross, outer(dIn(sp.X[i]!, g.mean), dy, sp.Wc[i]!));
  });
  return { mean, cov: symmetrize(cov), Y, sp, cross };
}

/** UKF prediction: the unscented transform of the motion model, plus process noise Q (state space). */
export function ukfPredict(s: KfState, f: (x: Vec) => Vec, Q: Mat, p: UtParams, state: SpaceOps = {}): KfState {
  const ut = unscentedTransform({ mean: s.x, cov: s.P }, f, p, state, state);
  return { x: ut.mean, P: symmetrize(add(ut.cov, Q)) };
}

/**
 * UKF update: the unscented transform of the measurement model gives the predicted measurement, its
 * covariance S (plus R) and the cross-covariance C; then K = C S⁻¹, x̂ += K ν, P −= K S Kᵀ.
 */
export function ukfUpdate(
  s: KfState,
  z: Vec,
  h: (x: Vec) => Vec,
  R: Mat,
  p: UtParams,
  ops: { meas?: SpaceOps; state?: SpaceOps; normalize?: (x: Vec) => Vec } = {},
): KfUpdate {
  const ut = unscentedTransform({ mean: s.x, cov: s.P }, h, p, ops.meas ?? {}, ops.state ?? {});
  const S = symmetrize(add(ut.cov, R));
  const L = cholesky(S);
  const K = transpose(solveCholeskyMat(L, transpose(ut.cross)));
  const nu = (ops.meas?.diff ?? plainDiff)(z, ut.mean);
  let x = vecAdd(s.x, mulVec(K, nu));
  if (ops.normalize) x = ops.normalize(x);
  const P = symmetrize(add(s.P, scale(mul(mul(K, S), transpose(K)), -1)));
  return { state: { x, P }, nu, S, K, nis: dot(nu, solveCholesky(L, nu)) };
}
