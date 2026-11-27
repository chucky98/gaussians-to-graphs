/** Every concrete claim in post 23, checked against CorrelationsEmerge's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import { CORR, closureStep, corrRun, landmarkSd, snapshot } from '../../../src/lib/demos/correlations';
import { canonicalCorrelation } from '../../../src/lib/filters/ekf-slam';

const r = corrRun();
const kc = closureStep(r);
const f2 = (v: number) => v.toFixed(2);

describe('post 23: scenario', () => {
  it('six landmarks, a 4 m circle, sensor range 2.5 m, seed 20; all six mapped; closure at step 99', () => {
    expect(CORR.world.landmarks).toHaveLength(6);
    expect([CORR.world.radius, CORR.world.range, CORR.seed, CORR.minLink]).toEqual([4, 2.5, 20, 0.2]);
    expect(snapshot(r, CORR.world.steps).landmarks).toHaveLength(6);
    expect(kc).toBe(99);
  });
});

describe('post 23: try this', () => {
  it('step 60: four landmarks, robot 0.72 m; links 0.99 and 1.00 to landmarks 2, 3; 0.42 to landmark 0', () => {
    const s = snapshot(r, 60);
    expect(s.landmarks).toHaveLength(4);
    expect(f2(s.robotSd)).toBe('0.72');
    const rho = (id: number) => f2(canonicalCorrelation(s.state, -1, s.state.ids.indexOf(id)));
    expect([rho(2), rho(3), rho(0)]).toEqual(['0.99', '1.00', '0.42']);
  });
  it('step 98: robot 0.82, landmark 4 0.89, landmark 5 0.70; step 99: 0.18 and landmark 4 (not observed) 0.57', () => {
    expect(f2(snapshot(r, 98).robotSd)).toBe('0.82');
    expect([f2(landmarkSd(r, 98, 4)), f2(landmarkSd(r, 98, 5))]).toEqual(['0.89', '0.70']);
    expect(f2(snapshot(r, 99).robotSd)).toBe('0.18');
    expect(f2(landmarkSd(r, 99, 4))).toBe('0.57');
    expect(r.steps[99]!.seen).toContain(0);
    expect(r.steps[99]!.seen).not.toContain(4);
  });
  it('step 98: landmarks 2 and 3 correlated at 0.99; their difference 0.46 m vs 0.61 and 0.58 m alone', () => {
    const s = r.steps[98]!.state;
    const n = s.x.length;
    const [j2, j3] = [s.ids.indexOf(2), s.ids.indexOf(3)];
    expect(f2(canonicalCorrelation(s, j2, j3))).toBe('0.99');
    const [o2, o3] = [3 + 2 * j2, 3 + 2 * j3];
    const P = (i: number, j: number) => s.P.data[i * n + j]!;
    const v = P(o2, o2) + P(o2 + 1, o2 + 1) + P(o3, o3) + P(o3 + 1, o3 + 1) - 2 * (P(o2, o3) + P(o2 + 1, o3 + 1));
    expect(f2(Math.sqrt(v))).toBe('0.46');
    expect([f2(landmarkSd(r, 98, 2)), f2(landmarkSd(r, 98, 3))]).toEqual(['0.61', '0.58']);
  });
  it('landmark 0 shrinks to 0.08 m within ten steps and never grows again', () => {
    expect(f2(landmarkSd(r, 10, 0))).toBe('0.08');
    for (let k = 11; k <= CORR.world.steps; k++) {
      expect(landmarkSd(r, k, 0)).toBeLessThanOrEqual(landmarkSd(r, k - 1, 0) + 1e-12);
      expect(landmarkSd(r, k, 0)).toBeLessThan(0.085);
    }
  });
  it('every landmark is born strongly correlated with the robot (ρ > 0.6 at its first reading)', () => {
    for (let k = 1; k <= CORR.world.steps; k++)
      for (const id of r.steps[k]!.added) {
        const s = r.steps[k]!.state;
        expect(canonicalCorrelation(s, -1, s.ids.indexOf(id))).toBeGreaterThan(0.6);
      }
  });
});
