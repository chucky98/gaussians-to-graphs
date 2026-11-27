/**
 * The pure models behind Post 21's widgets: TangentSpace (SO(2): a tangent vector at a point of the unit
 * circle, wrapped onto the circle by Exp) and SE2Exp (the constant-twist arc Exp(τ) on SE(2), compared
 * with N straight-then-turn steps and with naive component-wise addition).
 */
import { oplus, ominus, scaleVec } from '../geometry/lie';
import * as se2 from '../geometry/se2';
import { SO2, wrapAngle } from '../geometry/so2';

export type P2 = [number, number];

// ---------------------------------------------------------------- TangentSpace (SO(2))

export const TANGENT = {
  /** Base point X as an angle (degrees) and the default tangent vector τ (radians). */
  defaults: { xDeg: 30, tau: 1.2 },
  tauRange: [-6, 6] as [number, number],
} as const;

export interface TangentState {
  /** X on the unit circle. */
  x: P2;
  /** Unit tangent direction at X (counter-clockwise). */
  dir: P2;
  /** The tip of the tangent vector, X + τ · dir, off the circle. */
  tip: P2;
  /** Angle of X ⊕ τ, wrapped to (−π, π]. */
  exactAngle: number;
  exact: P2;
  /** Stepping along the tangent line and then normalizing back onto the circle: the angle actually turned. */
  projectedTurn: number;
  projected: P2;
  /** Distance of the tangent tip from the circle: √(1 + τ²) − 1. */
  offCircle: number;
  /** (X ⊕ τ) ⊖ X: equals τ only while |τ| ≤ π. */
  back: number;
}

const onCircle = (a: number): P2 => [Math.cos(a), Math.sin(a)];

export function tangentState(xDeg: number, tau: number): TangentState {
  const a = wrapAngle((xDeg * Math.PI) / 180);
  const x = onCircle(a);
  const dir: P2 = [-x[1], x[0]];
  const tip: P2 = [x[0] + tau * dir[0], x[1] + tau * dir[1]];
  const X = SO2.exp(Float64Array.of(a));
  const Y = oplus(SO2, X, Float64Array.of(tau));
  const proj = Math.atan(tau); // the normalized tip lies at angle atan(τ) from X
  return {
    x,
    dir,
    tip,
    exactAngle: Y,
    exact: onCircle(Y),
    projectedTurn: proj,
    projected: onCircle(a + proj),
    offCircle: Math.hypot(1, tau) - 1,
    back: ominus(SO2, Y, X)[0]!,
  };
}

/** Points along the circle from angle a, turning by `turn` radians (for drawing the arc). */
export function arcPoints(a: number, turn: number, n = 64): P2[] {
  return Array.from({ length: n + 1 }, (_, i) => onCircle(a + (turn * i) / n));
}

// ---------------------------------------------------------------- SE2Exp

export interface Twist {
  /** Body-frame velocity forward and to the left (m per unit time) and turn rate (rad per unit time). */
  rho1: number;
  rho2: number;
  theta: number;
}

export const SE2EXP = {
  defaults: { rho1: 2, rho2: 0, theta: 1.5, headingDeg: 0, steps: 4 },
  /** Choices for N, the number of straight-then-turn steps. */
  stepChoices: [1, 2, 4, 8, 16, 64] as const,
} as const;

const tauOf = (t: Twist) => Float64Array.of(t.rho1, t.rho2, t.theta);
export const startPose = (headingDeg: number): se2.Pose2 => se2.pose(0, 0, (headingDeg * Math.PI) / 180);

/** X ⊕ τ: drive with the constant twist τ for unit time, starting at X. */
export function expEnd(X: se2.Pose2, t: Twist): se2.Pose2 {
  return oplus(se2.SE2, X, tauOf(t));
}

/** The arc X ⊕ sτ for s from 0 to 1. */
export function expArc(X: se2.Pose2, t: Twist, n = 64): se2.Pose2[] {
  return Array.from({ length: n + 1 }, (_, i) => oplus(se2.SE2, X, scaleVec(tauOf(t), i / n)));
}

/**
 * N steps, each "drive straight by ρ/N, then turn by θ/N" (the pose (ρ₁/N, ρ₂/N, θ/N) composed N times).
 * N = 1 is a single straight drive followed by a turn; as N grows the polygon tends to the arc Exp(τ).
 */
export function steps(X: se2.Pose2, t: Twist, N: number): se2.Pose2[] {
  const step = se2.pose(t.rho1 / N, t.rho2 / N, t.theta / N);
  const out = [X];
  for (let i = 0; i < N; i++) out.push(se2.compose(out[i]!, step));
  return out;
}

/** Naive addition of the numbers: (x + ρ₁, y + ρ₂, θ + θ_τ), as if a pose were a vector in ℝ³. */
export function naiveSum(X: se2.Pose2, t: Twist): se2.Pose2 {
  return se2.pose(X.x + t.rho1, X.y + t.rho2, X.theta + t.theta);
}

/**
 * Log for a dragged end point: keep the turn θ and find the body-frame velocity ρ whose arc ends at the
 * world point p, i.e. ρ = V(θ)⁻¹ C(θ_X)ᵀ (p − t_X). Valid for |θ| < π.
 */
export function twistTo(X: se2.Pose2, p: P2, theta: number): Twist {
  const tau = se2.log(se2.between(X, { x: p[0], y: p[1], theta: X.theta + theta }));
  return { rho1: tau[0]!, rho2: tau[1]!, theta };
}

export function poseDistance(a: se2.Pose2, b: se2.Pose2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Radius of the arc: |ρ| / |θ| (infinite for a straight line). */
export function arcRadius(t: Twist): number {
  return Math.abs(t.theta) < 1e-12 ? Infinity : Math.hypot(t.rho1, t.rho2) / Math.abs(t.theta);
}
