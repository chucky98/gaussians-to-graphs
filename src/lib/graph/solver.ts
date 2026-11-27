/**
 * Nonlinear least squares. Dense Gauss–Newton and Levenberg–Marquardt for vector unknowns (post 09), with
 * cost c(x) = ½ Σᵢ wᵢ rᵢ(x)², and, below, sparse GN/LM for factor graphs on manifolds (Posts 26–32).
 *
 * Each iteration linearizes r(x + δ) ≈ r + Jδ and solves the normal equations
 *   Gauss–Newton:        Λ δ = η,                    Λ = JᵀWJ, η = −JᵀWr
 *   Levenberg–Marquardt: (Λ + λ diag(Λ)) δ = η      (Marquardt's scaled damping)
 */
import { cholesky, solveCholesky, zeros, type Mat, type Vec } from '../math/matrix';
import { addTriplet, blockOrdering, solveSpd, toCsc, triplets, type Csc } from './sparse';
import type { Factor } from './factors';
import { ordering as makeOrdering, retract, type Ordering, type Values } from './values';

export interface LsqProblem {
  /** Residual vector r(x). */
  residual(x: Vec): Vec;
  /** Jacobian ∂r/∂x (m × n). */
  jacobian(x: Vec): Mat;
  /** Per-residual weights wᵢ (information); default 1. */
  weights?: Vec;
}

export interface Iterate {
  x: Vec;
  cost: number;
  /** Damping used to compute the step that led here (LM only). */
  lambda?: number;
  /** Whether the step was accepted (LM rejects steps that increase the cost). */
  accepted: boolean;
}

export interface SolveOptions {
  maxIterations?: number;
  /** Stop when the step is smaller than this (absolute, in x units). */
  stepTolerance?: number;
  /** Stop when the relative cost decrease falls below this. */
  costTolerance?: number;
  /** Called after every iteration (for animation). */
  onIteration?: (it: Iterate, k: number) => void;
}

export function cost(p: LsqProblem, x: Vec): number {
  const r = p.residual(x);
  let c = 0;
  for (let i = 0; i < r.length; i++) c += (p.weights ? p.weights[i]! : 1) * r[i]! ** 2;
  return 0.5 * c;
}

/** Λ = JᵀWJ and η = −JᵀWr at x. */
export function normalSystem(p: LsqProblem, x: Vec): { Lambda: Mat; eta: Vec; r: Vec } {
  const r = p.residual(x);
  const J = p.jacobian(x);
  const m = J.rows;
  const n = J.cols;
  const Lambda = zeros(n, n);
  const eta = new Float64Array(n);
  for (let i = 0; i < m; i++) {
    const w = p.weights ? p.weights[i]! : 1;
    for (let a = 0; a < n; a++) {
      const ja = J.data[i * n + a]!;
      eta[a]! -= w * ja * r[i]!;
      for (let b = 0; b < n; b++) Lambda.data[a * n + b]! += w * ja * J.data[i * n + b]!;
    }
  }
  return { Lambda, eta, r };
}

function solveDamped(Lambda: Mat, eta: Vec, lambda: number): Vec | null {
  const n = Lambda.rows;
  const A = { rows: n, cols: n, data: Lambda.data.slice() };
  for (let i = 0; i < n; i++) A.data[i * n + i]! += lambda * Math.max(Lambda.data[i * n + i]!, 1e-12);
  try {
    return solveCholesky(cholesky(A), eta);
  } catch {
    return null; // singular (e.g. Gauss–Newton at a degenerate point)
  }
}

const norm = (v: Vec) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

/**
 * Gauss–Newton: take the full step of the linearized problem every time. Fast near a solution,
 * but it never checks whether a step helped, so it can overshoot or diverge from a poor start.
 * Returns the iterates, starting with x₀.
 */
export function gaussNewton(p: LsqProblem, x0: Vec, opts: SolveOptions = {}): Iterate[] {
  const { maxIterations = 20, stepTolerance = 1e-9, costTolerance = 1e-12 } = opts;
  let x = x0.slice();
  let c = cost(p, x);
  const out: Iterate[] = [{ x, cost: c, accepted: true }];
  for (let k = 1; k <= maxIterations; k++) {
    const { Lambda, eta } = normalSystem(p, x);
    const delta = solveDamped(Lambda, eta, 0);
    if (!delta) break;
    x = x.map((xi, i) => xi + delta[i]!);
    const cNew = cost(p, x);
    const it = { x, cost: cNew, accepted: true };
    out.push(it);
    opts.onIteration?.(it, k);
    if (!Number.isFinite(cNew)) break;
    const done = norm(delta) < stepTolerance || Math.abs(c - cNew) <= costTolerance * Math.max(c, 1e-300);
    c = cNew;
    if (done) break;
  }
  return out;
}

/**
 * Levenberg–Marquardt with Marquardt's scaled damping. A step that lowers the cost is accepted and
 * λ shrinks (×1/10, towards Gauss–Newton); a step that raises it is rejected and λ grows (×10,
 * towards short gradient-descent steps). Rejected trials are recorded with accepted = false, and
 * the iterate stays where it was.
 */
export function levenbergMarquardt(p: LsqProblem, x0: Vec, opts: SolveOptions & { lambda0?: number } = {}): Iterate[] {
  const { maxIterations = 20, stepTolerance = 1e-9, costTolerance = 1e-12, lambda0 = 1e-2 } = opts;
  let x = x0.slice();
  let c = cost(p, x);
  let lambda = lambda0;
  const out: Iterate[] = [{ x, cost: c, accepted: true, lambda }];
  for (let k = 1; k <= maxIterations; k++) {
    const { Lambda, eta } = normalSystem(p, x);
    const delta = solveDamped(Lambda, eta, lambda);
    if (!delta) {
      lambda *= 10;
      continue;
    }
    const xTry = x.map((xi, i) => xi + delta[i]!);
    const cTry = cost(p, xTry);
    if (Number.isFinite(cTry) && cTry < c) {
      const done = norm(delta) < stepTolerance || c - cTry <= costTolerance * Math.max(c, 1e-300);
      x = xTry;
      c = cTry;
      const it = { x, cost: c, accepted: true, lambda };
      out.push(it);
      opts.onIteration?.(it, k);
      lambda = Math.max(lambda / 10, 1e-12);
      if (done) break;
    } else {
      const it = { x, cost: c, accepted: false, lambda };
      out.push(it);
      opts.onIteration?.(it, k);
      lambda = Math.min(lambda * 10, 1e12);
      if (norm(delta) < stepTolerance) break;
    }
  }
  return out;
}

// ================================================================ factor graphs on manifolds (Posts 26–32)

/** Total cost c(X) = ½ Σᵢ rᵢᵀ Ωᵢ rᵢ, or Σᵢ ρ(rᵢᵀ Ωᵢ rᵢ) with a robust kernel (Post 29). */
export function graphCost(factors: readonly Factor[], v: Values, rho?: (f: Factor, chi2: number) => number): number {
  let c = 0;
  for (const f of factors) {
    const r = f.residual(v);
    let q = 0;
    for (let i = 0; i < f.dim; i++)
      for (let j = 0; j < f.dim; j++) q += r[i]! * f.information.data[i * f.dim + j]! * r[j]!;
    c += rho ? rho(f, q) : 0.5 * q;
  }
  return c;
}

export interface LinearSystem {
  ord: Ordering;
  /** Λ = Σ Jᵀ W Ω J (full symmetric, sparse) and η = −Σ Jᵀ W Ω r. */
  Lambda: Csc;
  eta: Float64Array;
  /** Variable adjacency (which variables share a factor). */
  varAdj: Set<number>[];
}

/** Linearize every factor at v and assemble the sparse Gauss–Newton system. */
export function linearizeGraph(
  factors: readonly Factor[],
  v: Values,
  ord: Ordering,
  weight?: (f: Factor, chi2: number) => number,
): LinearSystem {
  const t = triplets(ord.dim);
  const eta = new Float64Array(ord.dim);
  const varAdj: Set<number>[] = ord.keys.map(() => new Set());
  for (const f of factors) {
    const { r, J } = f.linearize(v);
    const d = f.dim;
    const W = f.information.data;
    let w = 1;
    if (weight) {
      let q = 0;
      for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) q += r[i]! * W[i * d + j]! * r[j]!;
      w = weight(f, q);
    }
    const idx = f.keys.map((k) => ord.index.get(k)!);
    // ΩJ for each block, and Ω r.
    const OJ = J.map((Jb) => {
      const out = new Float64Array(d * Jb.cols);
      for (let i = 0; i < d; i++)
        for (let c = 0; c < Jb.cols; c++) {
          let s = 0;
          for (let k = 0; k < d; k++) s += W[i * d + k]! * Jb.data[k * Jb.cols + c]!;
          out[i * Jb.cols + c] = w * s;
        }
      return out;
    });
    for (let a = 0; a < J.length; a++) {
      const Ja = J[a]!;
      const oa = ord.offset[idx[a]!]!;
      for (let c = 0; c < Ja.cols; c++) {
        let s = 0;
        for (let i = 0; i < d; i++) s += OJ[a]![i * Ja.cols + c]! * r[i]!;
        eta[oa + c]! -= s;
      }
      for (let b = 0; b < J.length; b++) {
        const Jb = J[b]!;
        const ob = ord.offset[idx[b]!]!;
        if (a !== b) varAdj[idx[a]!]!.add(idx[b]!);
        for (let ra = 0; ra < Ja.cols; ra++)
          for (let cb = 0; cb < Jb.cols; cb++) {
            let s = 0;
            for (let i = 0; i < d; i++) s += Ja.data[i * Ja.cols + ra]! * OJ[b]![i * Jb.cols + cb]!;
            if (s !== 0) addTriplet(t, oa + ra, ob + cb, s);
          }
      }
    }
  }
  return { ord, Lambda: toCsc(t), eta, varAdj };
}

export interface GraphIterate {
  values: Values;
  cost: number;
  lambda?: number;
  accepted: boolean;
  /** Infinity norm of the step. */
  step: number;
}

export interface GraphSolveOptions {
  method?: 'gn' | 'lm';
  maxIterations?: number;
  lambda0?: number;
  /** Stop when the relative cost decrease falls below this. */
  costTolerance?: number;
  /** Stop when the largest step component falls below this. */
  stepTolerance?: number;
  /** Variable ordering for the sparse factorization. */
  ordering?: 'mindegree' | 'natural';
  /** IRLS weight wᵢ = ρ′(χ²ᵢ) and kernel cost ρ(χ²ᵢ) of a robust kernel (Post 29). */
  weight?: (f: Factor, chi2: number) => number;
  rho?: (f: Factor, chi2: number) => number;
  onIteration?: (it: GraphIterate, k: number) => void;
}

/** Add λ·diag(Λ) to the diagonal (Marquardt's scaled damping). */
function damp(a: Csc, lambda: number): Csc {
  const values = Float64Array.from(a.values);
  for (let j = 0; j < a.n; j++)
    for (let p = a.colPtr[j]!; p < a.colPtr[j + 1]!; p++)
      if (a.rowIdx[p] === j) values[p] = a.values[p]! * (1 + lambda) + 1e-12;
  return { ...a, values };
}

/**
 * Gauss–Newton or Levenberg–Marquardt on a factor graph. Each iteration linearizes all factors at the current
 * values, solves the sparse system Λ δ = η (with damping for LM) by sparse Cholesky under a minimum-degree
 * ordering of the variables, and retracts X ← X ⊕ δ. Returns every iterate, the initial one first.
 */
export function optimizeGraph(
  factors: readonly Factor[],
  initial: Values,
  opts: GraphSolveOptions = {},
): GraphIterate[] {
  const method = opts.method ?? 'gn';
  const maxIt = opts.maxIterations ?? 20;
  const ctol = opts.costTolerance ?? 1e-9;
  const stol = opts.stepTolerance ?? 1e-10;
  const ord = makeOrdering(initial);
  const costOf = (v: Values) => graphCost(factors, v, opts.rho);
  let v = initial;
  let c = costOf(v);
  let lambda = opts.lambda0 ?? 1e-4;
  const its: GraphIterate[] = [{ values: v, cost: c, accepted: true, step: 0, ...(method === 'lm' ? { lambda } : {}) }];
  opts.onIteration?.(its[0]!, 0);
  let perm: Int32Array | undefined;
  for (let k = 1; k <= maxIt; k++) {
    const sys = linearizeGraph(factors, v, ord, opts.weight);
    if (!perm)
      perm =
        opts.ordering === 'natural'
          ? Int32Array.from({ length: ord.dim }, (_, i) => i)
          : blockOrdering(sys.varAdj, ord.dims).perm;
    let accepted = false;
    let next = v;
    let nc = c;
    let step = 0;
    for (let attempt = 0; attempt < (method === 'lm' ? 12 : 1); attempt++) {
      const A = method === 'lm' ? damp(sys.Lambda, lambda) : sys.Lambda;
      const { x } = solveSpd(A, sys.eta, perm);
      step = x.reduce((m, e) => Math.max(m, Math.abs(e)), 0);
      next = retract(v, ord, x);
      nc = costOf(next);
      if (method === 'gn' || nc < c) {
        accepted = true;
        if (method === 'lm') lambda = Math.max(lambda / 10, 1e-12);
        break;
      }
      lambda *= 10;
    }
    if (accepted) v = next;
    const it: GraphIterate = {
      values: v,
      cost: accepted ? nc : c,
      accepted,
      step,
      ...(method === 'lm' ? { lambda } : {}),
    };
    its.push(it);
    opts.onIteration?.(it, k);
    const rel = (c - it.cost) / Math.max(c, 1e-300);
    c = it.cost;
    if (accepted && (step < stol || (rel >= 0 && rel < ctol))) break;
    if (!accepted) break;
  }
  return its;
}
