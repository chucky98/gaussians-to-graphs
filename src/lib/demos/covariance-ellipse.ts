/** Pure model behind the CovarianceEllipse widget (post 02). */
import { cov2, ellipseParams, mahalanobis } from '../math/gaussian';
import { cholesky, eigSym2, get, vec, type Mat } from '../math/matrix';
import { createRng } from '../math/rng';
import { chi2Quantile } from '../math/stats';

export interface CovParams {
  sx: number;
  sy: number;
  rho: number;
}

export const COV_LIMITS = {
  sigma: { min: 0.25, max: 3, step: 0.05 },
  rho: { min: -0.95, max: 0.95, step: 0.01 },
  domain: [-8, 8] as [number, number],
} as const;

export const COV_DEFAULTS = {
  params: { sx: 2, sy: 1, rho: 0.6 } as CovParams,
  level: 0.95,
  n: 1000,
  seed: 2,
  probes: [
    [3, 0],
    [0, 3],
  ] as [number, number][],
} as const;

export const LEVEL_OPTIONS: { value: number; label: string; short: string }[] = [
  { value: 1 - Math.exp(-0.5), label: '39.3% (the "1σ" ellipse)', short: '39.3%' },
  { value: 0.5, label: '50%', short: '50%' },
  { value: 0.9, label: '90%', short: '90%' },
  { value: 0.95, label: '95%', short: '95%' },
  { value: 0.99, label: '99%', short: '99%' },
];

export function levelShort(level: number): string {
  return LEVEL_OPTIONS.find((o) => Math.abs(o.value - level) < 1e-9)?.short ?? `${(100 * level).toFixed(1)}%`;
}

export const SAMPLE_COUNT_OPTIONS = [200, 1000, 5000] as const;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function clampParams(p: CovParams): CovParams {
  const s = COV_LIMITS.sigma;
  const r = COV_LIMITS.rho;
  return { sx: clamp(p.sx, s.min, s.max), sy: clamp(p.sy, s.min, s.max), rho: clamp(p.rho, r.min, r.max) };
}

export function covOf(p: CovParams): Mat {
  return cov2(p.sx, p.sy, p.rho);
}

export interface Axes {
  /** Eigenvalues λ1 ≥ λ2 of Σ. */
  l1: number;
  l2: number;
  /** Unit eigenvectors. */
  v1: [number, number];
  v2: [number, number];
  /** Semi-axis lengths of the `level` ellipse: √(c λ). */
  a: number;
  b: number;
  /** Angle of v1 from +x (radians). */
  theta: number;
  c: number;
}

export function axesOf(p: CovParams, level: number): Axes {
  const S = covOf(p);
  const { values, vectors } = eigSym2(S);
  const e = ellipseParams({ mean: vec([0, 0]), cov: S }, level);
  return {
    l1: values[0]!,
    l2: values[1]!,
    v1: [get(vectors, 0, 0), get(vectors, 1, 0)],
    v2: [get(vectors, 0, 1), get(vectors, 1, 1)],
    a: e.rx,
    b: e.ry,
    theta: e.angle,
    c: e.c,
  };
}

/**
 * Covariance from ellipse geometry: semi-axes a (along angle θ) and b (perpendicular)
 * of the `level` ellipse. Σ = R diag(a²/c, b²/c) Rᵀ. Returned unclamped.
 */
export function paramsFromAxes(theta: number, a: number, b: number, level: number): CovParams {
  const c = chi2Quantile(level, 2);
  const l1 = (a * a) / c;
  const l2 = (b * b) / c;
  const co = Math.cos(theta);
  const si = Math.sin(theta);
  const sxx = l1 * co * co + l2 * si * si;
  const syy = l1 * si * si + l2 * co * co;
  const sxy = (l1 - l2) * co * si;
  const sx = Math.sqrt(sxx);
  const sy = Math.sqrt(syy);
  return { sx, sy, rho: sxy / (sx * sy) };
}

/**
 * Standard-normal draws z (interleaved pairs). Samples of N(0, Σ) are L z with L = chol(Σ),
 * so the same z give smoothly moving samples as Σ changes.
 */
export function standardSamples(seed: number, n: number): Float64Array {
  const rng = createRng(seed);
  return Float64Array.from({ length: 2 * n }, () => rng.normal());
}

export function transformSamples(z: Float64Array, p: CovParams): Float64Array {
  const L = cholesky(covOf(p));
  const l00 = get(L, 0, 0);
  const l10 = get(L, 1, 0);
  const l11 = get(L, 1, 1);
  const out = new Float64Array(z.length);
  for (let i = 0; i < z.length; i += 2) {
    out[i] = l00 * z[i]!;
    out[i + 1] = l10 * z[i]! + l11 * z[i + 1]!;
  }
  return out;
}

/**
 * Number of the first `k` samples inside the `level` ellipse. The squared Mahalanobis
 * distance of L z is ‖z‖², so this count does not depend on Σ at all.
 */
export function countInside(z: Float64Array, k: number, level: number): number {
  const c = chi2Quantile(level, 2);
  let n = 0;
  for (let i = 0; i < Math.min(k, z.length / 2); i++) if (z[2 * i]! ** 2 + z[2 * i + 1]! ** 2 <= c) n++;
  return n;
}

export interface ProbeInfo {
  euclid: number;
  dM: number;
  inside: boolean;
}

export function probeInfo(pt: [number, number], p: CovParams, level: number): ProbeInfo {
  const dM = mahalanobis({ mean: vec([0, 0]), cov: covOf(p) }, vec(pt));
  return { euclid: Math.hypot(pt[0], pt[1]), dM, inside: dM * dM <= chi2Quantile(level, 2) };
}

/** Probability mass of the ellipse that passes through a point at Mahalanobis distance d: 1 − e^{−d²/2}. */
export function massWithin(dM: number): number {
  return 1 - Math.exp(-0.5 * dM * dM);
}

export function clampProbe(pt: [number, number]): [number, number] {
  const [lo, hi] = COV_LIMITS.domain;
  return [clamp(pt[0], lo + 0.2, hi - 0.2), clamp(pt[1], lo + 0.2, hi - 0.2)];
}
