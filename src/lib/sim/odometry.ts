/**
 * Odometry simulation and dead reckoning (DESIGN §5.1 `sim/`).
 *
 * Motion model ("move, then turn"): an odometry reading u_k = (d_k, Δθ_k) moves the robot
 * d_k forward along its current heading and then turns it by Δθ_k. As a relative pose this
 * is (d_k, 0, Δθ_k), so dead reckoning is x_k = x_{k−1} ∘ (d_k, 0, Δθ_k).
 *
 * Noise model (random-walk scaling): each reading is corrupted by independent Gaussian noise
 * with standard deviation p·√d_k on the distance (metres) and on the turn (radians). After
 * driving a total distance L the accumulated distance and heading errors therefore have
 * standard deviation p·√L, whatever the step size; p is "error per √metre".
 */
import { compose, pose, type Pose2 } from '../geometry/se2';
import { createRng } from '../math/rng';

export interface OdometryReading {
  /** Distance driven, metres (≥ 0). */
  d: number;
  /** Heading change after driving, radians. */
  dtheta: number;
}

/** Integrate odometry from a start pose. Returns K + 1 poses (start included). */
export function deadReckon(start: Pose2, readings: readonly OdometryReading[]): Pose2[] {
  const out: Pose2[] = [start];
  let cur = start;
  for (const u of readings) {
    cur = compose(cur, pose(u.d, 0, u.dtheta));
    out.push(cur);
  }
  return out;
}

/** Standard-normal draws for one run: 2 per reading (distance, turn). Deterministic in the seed. */
export function odometryNoiseDraws(seed: number, count: number): Float64Array {
  const rng = createRng(seed);
  return Float64Array.from({ length: 2 * count }, () => rng.normal());
}

/**
 * Corrupt true readings with noise level p using pre-drawn standard normals `z`
 * (common random numbers: the same z at a different p gives a smoothly scaled run).
 */
export function applyOdometryNoise(truth: readonly OdometryReading[], p: number, z: Float64Array): OdometryReading[] {
  if (z.length < 2 * truth.length) throw new RangeError('not enough noise draws');
  return truth.map((u, k) => {
    const s = p * Math.sqrt(u.d);
    return { d: u.d + s * z[2 * k]!, dtheta: u.dtheta + s * z[2 * k + 1]! };
  });
}

/** Distinct, deterministic seed for run `r` of an experiment seeded with `seed`. */
export function runSeed(seed: number, r: number): number {
  return (Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(r + 1, 0x85ebca6b)) >>> 0;
}
