/**
 * Pure model behind the UnscentedTransform widget (post 16): post 04's functions, with the unscented
 * transform added next to Monte Carlo and first-order linearization.
 */
import { unscentedTransform, type UtParams } from '../filters/ukf';
import type { Gaussian } from '../math/gaussian';
import type { Vec } from '../math/matrix';
import { FUNCTIONS, propagate, type FnId, type Params, type PropResult } from './nonlinear-propagation';
import { mahalanobis2 } from '../math/gaussian';
import { chi2Quantile } from '../math/stats';

/** Julier's original choice: α = 1, β = 0, κ = 3 − n (points at ±√3 σ along each axis). */
export const utDefaults = (n: number): UtParams => ({ alpha: 1, beta: 0, kappa: 3 - n });
export const UT_LIMITS = {
  alpha: { min: 0.1, max: 2, step: 0.05 },
  beta: { min: 0, max: 4, step: 0.1 },
  kappa: { min: 0, max: 3, step: 0.5 },
};

export interface UtCompare extends PropResult {
  ut: Gaussian;
  /** Sigma points (input space, in the units of the input plot) and their images. */
  sigmaIn: [number, number][];
  sigmaOut: Vec[];
  insideUt: number;
  /** Distance of each method's mean from the exact mean. */
  meanErrLin: number;
  meanErrUt: number;
  meanErrMc: number;
}

const DEG = Math.PI / 180;

function inside(g: Gaussian, outs: Float64Array, dim: number): number {
  const n = outs.length / dim;
  let k = 0;
  if (dim === 1) {
    const sd = Math.sqrt(Math.max(0, g.cov.data[0]!));
    if (sd === 0) return 0;
    for (let i = 0; i < n; i++) if (Math.abs(outs[i]! - g.mean[0]!) <= 1.959963984540054 * sd) k++;
  } else {
    const det = g.cov.data[0]! * g.cov.data[3]! - g.cov.data[1]! * g.cov.data[2]!;
    if (!(det > 1e-14)) return 0;
    const c = chi2Quantile(0.95, 2);
    for (let i = 0; i < n; i++) if (mahalanobis2(g, Float64Array.from([outs[2 * i]!, outs[2 * i + 1]!])) <= c) k++;
  }
  return k / n;
}

export function compare(id: FnId, p: Params, z: Float64Array, utp: UtParams): UtCompare {
  const base = propagate(id, p, z);
  const cfg = FUNCTIONS[id];
  const ut = unscentedTransform(base.input, (x) => cfg.fn.f(x), utp);
  const sigmaIn = ut.sp.X.map((x): [number, number] =>
    id === 'polar' ? [x[1]! / DEG, x[0]!] : cfg.dim === 2 ? [x[0]!, x[1]!] : [x[0]!, 0],
  );
  const dist = (m: Vec) => Math.hypot(...Array.from(m, (v, i) => v - base.exactMean[i]!));
  return {
    ...base,
    ut: { mean: ut.mean, cov: ut.cov },
    sigmaIn,
    sigmaOut: ut.Y,
    insideUt: inside({ mean: ut.mean, cov: ut.cov }, base.outPts, cfg.dim),
    meanErrLin: dist(base.lin.mean),
    meanErrUt: dist(ut.mean),
    meanErrMc: dist(base.mc.mean),
  };
}
