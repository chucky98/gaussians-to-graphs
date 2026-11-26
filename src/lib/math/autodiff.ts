/** Numerical differentiation (DESIGN §5.1). Used in tests to check analytic Jacobians, and as a fallback. */
import { zeros, type Mat, type Vec } from './matrix';

/**
 * Central-difference Jacobian of f at x: J[i][j] ≈ (f_i(x + h e_j) − f_i(x − h e_j)) / 2h.
 * The step is scaled per component: h·max(1, |x_j|).
 */
export function numericJacobian(f: (x: Vec) => Vec, x: Vec, h = 1e-6): Mat {
  const fx = f(x);
  const J = zeros(fx.length, x.length);
  for (let j = 0; j < x.length; j++) {
    const step = h * Math.max(1, Math.abs(x[j]!));
    const xp = x.slice();
    const xm = x.slice();
    xp[j]! += step;
    xm[j]! -= step;
    const fp = f(xp);
    const fm = f(xm);
    for (let i = 0; i < fx.length; i++) J.data[i * x.length + j] = (fp[i]! - fm[i]!) / (2 * step);
  }
  return J;
}
