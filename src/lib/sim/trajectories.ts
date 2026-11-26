/** Seeded/deterministic scenario generators (DESIGN §5.1 `sim/`). */
import { pose, type Pose2 } from '../geometry/se2';
import type { OdometryReading } from './odometry';

export interface StadiumOptions {
  /** Length of each straight, metres. */
  straight: number;
  /** Radius of the two semicircles, metres. */
  radius: number;
  /** Nominal step length, metres. */
  step: number;
  laps: number;
}

export const STADIUM_DEFAULTS: StadiumOptions = { straight: 8, radius: 3, step: 0.25, laps: 2 };

/**
 * A stadium-shaped loop driven counter-clockwise, as true odometry readings, plus the start
 * pose that centres it on the origin (start at the left end of the bottom straight, facing +x).
 * Semicircles are driven as equal "move, then turn" steps; one lap turns exactly 2π.
 */
export function stadiumLoop(opts: Partial<StadiumOptions> = {}): { start: Pose2; readings: OdometryReading[] } {
  const o = { ...STADIUM_DEFAULTS, ...opts };
  const nStraight = Math.max(1, Math.round(o.straight / o.step));
  const arc = Math.PI * o.radius;
  const nArc = Math.max(2, Math.round(arc / o.step));
  const straight: OdometryReading[] = Array.from({ length: nStraight }, () => ({
    d: o.straight / nStraight,
    dtheta: 0,
  }));
  const turn: OdometryReading[] = Array.from({ length: nArc }, () => ({ d: arc / nArc, dtheta: Math.PI / nArc }));
  const lap = [...straight, ...turn, ...straight, ...turn];
  const readings: OdometryReading[] = [];
  for (let l = 0; l < o.laps; l++) readings.push(...lap);
  return { start: pose(-o.straight / 2, -o.radius, 0), readings };
}
