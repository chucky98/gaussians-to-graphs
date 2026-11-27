/**
 * Sparse symmetric matrices and sparse Cholesky factorization (DESIGN §5.1, Posts 26–30).
 *
 *  - `Csc`: compressed sparse column storage. Symmetric matrices are stored in full (both triangles), which
 *    keeps the algorithms simple; the factorization reads only the upper triangle.
 *  - `etree`: the elimination tree of A (Liu): parent[j] is the first row below the diagonal in column j
 *    of the Cholesky factor L. It decides which columns a new entry affects (Post 30).
 *  - `minimumDegree`: a fill-reducing ordering. It eliminates, at each step, a node of smallest degree in
 *    the elimination graph, updating degrees exactly. AMD (Amestoy, Davis, Duff) computes the same kind of
 *    ordering with approximate degrees for speed; for the problem sizes here the exact version is fast
 *    enough and easier to verify.
 *  - `cholesky`: up-looking sparse Cholesky (as in Davis, *Direct Methods for Sparse Linear Systems*, 2006,
 *    §4.2): row k of L is found by a sparse triangular solve whose pattern is the "reach" of row k of A in the
 *    elimination tree.
 */

export interface Csc {
  n: number;
  /** Column pointers (length n + 1), row indices and values, rows sorted within each column. */
  colPtr: Int32Array;
  rowIdx: Int32Array;
  values: Float64Array;
}

export interface Triplets {
  n: number;
  rows: number[];
  cols: number[];
  vals: number[];
}

export function triplets(n: number): Triplets {
  return { n, rows: [], cols: [], vals: [] };
}

export function addTriplet(t: Triplets, i: number, j: number, v: number): void {
  t.rows.push(i);
  t.cols.push(j);
  t.vals.push(v);
}

/** Triplets → CSC, summing duplicates. */
export function toCsc(t: Triplets): Csc {
  const n = t.n;
  const cols: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  for (let k = 0; k < t.rows.length; k++) {
    const c = cols[t.cols[k]!]!;
    c.set(t.rows[k]!, (c.get(t.rows[k]!) ?? 0) + t.vals[k]!);
  }
  const colPtr = new Int32Array(n + 1);
  for (let j = 0; j < n; j++) colPtr[j + 1] = colPtr[j]! + cols[j]!.size;
  const rowIdx = new Int32Array(colPtr[n]!);
  const values = new Float64Array(colPtr[n]!);
  for (let j = 0; j < n; j++) {
    const entries = [...cols[j]!.entries()].sort((a, b) => a[0] - b[0]);
    entries.forEach(([i, v], p) => {
      rowIdx[colPtr[j]! + p] = i;
      values[colPtr[j]! + p] = v;
    });
  }
  return { n, colPtr, rowIdx, values };
}

export function nnz(a: Csc): number {
  return a.colPtr[a.n]!;
}

export function fromDense(d: Float64Array, n: number, tol = 0): Csc {
  const t = triplets(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) if (Math.abs(d[i * n + j]!) > tol) addTriplet(t, i, j, d[i * n + j]!);
  return toCsc(t);
}

export function toDense(a: Csc): Float64Array {
  const d = new Float64Array(a.n * a.n);
  for (let j = 0; j < a.n; j++)
    for (let p = a.colPtr[j]!; p < a.colPtr[j + 1]!; p++) d[a.rowIdx[p]! * a.n + j] = a.values[p]!;
  return d;
}

/** y = A x. */
export function mulVec(a: Csc, x: ArrayLike<number>): Float64Array {
  const y = new Float64Array(a.n);
  for (let j = 0; j < a.n; j++)
    for (let p = a.colPtr[j]!; p < a.colPtr[j + 1]!; p++) y[a.rowIdx[p]!]! += a.values[p]! * x[j]!;
  return y;
}

/** P A Pᵀ for a permutation given as perm[new] = old (so entry (i, j) moves to (inv[i], inv[j])). */
export function permute(a: Csc, perm: ArrayLike<number>): Csc {
  const inv = new Int32Array(a.n);
  for (let k = 0; k < a.n; k++) inv[perm[k]!] = k;
  const t = triplets(a.n);
  for (let j = 0; j < a.n; j++)
    for (let p = a.colPtr[j]!; p < a.colPtr[j + 1]!; p++) addTriplet(t, inv[a.rowIdx[p]!]!, inv[j]!, a.values[p]!);
  return toCsc(t);
}

/** Sparsity pattern as a list of (row, col) pairs, for drawing spy plots. */
export function spyPattern(a: Csc): [number, number][] {
  const out: [number, number][] = [];
  for (let j = 0; j < a.n; j++) for (let p = a.colPtr[j]!; p < a.colPtr[j + 1]!; p++) out.push([a.rowIdx[p]!, j]);
  return out;
}

/** Elimination tree of a symmetric matrix (upper triangle used): parent[j] = −1 for a root. */
export function etree(a: Csc): Int32Array {
  const n = a.n;
  const parent = new Int32Array(n).fill(-1);
  const ancestor = new Int32Array(n).fill(-1);
  for (let k = 0; k < n; k++) {
    for (let p = a.colPtr[k]!; p < a.colPtr[k + 1]!; p++) {
      let i = a.rowIdx[p]!;
      // For each entry A(i, k) with i < k, walk up from i to the root of its current subtree.
      while (i !== -1 && i < k) {
        const next = ancestor[i]!;
        ancestor[i] = k;
        if (next === -1) parent[i] = k;
        i = next;
      }
    }
  }
  return parent;
}

/**
 * Nonzero pattern of row k of L (excluding the diagonal), in topological order: the union of the paths
 * from each i with A(i, k) ≠ 0, i < k, up the elimination tree towards k.
 */
function ereach(a: Csc, k: number, parent: Int32Array, mark: Int32Array): number[] {
  const out: number[] = [];
  mark[k] = k;
  for (let p = a.colPtr[k]!; p < a.colPtr[k + 1]!; p++) {
    let i = a.rowIdx[p]!;
    if (i > k) continue;
    const path: number[] = [];
    while (mark[i] !== k) {
      path.push(i);
      mark[i] = k;
      i = parent[i]!;
    }
    // Earlier paths end where later ones start; reverse so that every node comes after its descendants.
    for (let q = path.length - 1; q >= 0; q--) out.push(path[q]!);
  }
  out.sort((x, y) => x - y); // ascending order is a valid topological order for row solves
  return out;
}

export interface Factor {
  n: number;
  /** L in CSC form (lower triangular, diagonal first in each column). */
  L: Csc;
  parent: Int32Array;
}

/**
 * Up-looking sparse Cholesky A = L Lᵀ (A symmetric positive definite, already permuted). Throws if A is not
 * positive definite.
 */
export function cholesky(a: Csc): Factor {
  const n = a.n;
  const parent = etree(a);
  const mark = new Int32Array(n).fill(-1);
  const x = new Float64Array(n);
  // Columns of L grow as rows are computed: column j collects L(k, j) for k > j.
  const colRows: number[][] = Array.from({ length: n }, () => []);
  const colVals: number[][] = Array.from({ length: n }, () => []);
  const diag = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const pattern = ereach(a, k, parent, mark);
    // Scatter the upper part of column k of A (rows ≤ k) into x.
    let d = 0;
    for (let p = a.colPtr[k]!; p < a.colPtr[k + 1]!; p++) {
      const i = a.rowIdx[p]!;
      if (i < k) x[i] = a.values[p]!;
      else if (i === k) d = a.values[p]!;
    }
    // Solve L(0:k−1, 0:k−1) l = A(0:k−1, k) on the pattern; then l is row k of L.
    for (const j of pattern) {
      const lkj = x[j]! / diag[j]!;
      x[j] = 0;
      const rows = colRows[j]!;
      const vals = colVals[j]!;
      for (let q = 0; q < rows.length; q++) x[rows[q]!]! -= vals[q]! * lkj;
      d -= lkj * lkj;
      rows.push(k);
      vals.push(lkj);
    }
    if (!(d > 0)) throw new RangeError(`sparse cholesky: not positive definite at column ${k}`);
    diag[k] = Math.sqrt(d);
  }
  const colPtr = new Int32Array(n + 1);
  for (let j = 0; j < n; j++) colPtr[j + 1] = colPtr[j]! + 1 + colRows[j]!.length;
  const rowIdx = new Int32Array(colPtr[n]!);
  const values = new Float64Array(colPtr[n]!);
  for (let j = 0; j < n; j++) {
    let p = colPtr[j]!;
    rowIdx[p] = j;
    values[p++] = diag[j]!;
    for (let q = 0; q < colRows[j]!.length; q++) {
      rowIdx[p] = colRows[j]![q]!;
      values[p++] = colVals[j]![q]!;
    }
  }
  return { n, L: { n, colPtr, rowIdx, values }, parent };
}

/** Solve L Lᵀ x = b for a factor of the (permuted) matrix. */
export function solveFactor(f: Factor, b: ArrayLike<number>): Float64Array {
  const { L, n } = f;
  const x = Float64Array.from(b);
  for (let j = 0; j < n; j++) {
    x[j]! /= L.values[L.colPtr[j]!]!;
    for (let p = L.colPtr[j]! + 1; p < L.colPtr[j + 1]!; p++) x[L.rowIdx[p]!]! -= L.values[p]! * x[j]!;
  }
  for (let j = n - 1; j >= 0; j--) {
    for (let p = L.colPtr[j]! + 1; p < L.colPtr[j + 1]!; p++) x[j]! -= L.values[p]! * x[L.rowIdx[p]!]!;
    x[j]! /= L.values[L.colPtr[j]!]!;
  }
  return x;
}

/** Solve A x = b by sparse Cholesky with the ordering perm (perm[new] = old). */
export function solveSpd(a: Csc, b: ArrayLike<number>, perm?: ArrayLike<number>): { x: Float64Array; factor: Factor } {
  const p = perm ?? Int32Array.from({ length: a.n }, (_, i) => i);
  const f = cholesky(permute(a, p));
  const bp = Float64Array.from({ length: a.n }, (_, k) => b[p[k]!]!);
  const yp = solveFactor(f, bp);
  const x = new Float64Array(a.n);
  for (let k = 0; k < a.n; k++) x[p[k]!] = yp[k]!;
  return { x, factor: f };
}

/** Adjacency (off-diagonal pattern) of a symmetric matrix, as neighbour sets. */
export function adjacency(a: Csc): Set<number>[] {
  const adj: Set<number>[] = Array.from({ length: a.n }, () => new Set());
  for (let j = 0; j < a.n; j++)
    for (let p = a.colPtr[j]!; p < a.colPtr[j + 1]!; p++) {
      const i = a.rowIdx[p]!;
      if (i !== j) {
        adj[i]!.add(j);
        adj[j]!.add(i);
      }
    }
  return adj;
}

/**
 * Minimum-degree ordering of a graph given as neighbour sets: repeatedly eliminate a node of smallest
 * current degree (ties: smallest index), connecting its neighbours into a clique. Returns perm[new] = old.
 */
export function minimumDegree(adjIn: readonly Set<number>[]): Int32Array {
  const n = adjIn.length;
  const adj = adjIn.map((s) => new Set(s));
  const alive = new Uint8Array(n).fill(1);
  const perm = new Int32Array(n);
  for (let step = 0; step < n; step++) {
    let best = -1;
    let bestDeg = Infinity;
    for (let v = 0; v < n; v++) if (alive[v] && adj[v]!.size < bestDeg) [best, bestDeg] = [v, adj[v]!.size];
    perm[step] = best;
    alive[best] = 0;
    const nb = [...adj[best]!];
    for (const u of nb) {
      adj[u]!.delete(best);
      for (const w of nb) if (w !== u) adj[u]!.add(w);
    }
    adj[best]!.clear();
  }
  return perm;
}

/**
 * Block version: order variables (each a block of `dims[v]` scalars) by minimum degree on the variable
 * graph, then expand to a scalar permutation. Orders whole variables, as real solvers do.
 */
export function blockOrdering(
  varAdj: readonly Set<number>[],
  dims: readonly number[],
): { varPerm: Int32Array; perm: Int32Array } {
  const varPerm = minimumDegree(varAdj);
  const offset = new Int32Array(dims.length + 1);
  for (let v = 0; v < dims.length; v++) offset[v + 1] = offset[v]! + dims[v]!;
  const perm = new Int32Array(offset[dims.length]!);
  let k = 0;
  for (const v of varPerm) for (let d = 0; d < dims[v]!; d++) perm[k++] = offset[v]! + d;
  return { varPerm, perm };
}

/** Number of nonzeros of the Cholesky factor (including the diagonal) of A under an ordering, without the numbers. */
export function factorNnz(a: Csc, perm?: ArrayLike<number>): number {
  const b = perm ? permute(a, perm) : a;
  const parent = etree(b);
  const mark = new Int32Array(b.n).fill(-1);
  let count = b.n;
  for (let k = 0; k < b.n; k++) count += ereach(b, k, parent, mark).length;
  return count;
}

/** Nonzero pattern of the Cholesky factor (lower triangle, with the diagonal) under an ordering, as (row, col). */
export function factorPattern(a: Csc, perm?: ArrayLike<number>): [number, number][] {
  const b = perm ? permute(a, perm) : a;
  const parent = etree(b);
  const mark = new Int32Array(b.n).fill(-1);
  const out: [number, number][] = [];
  for (let k = 0; k < b.n; k++) {
    out.push([k, k]);
    for (const j of ereach(b, k, parent, mark)) out.push([k, j]);
  }
  return out;
}

/**
 * Reverse Cuthill–McKee ordering: breadth-first search from a node of smallest degree, visiting neighbours in
 * order of increasing degree, then reversed. It keeps the nonzeros near the diagonal (small bandwidth), so the
 * factor's fill stays inside the band. Restarts for each connected component.
 */
export function reverseCuthillMcKee(adj: readonly Set<number>[]): Int32Array {
  const n = adj.length;
  const seen = new Uint8Array(n);
  const order: number[] = [];
  const byDegree = Array.from({ length: n }, (_, i) => i).sort((a, b) => adj[a]!.size - adj[b]!.size || a - b);
  for (const start of byDegree) {
    if (seen[start]) continue;
    seen[start] = 1;
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      const v = queue[q]!;
      order.push(v);
      const nb = [...adj[v]!].filter((u) => !seen[u]).sort((a, b) => adj[a]!.size - adj[b]!.size || a - b);
      for (const u of nb) {
        seen[u] = 1;
        queue.push(u);
      }
    }
  }
  return Int32Array.from(order.reverse());
}
