/**
 * Robust kernels and graduated non-convexity (DESIGN §5.1, Post 29).
 *
 * A kernel ρ replaces the squared error of a factor: its cost becomes ½ ρ(s) with s = rᵀ Ω r, the squared
 * Mahalanobis error, instead of ½ s. Iteratively reweighted least squares (IRLS) minimizes this by solving a
 * weighted least-squares problem in which each factor's information is scaled by w = ρ′(s), recomputed
 * from the current residuals at every iteration. With k the kernel's scale (in units of √s):
 *
 *   L2              ρ(s) = s                                  w = 1
 *   Huber           ρ(s) = s if s ≤ k², else 2k√s − k²         w = 1 or k/√s
 *   Cauchy          ρ(s) = k² ln(1 + s/k²)                     w = 1 / (1 + s/k²)
 *   Geman–McClure   ρ(s) = k² s / (k² + s)                     w = k⁴ / (k² + s)²
 *
 * Graduated non-convexity (Yang, Antonante, Tzoumas, Carlone 2020) with Geman–McClure: replace k² by μk²,
 * start with μ large (the kernel is then almost quadratic, the problem almost convex), solve, and shrink μ
 * step by step to 1, so the non-convex kernel is approached from a good starting point.
 */
import type { Factor } from './factors';
import { optimizeGraph, type GraphIterate } from './solver';
import type { Values } from './values';

export type KernelName = 'l2' | 'huber' | 'cauchy' | 'gm';

export interface Kernel {
  name: KernelName;
  /** ρ(s). */
  rho: (s: number) => number;
  /** ρ′(s), the IRLS weight. */
  weight: (s: number) => number;
}

export function kernel(name: KernelName, k: number): Kernel {
  const k2 = k * k;
  switch (name) {
    case 'l2':
      return { name, rho: (s) => s, weight: () => 1 };
    case 'huber':
      return {
        name,
        rho: (s) => (s <= k2 ? s : 2 * k * Math.sqrt(s) - k2),
        weight: (s) => (s <= k2 ? 1 : k / Math.sqrt(s)),
      };
    case 'cauchy':
      return { name, rho: (s) => k2 * Math.log1p(s / k2), weight: (s) => 1 / (1 + s / k2) };
    case 'gm':
      return { name, rho: (s) => (k2 * s) / (k2 + s), weight: (s) => (k2 * k2) / (k2 + s) ** 2 };
  }
}

/** Solver hooks that apply a kernel to every factor accepted by `applies` (others stay quadratic). */
export function robustHooks(ker: Kernel, applies: (f: Factor) => boolean = () => true) {
  return {
    weight: (f: Factor, s: number) => (applies(f) ? ker.weight(s) : 1),
    rho: (f: Factor, s: number) => 0.5 * (applies(f) ? ker.rho(s) : s),
  };
}

export interface GncResult {
  /** Iterates of every stage, in order. */
  iterations: GraphIterate[];
  /** The μ of each stage. */
  mus: number[];
}

/**
 * GNC with the Geman–McClure kernel of scale k: stages with μ = μ₀, μ₀/f, …, 1; each stage runs a few
 * Gauss–Newton (IRLS) iterations from the previous stage's result.
 */
export function gnc(
  factors: readonly Factor[],
  initial: Values,
  k: number,
  applies: (f: Factor) => boolean,
  opts: { mu0?: number; factor?: number; itersPerStage?: number; onIteration?: (it: GraphIterate) => void } = {},
): GncResult {
  const f = opts.factor ?? 1.4;
  let mu = opts.mu0 ?? 1e4;
  const iterations: GraphIterate[] = [];
  const mus: number[] = [];
  let v = initial;
  for (;;) {
    const ker = kernel('gm', k * Math.sqrt(mu));
    const its = optimizeGraph(factors, v, {
      method: 'gn',
      maxIterations: opts.itersPerStage ?? 3,
      ...robustHooks(ker, applies),
    });
    for (const it of its.slice(iterations.length ? 1 : 0)) {
      iterations.push(it);
      mus.push(mu);
      opts.onIteration?.(it);
    }
    v = its.at(-1)!.values;
    if (mu <= 1) break;
    mu = Math.max(1, mu / f);
  }
  return { iterations, mus };
}
