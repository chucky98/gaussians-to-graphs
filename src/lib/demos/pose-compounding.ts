/**
 * The pure model behind Post 22's PoseCompounding widget: a robot drives a chain of noisy relative motions;
 * Monte Carlo samples of its final pose are compared with two Gaussian summaries of the same first-order
 * propagation:
 *
 *  - Cartesian: a Gaussian over the numbers (x, y, θ), propagated with Jacobians in those coordinates
 *    (the classic compounding of Smith and Cheeseman), drawn as the 95% ellipse of (x, y);
 *  - tangent space: T = T̄ Exp(ξ) with ξ ~ N(0, P) in se(2), propagated with the adjoint
 *    (P ← Ad P Adᵀ + Q), drawn as the 95% region of its exact (x, y) marginal.
 *
 * Both start from the same noise model: each relative motion is Δ = Δ̄ ⊕ w, w ~ N(0, Q).
 */
import { composeCovariance } from '../geometry/lie';
import * as se2 from '../geometry/se2';
import { cosc, sinc } from '../geometry/series';
import { contourSegments, type GridField, type Segment } from '../math/contour';
import { diag, fromArrays, inverse, mul, transpose, add, zeros, type Mat } from '../math/matrix';
import { createRng } from '../math/rng';
import { chi2Quantile } from '../math/stats';

const RAD = Math.PI / 180;

export interface ChainParams {
  /** Number of relative motions. */
  steps: number;
  /** Nominal length of each motion (m). */
  stepLength: number;
  /** Nominal turn per motion (degrees). */
  turnDeg: number;
  /** Heading noise per motion (degrees, one standard deviation). */
  sigmaThetaDeg: number;
  /** Translation noise per motion, along and across (m). */
  sigmaXY: number;
}

export const POSES = {
  defaults: { steps: 10, stepLength: 1, turnDeg: 0, sigmaThetaDeg: 5, sigmaXY: 0.03 } satisfies ChainParams,
  samples: 2000,
  maxSteps: 20,
  seed: 4,
  grid: 64,
  thetaNodes: 40,
} as const;

/** Nominal relative motion Δ̄ and its noise covariance Q (in the tangent space of Δ̄). */
export function stepModel(p: ChainParams): { delta: se2.Pose2; Q: Mat } {
  const s = p.sigmaThetaDeg * RAD;
  return {
    delta: se2.pose(p.stepLength, 0, p.turnDeg * RAD),
    Q: diag([p.sigmaXY ** 2, p.sigmaXY ** 2, s * s]),
  };
}

/** The nominal path T̄₀ … T̄_K (the mean of both Gaussian summaries). */
export function nominalPath(p: ChainParams): se2.Pose2[] {
  const { delta } = stepModel(p);
  const out = [se2.identity];
  for (let k = 0; k < p.steps; k++) out.push(se2.compose(out[k]!, delta));
  return out;
}

/**
 * Standard-normal draws for every sample, step and component, from a fixed seed. Common random numbers:
 * changing a noise level rescales the same draws, so the cloud deforms smoothly instead of reshuffling.
 */
export function standardDraws(seed: number = POSES.seed, samples: number = POSES.samples): Float64Array {
  const rng = createRng(seed);
  const z = new Float64Array(samples * POSES.maxSteps * 3);
  for (let i = 0; i < z.length; i++) z[i] = rng.normal();
  return z;
}

/** Final poses of the Monte Carlo runs: T = Δ₁ Δ₂ ⋯ Δ_K with Δ = Δ̄ ⊕ w. */
export function sampleFinalPoses(p: ChainParams, z: Float64Array, samples: number = POSES.samples): se2.Pose2[] {
  const { delta } = stepModel(p);
  const [sx, st] = [p.sigmaXY, p.sigmaThetaDeg * RAD];
  const [dc, ds] = [Math.cos(delta.theta), Math.sin(delta.theta)];
  const out: se2.Pose2[] = [];
  for (let i = 0; i < samples; i++) {
    let [x, y, th] = [0, 0, 0];
    for (let k = 0; k < p.steps; k++) {
      const o = (i * POSES.maxSteps + k) * 3;
      // Δ = Δ̄ ∘ Exp(w), written out: Exp(w) = (V(w_θ) w_ρ, w_θ), then two compositions.
      const [w0, w1, wt] = [sx * z[o]!, sx * z[o + 1]!, st * z[o + 2]!];
      const a = sinc(wt);
      const b = wt * cosc(wt);
      const ex = a * w0 - b * w1;
      const ey = b * w0 + a * w1;
      const mx = delta.x + dc * ex - ds * ey;
      const my = delta.y + ds * ex + dc * ey;
      const [c, s] = [Math.cos(th), Math.sin(th)];
      x += c * mx - s * my;
      y += s * mx + c * my;
      th += delta.theta + wt;
    }
    out.push(se2.pose(x, y, th));
  }
  return out;
}

/** Tangent-space propagation: P_k = Ad_{Δ̄⁻¹} P_{k−1} Ad_{Δ̄⁻¹}ᵀ + Q. Returns the mean and P_K (in se(2)). */
export function tangentPropagation(p: ChainParams): { mean: se2.Pose2; P: Mat } {
  const { delta, Q } = stepModel(p);
  let P = zeros(3, 3);
  let mean: se2.Pose2 = se2.identity;
  for (let k = 0; k < p.steps; k++) {
    P = composeCovariance(se2.SE2, delta, P, Q);
    mean = se2.compose(mean, delta);
  }
  return { mean, P };
}

/**
 * Cartesian propagation: treat (x, y, θ) as a vector and linearize x_k = x_{k−1} ∘ Δ about the nominal path:
 * P_k = F P_{k−1} Fᵀ + G Q Gᵀ, with F = ∂(x ∘ Δ)/∂x and G = ∂(x ∘ Δ)/∂Δ in those coordinates.
 */
export function cartesianPropagation(p: ChainParams): { mean: se2.Pose2; P: Mat } {
  const { delta, Q } = stepModel(p);
  let P = zeros(3, 3);
  let x: se2.Pose2 = se2.identity;
  for (let k = 0; k < p.steps; k++) {
    const [c, s] = [Math.cos(x.theta), Math.sin(x.theta)];
    const F = fromArrays([
      [1, 0, -s * delta.x - c * delta.y],
      [0, 1, c * delta.x - s * delta.y],
      [0, 0, 1],
    ]);
    const G = fromArrays([
      [c, -s, 0],
      [s, c, 0],
      [0, 0, 1],
    ]);
    P = add(mul(mul(F, P), transpose(F)), mul(mul(G, Q), transpose(G)));
    x = se2.compose(x, delta);
  }
  return { mean: x, P };
}

/**
 * Density, with respect to dx dy, of the (x, y) marginal of T = T̄ Exp(ξ), ξ ~ N(0, P), at many points.
 * For each heading θ = θ̄ + φ, Log(T̄⁻¹ T) = (V(φ)⁻¹ u, φ) with u = C(θ̄)ᵀ (p − t̄), and the change of
 * variables from ξ to (x, y, θ) has Jacobian determinant 1/det J_r(ξ) = 1/(a² + b²) (a = sin φ/φ,
 * b = (1 − cos φ)/φ). The heading is integrated out with the trapezoidal rule over θ̄ ± 6σ_θ.
 */
export function tangentMarginalXY(
  mean: se2.Pose2,
  P: Mat,
  pts: ArrayLike<number>,
  nTheta: number = POSES.thetaNodes,
): Float64Array {
  const Pi = inverse(P, { spd: true });
  const [i00, i01, i02, i11, i12, i22] = [Pi.data[0]!, Pi.data[1]!, Pi.data[2]!, Pi.data[4]!, Pi.data[5]!, Pi.data[8]!];
  const det =
    P.data[0]! * (P.data[4]! * P.data[8]! - P.data[5]! * P.data[7]!) -
    P.data[1]! * (P.data[3]! * P.data[8]! - P.data[5]! * P.data[6]!) +
    P.data[2]! * (P.data[3]! * P.data[7]! - P.data[4]! * P.data[6]!);
  const norm = 1 / Math.sqrt((2 * Math.PI) ** 3 * det);
  const half = 6 * Math.sqrt(P.data[8]!);
  const h = (2 * half) / (nTheta - 1);
  // Per heading node: V(φ)⁻¹ entries, the density factor and the trapezoid weight.
  const nodes = Array.from({ length: nTheta }, (_, j) => {
    const phi = -half + j * h;
    const a = sinc(phi);
    const b = phi * cosc(phi);
    const d = a * a + b * b;
    return { phi, a: a / d, b: b / d, w: (j === 0 || j === nTheta - 1 ? 0.5 : 1) * h * (norm / d) };
  });
  const [c, s] = [Math.cos(mean.theta), Math.sin(mean.theta)];
  const n = pts.length / 2;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const dx = pts[2 * i]! - mean.x;
    const dy = pts[2 * i + 1]! - mean.y;
    const u0 = c * dx + s * dy;
    const u1 = -s * dx + c * dy;
    let acc = 0;
    for (const nd of nodes) {
      const r0 = nd.a * u0 + nd.b * u1;
      const r1 = -nd.b * u0 + nd.a * u1;
      const f = nd.phi;
      const m = i00 * r0 * r0 + i11 * r1 * r1 + i22 * f * f + 2 * (i01 * r0 * r1 + i02 * r0 * f + i12 * r1 * f);
      acc += nd.w * Math.exp(-0.5 * m);
    }
    out[i] = acc;
  }
  return out;
}

export interface Region95 {
  field: GridField;
  /** Density level whose superlevel set holds 95% of the probability. */
  level: number;
  segments: Segment[];
  /** Probability mass captured by the grid (should be ≈ 1). */
  gridMass: number;
}

/** The 95% highest-density region of the tangent model's (x, y) marginal, on a grid over a box. */
export function tangentRegion95(
  mean: se2.Pose2,
  P: Mat,
  box: [number, number, number, number],
  n: number = POSES.grid,
): Region95 {
  const [x0, x1, y0, y1] = box;
  const pts = new Float64Array(n * n * 2);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      pts[2 * (j * n + i)] = x0 + ((x1 - x0) * i) / (n - 1);
      pts[2 * (j * n + i) + 1] = y0 + ((y1 - y0) * j) / (n - 1);
    }
  const values = tangentMarginalXY(mean, P, pts);
  const cell = ((x1 - x0) / (n - 1)) * ((y1 - y0) / (n - 1));
  const sorted = Float64Array.from(values).sort().reverse();
  let total = 0;
  for (const v of sorted) total += v * cell;
  let acc = 0;
  let level = 0;
  for (const v of sorted) {
    acc += v * cell;
    if (acc >= 0.95 * total) {
      level = v;
      break;
    }
  }
  const field: GridField = { values, nx: n, ny: n, x0, x1, y0, y1 };
  return { field, level, segments: contourSegments(field, level), gridMass: total };
}

/** A box around the samples, padded so the grid holds essentially all of the tangent model's mass. */
export function boxAround(poses: readonly se2.Pose2[], pad = 0.25): [number, number, number, number] {
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const p of poses) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const px = (x1 - x0) * pad + 0.05;
  const py = (y1 - y0) * pad + 0.05;
  return [x0 - px, x1 + px, y0 - py, y1 + py];
}

export interface Coverage {
  /** Fraction of samples inside the Cartesian 95% ellipse of (x, y). */
  cartesian: number;
  /** Fraction inside the tangent model's 95% region of (x, y). */
  tangent: number;
  /** Fraction whose ξ = Log(T̄⁻¹ T) lies inside the 95% ellipsoid of N(0, P) (all three dimensions). */
  tangent3: number;
}

export function coverage(
  poses: readonly se2.Pose2[],
  cart: { mean: se2.Pose2; P: Mat },
  tan: { mean: se2.Pose2; P: Mat },
  level: number,
): Coverage {
  const g2 = chi2Quantile(0.95, 2);
  const g3 = chi2Quantile(0.95, 3);
  const Cxy = inverse(
    fromArrays([
      [cart.P.data[0]!, cart.P.data[1]!],
      [cart.P.data[3]!, cart.P.data[4]!],
    ]),
  );
  const Pi = inverse(tan.P, { spd: true });
  let inC = 0;
  let in3 = 0;
  const pts = new Float64Array(poses.length * 2);
  poses.forEach((T, i) => {
    const dx = T.x - cart.mean.x;
    const dy = T.y - cart.mean.y;
    const m = Cxy.data[0]! * dx * dx + 2 * Cxy.data[1]! * dx * dy + Cxy.data[3]! * dy * dy;
    if (m <= g2) inC++;
    const xi = se2.log(se2.between(tan.mean, T));
    let q = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) q += xi[r]! * Pi.data[r * 3 + c]! * xi[c]!;
    if (q <= g3) in3++;
    pts[2 * i] = T.x;
    pts[2 * i + 1] = T.y;
  });
  const dens = tangentMarginalXY(tan.mean, tan.P, pts);
  let inT = 0;
  for (const d of dens) if (d >= level) inT++;
  const n = poses.length;
  return { cartesian: inC / n, tangent: inT / n, tangent3: in3 / n };
}

/** Standard deviation of the final heading under both models (they agree: degrees). */
export function headingSpreadDeg(P: Mat): number {
  return Math.sqrt(P.data[8]!) / RAD;
}
