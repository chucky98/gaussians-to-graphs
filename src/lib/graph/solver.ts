/**
 * Dense nonlinear least squares (post 09): Gauss–Newton and Levenberg–Marquardt for vector unknowns.
 * Cost c(x) = ½ Σᵢ wᵢ rᵢ(x)² with diagonal weights (information) wᵢ. Phase 4 extends this to
 * manifolds and sparse systems.
 *
 * Each iteration linearizes r(x + δ) ≈ r + Jδ and solves the normal equations
 *   Gauss–Newton:        Λ δ = η,                    Λ = JᵀWJ, η = −JᵀWr
 *   Levenberg–Marquardt: (Λ + λ diag(Λ)) δ = η      (Marquardt's scaled damping)
 */
import { cholesky, solveCholesky, zeros, type Mat, type Vec } from '../math/matrix';

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
