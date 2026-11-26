/**
 * Planar motion models (post 14). A pose is the vector [x, y, θ].
 *
 * Velocity (unicycle) model: drive with constant speed v and turn rate ω for dt. The exact path is a
 * circular arc of radius v/ω (a straight line when ω = 0). Noise enters through the controls: v̂ = v + δv, ω̂ = ω + δω.
 *
 * Odometry model ("rotate, translate, rotate"): the wheel encoders report the motion between two poses
 * as a first rotation δrot1, a translation δtrans and a second rotation δrot2.
 *
 * Each model provides F = ∂f/∂x (3×3) and V = ∂f/∂u, so that control noise with covariance M becomes
 * state-space noise V M Vᵀ to first order.
 */
import { fromArrays, vec, type Mat, type Vec } from '../math/matrix';
import { wrapAngle } from '../geometry/so2';

export interface VelocityControl {
  v: number;
  w: number;
}

/** sin(h)/h and its derivative, with series near h = 0 for full precision. */
function sinc(h: number): number {
  return Math.abs(h) < 1e-4 ? 1 - (h * h) / 6 + (h * h * h * h) / 120 : Math.sin(h) / h;
}
function dsinc(h: number): number {
  return Math.abs(h) < 1e-3 ? -h / 3 + (h * h * h) / 30 : (h * Math.cos(h) - Math.sin(h)) / (h * h);
}

/**
 * Exact arc: with h = ω dt / 2, the chord has length v dt · sinc(h) and points along θ + h. This form
 * (sin(θ + 2h) − sin θ = 2 cos(θ + h) sin h) is the same as the textbook (v/ω)(sin(θ + ω dt) − sin θ)
 * but stays accurate as ω → 0, where it becomes a straight line.
 */
export function velocityMotion(p: Vec, u: VelocityControl, dt: number): Vec {
  const h = (u.w * dt) / 2;
  const d = u.v * dt * sinc(h);
  const a = p[2]! + h;
  return vec([p[0]! + d * Math.cos(a), p[1]! + d * Math.sin(a), wrapAngle(p[2]! + u.w * dt)]);
}

/** ∂f/∂x of the velocity model (3 × 3). */
export function velocityJacobianState(p: Vec, u: VelocityControl, dt: number): Mat {
  const h = (u.w * dt) / 2;
  const d = u.v * dt * sinc(h);
  const a = p[2]! + h;
  return fromArrays([
    [1, 0, -d * Math.sin(a)],
    [0, 1, d * Math.cos(a)],
    [0, 0, 1],
  ]);
}

/** ∂f/∂(v, ω) of the velocity model (3 × 2). */
export function velocityJacobianControl(p: Vec, u: VelocityControl, dt: number): Mat {
  const h = (u.w * dt) / 2;
  const s = sinc(h);
  const a = p[2]! + h;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  // d/dω of v dt s(h) (cos a, sin a), with dh/dω = da/dω = dt/2.
  const k = (u.v * dt * dt) / 2;
  return fromArrays([
    [dt * s * c, k * (dsinc(h) * c - s * sn)],
    [dt * s * sn, k * (dsinc(h) * sn + s * c)],
    [0, dt],
  ]);
}

export interface OdometryControl {
  rot1: number;
  trans: number;
  rot2: number;
}

export function odometryMotion(p: Vec, u: OdometryControl): Vec {
  const a = p[2]! + u.rot1;
  return vec([p[0]! + u.trans * Math.cos(a), p[1]! + u.trans * Math.sin(a), wrapAngle(p[2]! + u.rot1 + u.rot2)]);
}

/** The odometry reading that takes pose a to pose b (Thrun et al., §5.4). */
export function odometryBetween(a: Vec, b: Vec): OdometryControl {
  const dx = b[0]! - a[0]!;
  const dy = b[1]! - a[1]!;
  const trans = Math.hypot(dx, dy);
  const rot1 = trans < 1e-12 ? 0 : wrapAngle(Math.atan2(dy, dx) - a[2]!);
  return { rot1, trans, rot2: wrapAngle(b[2]! - a[2]! - rot1) };
}

export function odometryJacobianState(p: Vec, u: OdometryControl): Mat {
  const a = p[2]! + u.rot1;
  return fromArrays([
    [1, 0, -u.trans * Math.sin(a)],
    [0, 1, u.trans * Math.cos(a)],
    [0, 0, 1],
  ]);
}

/** ∂f/∂(δrot1, δtrans, δrot2) of the odometry model (3 × 3). */
export function odometryJacobianControl(p: Vec, u: OdometryControl): Mat {
  const a = p[2]! + u.rot1;
  return fromArrays([
    [-u.trans * Math.sin(a), Math.cos(a), 0],
    [u.trans * Math.cos(a), Math.sin(a), 0],
    [1, 0, 1],
  ]);
}
