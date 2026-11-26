/**
 * Linear least squares (post 05): ordinary, weighted, and least absolute deviations for lines.
 * Solved through the normal equations with a Cholesky factorization (never an explicit inverse).
 */
import { cholesky, mulVec, solveCholesky, transpose, zeros, type Mat, type Vec } from './matrix';

export interface LstsqResult {
  /** Estimated parameters x̂. */
  x: Vec;
  /** Residuals r = b − A x̂. */
  residuals: Vec;
  /** Weighted cost Σ wᵢ rᵢ². */
  cost: number;
}

/**
 * Minimize Σ wᵢ (bᵢ − aᵢᵀx)² by solving the normal equations AᵀWA x = AᵀW b.
 * Weights default to 1 (ordinary least squares). Throws if AᵀWA is singular.
 */
export function lstsq(A: Mat, b: Vec, w?: Vec): LstsqResult {
  const m = A.rows;
  const n = A.cols;
  if (b.length !== m) throw new RangeError('lstsq: b has the wrong length');
  if (w && w.length !== m) throw new RangeError('lstsq: w has the wrong length');
  const N = zeros(n, n);
  const rhs = new Float64Array(n);
  for (let i = 0; i < m; i++) {
    const wi = w ? w[i]! : 1;
    if (wi < 0) throw new RangeError('lstsq: weights must be non-negative');
    for (let j = 0; j < n; j++) {
      const aij = A.data[i * n + j]!;
      rhs[j]! += wi * aij * b[i]!;
      for (let k = 0; k < n; k++) N.data[j * n + k]! += wi * aij * A.data[i * n + k]!;
    }
  }
  const L = cholesky(N);
  // Reject (numerically) rank-deficient problems: a pivot tiny compared with the largest diagonal.
  let maxDiag = 0;
  let minPivot = Infinity;
  for (let j = 0; j < n; j++) {
    maxDiag = Math.max(maxDiag, N.data[j * n + j]!);
    minPivot = Math.min(minPivot, L.data[j * n + j]! ** 2);
  }
  if (minPivot <= 1e-12 * maxDiag) throw new Error('lstsq: the columns of A are (nearly) linearly dependent');
  const x = solveCholesky(L, rhs);
  const fit = mulVec(A, x);
  const residuals = b.map((bi, i) => bi - fit[i]!);
  let cost = 0;
  for (let i = 0; i < m; i++) cost += (w ? w[i]! : 1) * residuals[i]! ** 2;
  return { x, residuals, cost };
}

/** Design matrix [1, xᵢ] for fitting a line y = c + s·x. */
export function lineDesign(xs: ArrayLike<number>): Mat {
  const A = zeros(xs.length, 2);
  for (let i = 0; i < xs.length; i++) {
    A.data[2 * i] = 1;
    A.data[2 * i + 1] = xs[i]!;
  }
  return A;
}

export interface Line {
  intercept: number;
  slope: number;
}

/** Weighted least-squares line through (xᵢ, yᵢ). */
export function fitLine(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  w?: ArrayLike<number>,
): Line & { cost: number; residuals: Vec } {
  const r = lstsq(lineDesign(xs), Float64Array.from(ys), w ? Float64Array.from(w) : undefined);
  return { intercept: r.x[0]!, slope: r.x[1]!, cost: r.cost, residuals: r.residuals };
}

/**
 * Least-absolute-deviations line: minimizes Σ wᵢ |yᵢ − c − s xᵢ|. Exact for small n: an optimal
 * LAD line passes through two of the data points, so we search all pairs (O(n³), fine for n ≲ 50).
 */
export function fitLineLAD(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  w?: ArrayLike<number>,
): Line & { cost: number } {
  const n = xs.length;
  if (n < 2) throw new RangeError('fitLineLAD needs at least two points');
  let best: (Line & { cost: number }) | null = null;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = xs[j]! - xs[i]!;
      if (dx === 0) continue;
      const slope = (ys[j]! - ys[i]!) / dx;
      const intercept = ys[i]! - slope * xs[i]!;
      let cost = 0;
      for (let k = 0; k < n; k++) cost += (w ? w[k]! : 1) * Math.abs(ys[k]! - intercept - slope * xs[k]!);
      if (!best || cost < best.cost - 1e-12) best = { intercept, slope, cost };
    }
  }
  if (!best) throw new RangeError('fitLineLAD: all points share one x');
  return best;
}

/** Aᵀ r, which is zero at the least-squares solution (the residual is orthogonal to the columns of A). */
export function normalResidual(A: Mat, r: Vec, w?: Vec): Vec {
  const wr = w ? r.map((ri, i) => ri * w[i]!) : r;
  return mulVec(transpose(A), wr);
}
