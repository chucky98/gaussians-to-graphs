/**
 * Propagating a Gaussian through a function (post 04): first-order linearization vs Monte Carlo.
 */
import type { Gaussian } from './gaussian';
import { cholesky, mul, symmetrize, transpose, type Vec } from './matrix';
import { sampleCov } from './stats';
import type { VectorFunction } from '../models/nonlinear';

/** First-order (linearized) propagation: N(f(μ), J Σ Jᵀ) with J the Jacobian at μ. */
export function linearize(g: Gaussian, fn: VectorFunction): Gaussian {
  const J = fn.jacobian(g.mean);
  return { mean: fn.f(g.mean), cov: symmetrize(mul(mul(J, g.cov), transpose(J))) };
}

/**
 * Monte Carlo propagation from pre-drawn standard normals `z` (interleaved, inDim per sample):
 * x_i = μ + L z_i, y_i = f(x_i). Returns inputs, outputs, and the outputs' sample mean/covariance.
 */
export function monteCarlo(
  g: Gaussian,
  fn: VectorFunction,
  z: Float64Array,
): { inputs: Vec[]; outputs: Vec[]; fit: Gaussian } {
  const d = fn.inDim;
  if (g.mean.length !== d) throw new RangeError('input dimension mismatch');
  const L = cholesky(g.cov);
  const n = Math.floor(z.length / d);
  const inputs: Vec[] = [];
  const outputs: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const x = new Float64Array(d);
    for (let r = 0; r < d; r++) {
      let s = g.mean[r]!;
      for (let c = 0; c <= r; c++) s += L.data[r * d + c]! * z[i * d + c]!;
      x[r] = s;
    }
    inputs.push(x);
    outputs.push(fn.f(x));
  }
  const s = sampleCov(outputs);
  return { inputs, outputs, fit: { mean: s.mean, cov: s.cov } };
}
