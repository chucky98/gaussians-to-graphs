/**
 * Coefficient functions that appear in the closed forms of Exp, Log and the Jacobians of SO(2), SE(2),
 * SO(3) and SE(3). Each has a removable singularity at θ = 0, where the direct formula loses its digits
 * to cancellation, so below θ = 0.2 we use its Taylor series in θ² up to θ⁸ (truncation error < 1e-16
 * relative there; just above the switch the direct formulas are still good to about 1e-11).
 */

const SMALL = 0.2;

/** c₀ + c₁ s + c₂ s² + … by Horner's rule. */
function poly(s: number, c: readonly number[]): number {
  let r = 0;
  for (let i = c.length - 1; i >= 0; i--) r = r * s + c[i]!;
  return r;
}

const SINC = [1, -1 / 6, 1 / 120, -1 / 5040, 1 / 362880];
const COSC = [1 / 2, -1 / 24, 1 / 720, -1 / 40320, 1 / 3628800];
const SINC3 = [1 / 6, -1 / 120, 1 / 5040, -1 / 362880, 1 / 39916800];
const JINV = [1 / 12, 1 / 720, 1 / 30240, 1 / 1209600, 1 / 47900160];
const QB = [1 / 24, -1 / 720, 1 / 40320, -1 / 3628800, 1 / 479001600];
const QC = [1 / 120, -1 / 2520, 1 / 120960, -1 / 9979200, 1 / 1245404160];

/** sin θ / θ */
export function sinc(t: number): number {
  return Math.abs(t) < SMALL ? poly(t * t, SINC) : Math.sin(t) / t;
}

/** (1 − cos θ) / θ² */
export function cosc(t: number): number {
  return Math.abs(t) < SMALL ? poly(t * t, COSC) : (1 - Math.cos(t)) / (t * t);
}

/** (θ − sin θ) / θ³ */
export function sinc3(t: number): number {
  return Math.abs(t) < SMALL ? poly(t * t, SINC3) : (t - Math.sin(t)) / (t * t * t);
}

/** 1/θ² − (1 + cos θ) / (2 θ sin θ), the coefficient of [φ]×² in the inverse SO(3) Jacobians. */
export function jinvCoeff(t: number): number {
  return Math.abs(t) < SMALL ? poly(t * t, JINV) : 1 / (t * t) - (1 + Math.cos(t)) / (2 * t * Math.sin(t));
}

/** (θ² + 2 cos θ − 2) / (2 θ⁴), used in the SE(3) Jacobian block Q. */
export function qCoeffB(t: number): number {
  const t2 = t * t;
  return Math.abs(t) < SMALL ? poly(t2, QB) : (t2 + 2 * Math.cos(t) - 2) / (2 * t2 * t2);
}

/** (2θ − 3 sin θ + θ cos θ) / (2 θ⁵), used in the SE(3) Jacobian block Q. */
export function qCoeffC(t: number): number {
  const t2 = t * t;
  return Math.abs(t) < SMALL ? poly(t2, QC) : (2 * t - 3 * Math.sin(t) + t * Math.cos(t)) / (2 * t2 * t2 * t);
}
