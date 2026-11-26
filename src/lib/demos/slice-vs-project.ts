/** Pure model behind the SliceVsProject widget (post 03). Joint Gaussian over (x, y). */
import { condition, cov2, marginalize, pdf, toInformation, type Gaussian } from '../math/gaussian';
import { vec, type Mat } from '../math/matrix';

export const SLICE_DEFAULTS = {
  mean: [0, 0] as [number, number],
  sx: 1.5,
  sy: 1,
  rho: 0.7,
  /** Position of the slice, x = a. */
  a: 1.5,
  showMarginal: true,
  showMeanLine: false,
} as const;

export const SLICE_LIMITS = {
  rho: { min: -0.95, max: 0.95, step: 0.01 },
  a: { min: -4, max: 4, step: 0.05 },
  xDomain: [-5, 5] as [number, number],
  yDomain: [-3.5, 3.5] as [number, number],
  densityMax: 1.35,
} as const;

export function joint(rho: number): Gaussian {
  const { mean, sx, sy } = SLICE_DEFAULTS;
  return { mean: vec(mean), cov: cov2(sx, sy, rho) };
}

export interface Normal1 {
  mean: number;
  sd: number;
}

/** p(y | x = a), via the general conditioning formula in lib/math/gaussian. */
export function conditionalY(rho: number, a: number): Normal1 {
  const c = condition(joint(rho), [0], vec([a]));
  return { mean: c.mean[0]!, sd: Math.sqrt(c.cov.data[0]!) };
}

/** p(y), via marginalization (picking the block). */
export function marginalY(rho: number): Normal1 {
  const m = marginalize(joint(rho), [1]);
  return { mean: m.mean[0]!, sd: Math.sqrt(m.cov.data[0]!) };
}

/** Information matrix Ω = Σ⁻¹ of the joint. Ω_yy = 1 / Var(y | x). */
export function information(rho: number): Mat {
  return toInformation(joint(rho)).info;
}

/** Joint density sampled on an nx × ny grid of cell centres (row 0 = top, i.e. largest y). */
export function densityGrid(rho: number, nx: number, ny: number): Float64Array {
  const g = joint(rho);
  const [x0, x1] = SLICE_LIMITS.xDomain;
  const [y0, y1] = SLICE_LIMITS.yDomain;
  const out = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const y = y1 - ((j + 0.5) * (y1 - y0)) / ny;
    for (let i = 0; i < nx; i++) {
      const x = x0 + ((i + 0.5) * (x1 - x0)) / nx;
      out[j * nx + i] = pdf(g, vec([x, y]));
    }
  }
  return out;
}

/** The joint density along the slice x = a (unnormalized in y): p(a, y). */
export function sliceDensity(rho: number, a: number, y: number): number {
  return pdf(joint(rho), vec([a, y]));
}

/** Line of conditional means y = μ_y + ρ (σ_y/σ_x)(x − μ_x), evaluated at x. */
export function meanLine(rho: number, x: number): number {
  const { mean, sx, sy } = SLICE_DEFAULTS;
  return mean[1] + ((rho * sy) / sx) * (x - mean[0]);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
