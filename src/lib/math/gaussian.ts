/** Multivariate Gaussian utilities (DESIGN §5.1). N(μ, Σ) is `{ mean, cov }`. */
import {
  add,
  cholesky,
  eigSym2,
  forwardSubst,
  get,
  inverse,
  mul,
  mulVec,
  schurComplement,
  select,
  solveCholesky,
  symmetrize,
  transpose,
  vecAdd,
  vecSub,
  type Mat,
  type Vec,
} from './matrix';
import type { Rng } from './rng';
import { chi2Quantile } from './stats';

export interface Gaussian {
  mean: Vec;
  cov: Mat;
}

export interface InformationForm {
  /** Information matrix Ω = Σ⁻¹. */
  info: Mat;
  /** Information vector ξ = Ω μ. */
  vec: Vec;
}

function dim(g: Gaussian): number {
  if (g.cov.rows !== g.mean.length || g.cov.cols !== g.mean.length) throw new RangeError('mean/cov dimension mismatch');
  return g.mean.length;
}

/** Squared Mahalanobis distance (x − μ)ᵀ Σ⁻¹ (x − μ), computed with a Cholesky solve. */
export function mahalanobis2(g: Gaussian, x: Vec): number {
  dim(g);
  const y = forwardSubst(cholesky(g.cov), vecSub(x, g.mean));
  let s = 0;
  for (let i = 0; i < y.length; i++) s += y[i]! * y[i]!;
  return s;
}

/** Mahalanobis distance d_M = √((x − μ)ᵀ Σ⁻¹ (x − μ)). */
export function mahalanobis(g: Gaussian, x: Vec): number {
  return Math.sqrt(mahalanobis2(g, x));
}

export function logpdf(g: Gaussian, x: Vec): number {
  const n = dim(g);
  const L = cholesky(g.cov);
  const y = forwardSubst(L, vecSub(x, g.mean));
  let q = 0;
  let logDet = 0;
  for (let i = 0; i < n; i++) {
    q += y[i]! * y[i]!;
    logDet += 2 * Math.log(L.data[i * n + i]!);
  }
  return -0.5 * (n * Math.log(2 * Math.PI) + logDet + q);
}

export function pdf(g: Gaussian, x: Vec): number {
  return Math.exp(logpdf(g, x));
}

/** 1D Gaussian density with mean μ and standard deviation σ. */
export function pdf1(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

/** Draw `n` samples. */
export function sample(g: Gaussian, rng: Rng, n: number): Vec[] {
  dim(g);
  const L = cholesky(g.cov);
  return Array.from({ length: n }, () => rng.mvnormal(g.mean, L));
}

/** y = A x + b with x ~ N(μ, Σ) gives y ~ N(Aμ + b, A Σ Aᵀ). */
export function linearTransform(g: Gaussian, A: Mat, b?: Vec): Gaussian {
  dim(g);
  const m = mulVec(A, g.mean);
  return { mean: b ? vecAdd(m, b) : m, cov: symmetrize(mul(mul(A, g.cov), transpose(A))) };
}

/** Marginal over the components listed in `idx` (covariance form: just pick the sub-blocks). */
export function marginalize(g: Gaussian, idx: readonly number[]): Gaussian {
  dim(g);
  return { mean: Float64Array.from(idx, (i) => g.mean[i]!), cov: select(g.cov, idx, idx) };
}

/**
 * Condition on x[idx] = value. Returns the Gaussian over the remaining components
 * (in their original order): μ_a + Σ_ab Σ_bb⁻¹ (v − μ_b), Σ_aa − Σ_ab Σ_bb⁻¹ Σ_ba.
 */
export function condition(g: Gaussian, idx: readonly number[], value: Vec): Gaussian {
  const n = dim(g);
  if (value.length !== idx.length) throw new RangeError('condition: value length mismatch');
  const b = [...idx];
  const a = Array.from({ length: n }, (_, i) => i).filter((i) => !b.includes(i));
  const Saa = select(g.cov, a, a);
  const Sab = select(g.cov, a, b);
  const Sbb = select(g.cov, b, b);
  const Lbb = cholesky(Sbb);
  const mua = Float64Array.from(a, (i) => g.mean[i]!);
  const mub = Float64Array.from(b, (i) => g.mean[i]!);
  const w = solveCholesky(Lbb, vecSub(value, mub)); // Σ_bb⁻¹ (v − μ_b)
  const mean = vecAdd(mua, mulVec(Sab, w));
  // Σ_ab Σ_bb⁻¹ Σ_ba, column by column.
  const Sba = transpose(Sab);
  const corr = Array.from({ length: a.length }, () => new Float64Array(a.length));
  for (let j = 0; j < a.length; j++) {
    const col = Float64Array.from(b, (_, r) => get(Sba, r, j));
    const x = mulVec(Sab, solveCholesky(Lbb, col));
    for (let i = 0; i < a.length; i++) corr[i]![j] = x[i]!;
  }
  const cov = symmetrize({
    rows: a.length,
    cols: a.length,
    data: Float64Array.from({ length: a.length * a.length }, (_, k) => {
      const i = Math.floor(k / a.length);
      const j = k % a.length;
      return Saa.data[k]! - corr[i]![j]!;
    }),
  });
  return { mean, cov };
}

/** Normalized product of two Gaussian densities over the same variable. */
export function product(g1: Gaussian, g2: Gaussian): Gaussian {
  const i1 = toInformation(g1);
  const i2 = toInformation(g2);
  return fromInformation({ info: add(i1.info, i2.info), vec: vecAdd(i1.vec, i2.vec) });
}

/**
 * Scale factor c in N(x; μ1, Σ1)·N(x; μ2, Σ2) = c · N(x; μ, Σ):
 * c = N(μ1; μ2, Σ1 + Σ2).
 */
export function productNormalizer(g1: Gaussian, g2: Gaussian): number {
  return pdf({ mean: g2.mean, cov: add(g1.cov, g2.cov) }, g1.mean);
}

/** 1D product: N(μ1, σ1²)·N(μ2, σ2²) ∝ N(μ, σ²). Returns mean and variance. */
export function product1(mu1: number, var1: number, mu2: number, var2: number): { mean: number; variance: number } {
  const variance = (var1 * var2) / (var1 + var2);
  return { mean: variance * (mu1 / var1 + mu2 / var2), variance };
}

export function toInformation(g: Gaussian): InformationForm {
  dim(g);
  const info = inverse(g.cov, { spd: true });
  return { info, vec: mulVec(info, g.mean) };
}

export function fromInformation(f: InformationForm): Gaussian {
  const L = cholesky(f.info);
  const cov = inverse(f.info, { spd: true });
  return { mean: solveCholesky(L, f.vec), cov };
}

export interface Ellipse2 {
  cx: number;
  cy: number;
  /** Semi-axis lengths, major first. */
  rx: number;
  ry: number;
  /** Rotation of the major axis from +x, radians, in (−π/2, π/2]. */
  angle: number;
  /** The chi-square scale c with (x−μ)ᵀΣ⁻¹(x−μ) = c on the boundary. */
  c: number;
}

/**
 * Parameters of the `prob` confidence ellipse of a 2D Gaussian
 * (or of the first two components of a larger one).
 */
export function ellipseParams(g: Gaussian, prob = 0.95): Ellipse2 {
  const m = marginalize(g, [0, 1]);
  const { values, vectors } = eigSym2(m.cov);
  const c = chi2Quantile(prob, 2);
  const l1 = Math.max(0, values[0]!);
  const l2 = Math.max(0, values[1]!);
  return {
    cx: m.mean[0]!,
    cy: m.mean[1]!,
    rx: Math.sqrt(c * l1),
    ry: Math.sqrt(c * l2),
    angle: Math.atan2(get(vectors, 1, 0), get(vectors, 0, 0)),
    c,
  };
}

/** Points on the boundary of the `prob` confidence ellipse (default 95%), `n` points, not closed. */
export function ellipsePoints(g: Gaussian, prob = 0.95, n = 64): [number, number][] {
  const e = ellipseParams(g, prob);
  const ca = Math.cos(e.angle);
  const sa = Math.sin(e.angle);
  return Array.from({ length: n }, (_, k) => {
    const t = (2 * Math.PI * k) / n;
    const u = e.rx * Math.cos(t);
    const v = e.ry * Math.sin(t);
    return [e.cx + ca * u - sa * v, e.cy + sa * u + ca * v];
  });
}

/** Covariance of a 2D Gaussian from standard deviations and correlation coefficient ρ. */
export function cov2(sx: number, sy: number, rho: number): Mat {
  return {
    rows: 2,
    cols: 2,
    data: Float64Array.of(sx * sx, rho * sx * sy, rho * sx * sy, sy * sy),
  };
}

/**
 * Condition an information-form Gaussian on x[idx] = value. In information form this is easy:
 * keep the sub-block, Ω_{a|b} = Ω_aa, and shift the vector, ξ_{a|b} = ξ_a − Ω_ab v.
 */
export function conditionInformation(f: InformationForm, idx: readonly number[], value: Vec): InformationForm {
  const n = f.vec.length;
  if (value.length !== idx.length) throw new RangeError('conditionInformation: value length mismatch');
  const a = Array.from({ length: n }, (_, i) => i).filter((i) => !idx.includes(i));
  const shift = mulVec(select(f.info, a, [...idx]), value);
  return { info: select(f.info, a, a), vec: Float64Array.from(a, (i, r) => f.vec[i]! - shift[r]!) };
}

/**
 * Marginal over x[keep] of an information-form Gaussian. In information form this needs a
 * Schur complement: Ω_a = Ω_aa − Ω_ab Ω_bb⁻¹ Ω_ba, ξ_a = ξ_a − Ω_ab Ω_bb⁻¹ ξ_b.
 */
export function marginalizeInformation(f: InformationForm, keep: readonly number[]): InformationForm {
  const n = f.vec.length;
  const b = Array.from({ length: n }, (_, i) => i).filter((i) => !keep.includes(i));
  if (b.length === 0) return { info: select(f.info, keep, keep), vec: Float64Array.from(keep, (i) => f.vec[i]!) };
  const L = cholesky(select(f.info, b, b));
  const w = solveCholesky(
    L,
    Float64Array.from(b, (i) => f.vec[i]!),
  ); // Ω_bb⁻¹ ξ_b
  const shift = mulVec(select(f.info, [...keep], b), w);
  return {
    info: schurComplement(f.info, keep),
    vec: Float64Array.from(keep, (i, r) => f.vec[i]! - shift[r]!),
  };
}
