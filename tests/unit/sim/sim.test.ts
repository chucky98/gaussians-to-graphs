import { describe, expect, it } from 'vitest';
import { applyOdometryNoise, deadReckon, odometryNoiseDraws, runSeed } from '../../../src/lib/sim/odometry';
import { stadiumLoop, STADIUM_DEFAULTS } from '../../../src/lib/sim/trajectories';
import { pose } from '../../../src/lib/geometry/se2';
import { angleDiff } from '../../../src/lib/geometry/so2';
import { mean, variance } from '../../../src/lib/math/stats';

describe('stadiumLoop', () => {
  it('each lap closes exactly and turns 2π', () => {
    const { start, readings } = stadiumLoop({ laps: 1 });
    const poses = deadReckon(start, readings);
    const end = poses.at(-1)!;
    expect(end.x).toBeCloseTo(start.x, 10);
    expect(end.y).toBeCloseTo(start.y, 10);
    expect(Math.abs(angleDiff(end.theta, start.theta))).toBeLessThan(1e-10);
    expect(readings.reduce((s, u) => s + u.dtheta, 0)).toBeCloseTo(2 * Math.PI, 12);
  });
  it('lap length is 2·straight + 2πr and the shape fits its nominal extent', () => {
    const { start, readings } = stadiumLoop({ laps: 1 });
    const L = readings.reduce((s, u) => s + u.d, 0);
    expect(L).toBeCloseTo(2 * STADIUM_DEFAULTS.straight + 2 * Math.PI * STADIUM_DEFAULTS.radius, 10);
    const poses = deadReckon(start, readings);
    const ys = poses.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(-3, 10);
    // Polygon through points on the semicircle's chords: top within a step of 2r.
    expect(Math.max(...ys)).toBeGreaterThan(2.9);
    expect(Math.max(...ys)).toBeLessThan(3.1);
    expect(stadiumLoop({ laps: 2 }).readings).toHaveLength(2 * readings.length);
  });
});

describe('odometry noise and dead reckoning', () => {
  it('deadReckon with zero noise reproduces the truth; noise draws are deterministic', () => {
    const { start, readings } = stadiumLoop({ laps: 1 });
    const z = odometryNoiseDraws(5, readings.length);
    expect(odometryNoiseDraws(5, readings.length)).toEqual(z);
    expect(deadReckon(start, applyOdometryNoise(readings, 0, z))).toEqual(deadReckon(start, readings));
    expect(() => applyOdometryNoise(readings, 0.1, z.subarray(0, 4))).toThrow();
    expect(deadReckon(start, [])).toEqual([start]);
    expect(runSeed(1, 0)).not.toBe(runSeed(1, 1));
    expect(runSeed(1, 0)).not.toBe(runSeed(2, 0));
  });

  it('accumulated distance and heading errors have std p·√L (random-walk scaling)', () => {
    const p = 0.05;
    const truth = Array.from({ length: 80 }, () => ({ d: 0.25, dtheta: 0.01 })); // L = 20 m
    const dErr: number[] = [];
    const thErr: number[] = [];
    for (let r = 0; r < 4000; r++) {
      const noisy = applyOdometryNoise(truth, p, odometryNoiseDraws(runSeed(3, r), truth.length));
      dErr.push(noisy.reduce((s, u, k) => s + u.d - truth[k]!.d, 0));
      thErr.push(noisy.reduce((s, u, k) => s + u.dtheta - truth[k]!.dtheta, 0));
    }
    const target = p * Math.sqrt(20);
    expect(Math.abs(mean(dErr))).toBeLessThan(0.01);
    expect(Math.sqrt(variance(dErr)) / target).toBeGreaterThan(0.96);
    expect(Math.sqrt(variance(dErr)) / target).toBeLessThan(1.04);
    expect(Math.sqrt(variance(thErr)) / target).toBeGreaterThan(0.96);
    expect(Math.sqrt(variance(thErr)) / target).toBeLessThan(1.04);
  });

  it('straight line: lateral error std ≈ p·L^{3/2}/√3 and dwarfs the along-track error', () => {
    const p = 0.05;
    const n = 80;
    const truth = Array.from({ length: n }, () => ({ d: 0.25, dtheta: 0 }));
    const L = 20;
    const lat: number[] = [];
    const along: number[] = [];
    for (let r = 0; r < 4000; r++) {
      const end = deadReckon(pose(0, 0, 0), applyOdometryNoise(truth, p, odometryNoiseDraws(runSeed(9, r), n))).at(-1)!;
      lat.push(end.y);
      along.push(end.x - L);
    }
    // Discrete small-angle prediction: Var = p² d³ (n−1) n (2n−1) / 6.
    const d = 0.25;
    const latPred = Math.sqrt((p * p * d ** 3 * ((n - 1) * n * (2 * n - 1))) / 6);
    expect(latPred / ((p * L ** 1.5) / Math.sqrt(3))).toBeGreaterThan(0.98);
    const latStd = Math.sqrt(variance(lat));
    expect(latStd / latPred).toBeGreaterThan(0.95);
    expect(latStd / latPred).toBeLessThan(1.05);
    // Along-track: distance noise (p·√L) plus a second-order shortening from heading error,
    // so it exceeds p·√L, but it stays far below the lateral error.
    const alongStd = Math.sqrt(variance(along));
    expect(alongStd).toBeGreaterThan(p * Math.sqrt(L));
    expect(alongStd / latStd).toBeLessThan(0.2);
  });
});
