/**
 * Small dense linear-algebra kit (DESIGN §5.1). Row-major Float64Array storage.
 * Every function is pure: inputs are never mutated, a new object is returned.
 */

export interface Mat {
  readonly rows: number;
  readonly cols: number;
  readonly data: Float64Array; // row-major, length rows*cols
}
export type Vec = Float64Array;

// ---------------------------------------------------------------- construction

export function zeros(rows: number, cols: number): Mat {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 0 || cols < 0) {
    throw new RangeError(`invalid shape ${rows}x${cols}`);
  }
  return { rows, cols, data: new Float64Array(rows * cols) };
}

/** Alias for {@link zeros}, kept for readability at call sites. */
export const create = zeros;

export function identity(n: number): Mat {
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m.data[i * n + i] = 1;
  return m;
}

/** Build a matrix from nested row arrays. All rows must have the same length. */
export function fromArrays(rows: readonly (readonly number[])[]): Mat {
  const r = rows.length;
  const c = r === 0 ? 0 : rows[0]!.length;
  const m = zeros(r, c);
  for (let i = 0; i < r; i++) {
    const row = rows[i]!;
    if (row.length !== c) throw new RangeError('ragged rows');
    for (let j = 0; j < c; j++) m.data[i * c + j] = row[j]!;
  }
  return m;
}

export function toArrays(a: Mat): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < a.rows; i++) out.push(Array.from(a.data.subarray(i * a.cols, (i + 1) * a.cols)));
  return out;
}

export function diag(values: readonly number[]): Mat {
  const n = values.length;
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m.data[i * n + i] = values[i]!;
  return m;
}

export function vec(values: readonly number[]): Vec {
  return Float64Array.from(values);
}

/** Column matrix (n×1) from a vector. */
export function colMat(v: Vec | readonly number[]): Mat {
  return { rows: v.length, cols: 1, data: Float64Array.from(v) };
}

export function clone(a: Mat): Mat {
  return { rows: a.rows, cols: a.cols, data: a.data.slice() };
}

export function get(a: Mat, i: number, j: number): number {
  return a.data[i * a.cols + j]!;
}

// ---------------------------------------------------------------- arithmetic

function assertSameShape(a: Mat, b: Mat): void {
  if (a.rows !== b.rows || a.cols !== b.cols) {
    throw new RangeError(`shape mismatch ${a.rows}x${a.cols} vs ${b.rows}x${b.cols}`);
  }
}

export function add(a: Mat, b: Mat): Mat {
  assertSameShape(a, b);
  const m = zeros(a.rows, a.cols);
  for (let k = 0; k < a.data.length; k++) m.data[k] = a.data[k]! + b.data[k]!;
  return m;
}

export function sub(a: Mat, b: Mat): Mat {
  assertSameShape(a, b);
  const m = zeros(a.rows, a.cols);
  for (let k = 0; k < a.data.length; k++) m.data[k] = a.data[k]! - b.data[k]!;
  return m;
}

export function scale(a: Mat, s: number): Mat {
  const m = zeros(a.rows, a.cols);
  for (let k = 0; k < a.data.length; k++) m.data[k] = a.data[k]! * s;
  return m;
}

export function mul(a: Mat, b: Mat): Mat {
  if (a.cols !== b.rows) throw new RangeError(`cannot multiply ${a.rows}x${a.cols} by ${b.rows}x${b.cols}`);
  const m = zeros(a.rows, b.cols);
  const n = a.cols;
  for (let i = 0; i < a.rows; i++) {
    for (let k = 0; k < n; k++) {
      const aik = a.data[i * n + k]!;
      if (aik === 0) continue;
      for (let j = 0; j < b.cols; j++) m.data[i * b.cols + j]! += aik * b.data[k * b.cols + j]!;
    }
  }
  return m;
}

export function mulVec(a: Mat, v: Vec): Vec {
  if (a.cols !== v.length) throw new RangeError('dimension mismatch in mulVec');
  const out = new Float64Array(a.rows);
  for (let i = 0; i < a.rows; i++) {
    let s = 0;
    for (let j = 0; j < a.cols; j++) s += a.data[i * a.cols + j]! * v[j]!;
    out[i] = s;
  }
  return out;
}

export function dot(a: Vec, b: Vec): number {
  if (a.length !== b.length) throw new RangeError('dimension mismatch in dot');
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

export function vecAdd(a: Vec, b: Vec): Vec {
  if (a.length !== b.length) throw new RangeError('dimension mismatch');
  return a.map((x, i) => x + b[i]!);
}

export function vecSub(a: Vec, b: Vec): Vec {
  if (a.length !== b.length) throw new RangeError('dimension mismatch');
  return a.map((x, i) => x - b[i]!);
}

export function transpose(a: Mat): Mat {
  const m = zeros(a.cols, a.rows);
  for (let i = 0; i < a.rows; i++) for (let j = 0; j < a.cols; j++) m.data[j * a.rows + i] = a.data[i * a.cols + j]!;
  return m;
}

/** Copy the block starting at (r0, c0) of size rows×cols. */
export function getBlock(a: Mat, r0: number, c0: number, rows: number, cols: number): Mat {
  if (r0 < 0 || c0 < 0 || r0 + rows > a.rows || c0 + cols > a.cols) throw new RangeError('block out of range');
  const m = zeros(rows, cols);
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) m.data[i * cols + j] = a.data[(r0 + i) * a.cols + c0 + j]!;
  return m;
}

/** Return a copy of `a` with block `b` written at (r0, c0). */
export function setBlock(a: Mat, r0: number, c0: number, b: Mat): Mat {
  if (r0 < 0 || c0 < 0 || r0 + b.rows > a.rows || c0 + b.cols > a.cols) throw new RangeError('block out of range');
  const m = clone(a);
  for (let i = 0; i < b.rows; i++)
    for (let j = 0; j < b.cols; j++) m.data[(r0 + i) * a.cols + c0 + j] = b.data[i * b.cols + j]!;
  return m;
}

/** Select rows and columns by index lists (e.g. to extract a sub-covariance). */
export function select(a: Mat, rowIdx: readonly number[], colIdx: readonly number[]): Mat {
  const m = zeros(rowIdx.length, colIdx.length);
  rowIdx.forEach((r, i) => colIdx.forEach((c, j) => (m.data[i * colIdx.length + j] = get(a, r, c))));
  return m;
}

/** (A + Aᵀ)/2, used after every covariance update to kill round-off asymmetry. */
export function symmetrize(a: Mat): Mat {
  if (a.rows !== a.cols) throw new RangeError('symmetrize needs a square matrix');
  const n = a.rows;
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) m.data[i * n + j] = 0.5 * (a.data[i * n + j]! + a.data[j * n + i]!);
  }
  return m;
}

export function maxAbsDiff(a: Mat, b: Mat): number {
  assertSameShape(a, b);
  let d = 0;
  for (let k = 0; k < a.data.length; k++) d = Math.max(d, Math.abs(a.data[k]! - b.data[k]!));
  return d;
}

// ---------------------------------------------------------------- factorizations

/**
 * Cholesky factor L (lower triangular) with A = L Lᵀ.
 * Throws if A is not symmetric positive definite (to working precision).
 */
export function cholesky(a: Mat): Mat {
  if (a.rows !== a.cols) throw new RangeError('cholesky needs a square matrix');
  const n = a.rows;
  const L = zeros(n, n);
  for (let j = 0; j < n; j++) {
    let s = a.data[j * n + j]!;
    for (let k = 0; k < j; k++) s -= L.data[j * n + k]! ** 2;
    if (!(s > 0)) throw new Error('matrix is not positive definite');
    const ljj = Math.sqrt(s);
    L.data[j * n + j] = ljj;
    for (let i = j + 1; i < n; i++) {
      let t = a.data[i * n + j]!;
      for (let k = 0; k < j; k++) t -= L.data[i * n + k]! * L.data[j * n + k]!;
      L.data[i * n + j] = t / ljj;
    }
  }
  return L;
}

/** Solve L y = b (forward substitution), L lower triangular. */
export function forwardSubst(L: Mat, b: Vec): Vec {
  const n = L.rows;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= L.data[i * n + k]! * y[k]!;
    y[i] = s / L.data[i * n + i]!;
  }
  return y;
}

/** Solve Lᵀ x = y (back substitution) given lower-triangular L. */
export function backSubstTransposed(L: Mat, y: Vec): Vec {
  const n = L.rows;
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= L.data[k * n + i]! * x[k]!;
    x[i] = s / L.data[i * n + i]!;
  }
  return x;
}

/** Solve A x = b given the Cholesky factor L of A. */
export function solveCholesky(L: Mat, b: Vec): Vec {
  return backSubstTransposed(L, forwardSubst(L, b));
}

/** Solve A X = B column by column given the Cholesky factor L of A. */
export function solveCholeskyMat(L: Mat, B: Mat): Mat {
  const X = zeros(B.rows, B.cols);
  for (let j = 0; j < B.cols; j++) {
    const col = new Float64Array(B.rows);
    for (let i = 0; i < B.rows; i++) col[i] = B.data[i * B.cols + j]!;
    const x = solveCholesky(L, col);
    for (let i = 0; i < B.rows; i++) X.data[i * B.cols + j] = x[i]!;
  }
  return X;
}

export interface LU {
  /** Packed L (unit diagonal, below) and U (on and above diagonal). */
  lu: Mat;
  /** Row permutation: row i of PA is row perm[i] of A. */
  perm: Int32Array;
  /** +1 or −1, the sign of the permutation. */
  sign: number;
}

/** LU decomposition with partial pivoting, PA = LU. Throws if A is singular. */
export function luDecompose(a: Mat): LU {
  if (a.rows !== a.cols) throw new RangeError('LU needs a square matrix');
  const n = a.rows;
  const m = clone(a);
  const d = m.data;
  const perm = new Int32Array(n);
  for (let i = 0; i < n; i++) perm[i] = i;
  let sign = 1;
  let scaleRef = 0;
  for (let k = 0; k < d.length; k++) scaleRef = Math.max(scaleRef, Math.abs(d[k]!));
  const tiny = Number.EPSILON * n * (scaleRef || 1);
  for (let k = 0; k < n; k++) {
    let p = k;
    let best = Math.abs(d[k * n + k]!);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(d[i * n + k]!);
      if (v > best) {
        best = v;
        p = i;
      }
    }
    if (best <= tiny) throw new Error('matrix is singular');
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const t = d[k * n + j]!;
        d[k * n + j] = d[p * n + j]!;
        d[p * n + j] = t;
      }
      const t = perm[k]!;
      perm[k] = perm[p]!;
      perm[p] = t;
      sign = -sign;
    }
    const pivot = d[k * n + k]!;
    for (let i = k + 1; i < n; i++) {
      const f = (d[i * n + k]! /= pivot);
      if (f === 0) continue;
      for (let j = k + 1; j < n; j++) d[i * n + j]! -= f * d[k * n + j]!;
    }
  }
  return { lu: m, perm, sign };
}

/** Solve A x = b, either from a precomputed LU or directly from A. */
export function luSolve(aOrLu: Mat | LU, b: Vec): Vec {
  const { lu, perm } = 'lu' in aOrLu ? aOrLu : luDecompose(aOrLu);
  const n = lu.rows;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[perm[i]!]!;
    for (let k = 0; k < i; k++) s -= lu.data[i * n + k]! * y[k]!;
    y[i] = s;
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= lu.data[i * n + k]! * x[k]!;
    x[i] = s / lu.data[i * n + i]!;
  }
  return x;
}

export function det(a: Mat): number {
  if (a.rows !== a.cols) throw new RangeError('det needs a square matrix');
  if (a.rows === 0) return 1;
  if (a.rows === 1) return a.data[0]!;
  if (a.rows === 2) return a.data[0]! * a.data[3]! - a.data[1]! * a.data[2]!;
  let lu: LU;
  try {
    lu = luDecompose(a);
  } catch {
    return 0;
  }
  let p = lu.sign;
  for (let i = 0; i < a.rows; i++) p *= lu.lu.data[i * a.rows + i]!;
  return p;
}

/**
 * Matrix inverse. With `{ spd: true }` uses Cholesky (for covariances);
 * otherwise LU with partial pivoting. Prefer a solve over an explicit inverse.
 */
export function inverse(a: Mat, opts: { spd?: boolean } = {}): Mat {
  const n = a.rows;
  if (opts.spd) return symmetrize(solveCholeskyMat(cholesky(a), identity(n)));
  const lu = luDecompose(a);
  const inv = zeros(n, n);
  for (let j = 0; j < n; j++) {
    const e = new Float64Array(n);
    e[j] = 1;
    const x = luSolve(lu, e);
    for (let i = 0; i < n; i++) inv.data[i * n + j] = x[i]!;
  }
  return inv;
}

// ---------------------------------------------------------------- eigen

export interface Eig {
  /** Eigenvalues sorted in descending order. */
  values: Float64Array;
  /** Eigenvectors as columns, matching `values`. Orthonormal. */
  vectors: Mat;
}

/**
 * Closed-form eigen-decomposition of a symmetric 2×2 matrix [[a, b], [b, c]].
 * Values descending; vectors are unit columns with a deterministic sign
 * (first nonzero component of each vector is positive).
 */
export function eigSym2(m: Mat): Eig {
  if (m.rows !== 2 || m.cols !== 2) throw new RangeError('eigSym2 needs a 2x2 matrix');
  const a = m.data[0]!;
  const b = 0.5 * (m.data[1]! + m.data[2]!);
  const c = m.data[3]!;
  const mean = 0.5 * (a + c);
  const r = Math.hypot(0.5 * (a - c), b);
  const l1 = mean + r;
  const l2 = mean - r;
  // Angle of the major axis: θ = ½ atan2(2b, a − c). Well defined when r > 0.
  const theta = r === 0 ? 0 : 0.5 * Math.atan2(2 * b, a - c);
  let v1x = Math.cos(theta);
  let v1y = Math.sin(theta);
  if (v1x < 0 || (v1x === 0 && v1y < 0)) {
    v1x = -v1x;
    v1y = -v1y;
  }
  // Second eigenvector is v1 rotated by +90°, then sign-normalized.
  let v2x = -v1y;
  let v2y = v1x;
  if (v2x < 0 || (v2x === 0 && v2y < 0)) {
    v2x = -v2x;
    v2y = -v2y;
  }
  return {
    values: Float64Array.of(l1, l2),
    vectors: fromArrays([
      [v1x, v2x],
      [v1y, v2y],
    ]),
  };
}

/** Cyclic Jacobi eigen-decomposition for small symmetric matrices. */
export function eigSym(m: Mat, opts: { tol?: number; maxSweeps?: number } = {}): Eig {
  if (m.rows !== m.cols) throw new RangeError('eigSym needs a square matrix');
  const n = m.rows;
  const tol = opts.tol ?? 1e-14;
  const maxSweeps = opts.maxSweeps ?? 100;
  const A = symmetrize(m).data;
  const V = identity(n).data;
  let frob = 0;
  for (let k = 0; k < A.length; k++) frob += A[k]! ** 2;
  frob = Math.sqrt(frob);
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i * n + j]! ** 2;
    if (Math.sqrt(off) <= tol * (frob || 1)) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q]!;
        if (apq === 0) continue;
        const app = A[p * n + p]!;
        const aqq = A[q * n + q]!;
        const tau = (aqq - app) / (2 * apq);
        const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k * n + p]!;
          const akq = A[k * n + q]!;
          A[k * n + p] = c * akp - s * akq;
          A[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p * n + k]!;
          const aqk = A[q * n + k]!;
          A[p * n + k] = c * apk - s * aqk;
          A[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p]!;
          const vkq = V[k * n + q]!;
          V[k * n + p] = c * vkp - s * vkq;
          V[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => A[j * n + j]! - A[i * n + i]!);
  const values = Float64Array.from(order, (i) => A[i * n + i]!);
  const vectors = zeros(n, n);
  order.forEach((src, dst) => {
    let firstSign = 0;
    for (let k = 0; k < n && firstSign === 0; k++) firstSign = Math.sign(V[k * n + src]!);
    const s = firstSign < 0 ? -1 : 1;
    for (let k = 0; k < n; k++) vectors.data[k * n + dst] = s * V[k * n + src]!;
  });
  return { values, vectors };
}

/** True if A is symmetric (to `tol`, relative) and all eigenvalues ≥ −tol·‖A‖. */
export function isSymmetricPSD(a: Mat, tol = 1e-9): boolean {
  if (a.rows !== a.cols) return false;
  const n = a.rows;
  let scaleRef = 0;
  for (let k = 0; k < a.data.length; k++) scaleRef = Math.max(scaleRef, Math.abs(a.data[k]!));
  const s = scaleRef || 1;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) if (Math.abs(get(a, i, j) - get(a, j, i)) > tol * s) return false;
  const { values } = eigSym(a);
  return values.every((v) => v >= -tol * s);
}
