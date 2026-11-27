/**
 * Synthetic "Manhattan world" pose graphs (DESIGN §5.1, Post 27), in the spirit of Olson's synthetic datasets:
 * a robot drives on a grid of 1 m blocks, turning left or right at random intersections, and its odometry
 * measures each move with noise. Whenever it returns to a grid point it has visited long ago, it may
 * recognize the place, which adds a loop-closure measurement. The initial guess is dead reckoning: the
 * noisy odometry composed from the start, which drifts far from the truth.
 */
import { oplus } from '../geometry/lie';
import * as se2 from '../geometry/se2';
import { diag, type Mat } from '../math/matrix';
import { createRng } from '../math/rng';

export interface ManhattanParams {
  poses: number;
  /** Half-width of the square world, in blocks. */
  extent: number;
  /** Probability of turning at an intersection. */
  turnProb: number;
  /** Odometry noise per move: position (m) and heading (rad), standard deviations. */
  sigmaXY: number;
  sigmaTheta: number;
  /** Probability that a revisit of a grid point (at least `minGap` poses later) is recognized. */
  loopProb: number;
  minGap: number;
  seed: number;
}

export interface Edge {
  i: number;
  j: number;
  /** Measured relative pose of j in i's frame. */
  z: se2.Pose2;
}

export interface PoseGraphData {
  truth: se2.Pose2[];
  odometry: Edge[];
  loops: Edge[];
  /** Information matrix of every edge (the inverse of the simulated noise covariance). */
  information: Mat;
  /** Dead-reckoning initial guess. */
  initial: se2.Pose2[];
}

export const MANHATTAN_DEFAULTS: ManhattanParams = {
  poses: 1000,
  extent: 8,
  turnProb: 0.3,
  sigmaXY: 0.05,
  sigmaTheta: 0.02,
  loopProb: 0.5,
  minGap: 20,
  seed: 3,
};

export function manhattan(p: ManhattanParams): PoseGraphData {
  const rng = createRng(p.seed);
  const noise = () => Float64Array.of(p.sigmaXY * rng.normal(), p.sigmaXY * rng.normal(), p.sigmaTheta * rng.normal());
  const truth: se2.Pose2[] = [se2.pose(0, 0, 0)];
  const visits = new Map<string, number[]>([['0,0', [0]]]);
  const odometry: Edge[] = [];
  const loops: Edge[] = [];
  let [gx, gy, dir] = [0, 0, 0]; // grid position and heading in quarter turns
  for (let k = 1; k < p.poses; k++) {
    let turn = rng.uniform() < p.turnProb ? (rng.uniform() < 0.5 ? 1 : -1) : 0;
    // Stay inside the world: turn (or turn around) if the next block would leave it.
    const ahead = (d: number) => [gx + [1, 0, -1, 0][(d + 4) % 4]!, gy + [0, 1, 0, -1][(d + 4) % 4]!] as const;
    for (const t of [turn, 1, -1, 2]) {
      const [nx, ny] = ahead(dir + t);
      if (Math.abs(nx) <= p.extent && Math.abs(ny) <= p.extent) {
        turn = t;
        break;
      }
    }
    dir = (dir + turn + 4) % 4;
    [gx, gy] = ahead(dir);
    const T = se2.pose(gx, gy, (dir * Math.PI) / 2);
    const prev = truth[k - 1]!;
    truth.push(T);
    odometry.push({ i: k - 1, j: k, z: oplus(se2.SE2, se2.between(prev, T), noise()) });
    const key = `${gx},${gy}`;
    const earlier = visits.get(key) ?? [];
    const u = rng.uniform();
    const old = earlier.filter((i) => k - i >= p.minGap);
    if (old.length && u < p.loopProb) {
      const i = old[Math.floor(rng.uniform() * old.length)]!;
      loops.push({ i, j: k, z: oplus(se2.SE2, se2.between(truth[i]!, T), noise()) });
    }
    earlier.push(k);
    visits.set(key, earlier);
  }
  const initial: se2.Pose2[] = [truth[0]!];
  for (const e of odometry) initial.push(se2.compose(initial[e.i]!, e.z));
  return {
    truth,
    odometry,
    loops,
    information: diag([1 / p.sigmaXY ** 2, 1 / p.sigmaXY ** 2, 1 / p.sigmaTheta ** 2]),
    initial,
  };
}
