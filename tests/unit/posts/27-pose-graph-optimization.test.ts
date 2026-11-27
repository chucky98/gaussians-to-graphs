/** Every concrete claim in post 27, checked against PoseGraph2D's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import { PG, defaultRequest, runPoseGraph } from '../../../src/lib/demos/pose-graph-demo';

const lm = runPoseGraph(defaultRequest());

describe('post 27', () => {
  it('defaults: 1,000 poses, 999 odometry, 351 loop closures, seed 18, LM', () => {
    expect([PG.base.poses, lm.setup.odometry, lm.setup.loops.length / 2, PG.base.seed]).toEqual([1000, 999, 351, 18]);
    expect(defaultRequest().method).toBe('lm');
  });
  it('LM: 6 iterations; cost 1.33 million → under 1,000 in two iterations → 553; RMS 4.73 → 0.16 m; expected ≈ 527', () => {
    const it = lm.iterations;
    expect(it.length - 1).toBe(6);
    expect((it[0]!.cost / 1e6).toFixed(2)).toBe('1.33');
    expect(it[2]!.cost).toBeLessThan(1000);
    expect(Math.round(it.at(-1)!.cost)).toBe(553);
    expect([it[0]!.rms.toFixed(2), it.at(-1)!.rms.toFixed(2)]).toEqual(['4.73', '0.16']);
    expect(Math.round(0.5 * (3 * (999 + 351 + 1) - 3000))).toBe(527);
  });
  it('sparsity: 0.37% of Λ nonzero; Cholesky fill 1,013,370 natural vs 64,779 minimum degree', () => {
    expect(((100 * lm.setup.lambdaNnz) / lm.setup.lambdaSize ** 2).toFixed(2)).toBe('0.37');
    expect([lm.setup.fillNatural, lm.setup.fillMinDegree]).toEqual([1013370, 64779]);
  });
  it('without loop closures nothing moves: cost ≈ 0, RMS stays 4.73 m', () => {
    const r = runPoseGraph({ ...defaultRequest(), useLoops: false });
    expect(r.iterations[0]!.cost).toBeLessThan(1e-12);
    expect(r.iterations.at(-1)!.rms.toFixed(2)).toBe('4.73');
  });
  it('Gauss–Newton: 5 iterations to the same answer', () => {
    const r = runPoseGraph({ ...defaultRequest(), method: 'gn' });
    expect(r.iterations.length - 1).toBe(5);
    expect(Math.round(r.iterations.at(-1)!.cost)).toBe(553);
  });
  it('extreme drift: both run all 40 iterations and stop between 13,000 and 15,000, 2.5–2.8 m off', () => {
    for (const method of ['lm', 'gn'] as const) {
      const r = runPoseGraph({ ...defaultRequest(), sigmaTheta: PG.presets.extreme.sigmaTheta, method });
      expect(r.iterations.length - 1).toBe(40);
      expect(r.iterations.at(-1)!.cost).toBeGreaterThan(13000);
      expect(r.iterations.at(-1)!.cost).toBeLessThan(15000);
      expect(r.iterations.at(-1)!.rms).toBeGreaterThan(2.45);
      expect(r.iterations.at(-1)!.rms).toBeLessThan(2.8);
    }
  }, 60_000);
  it('extreme drift: 5 of the seeds 11–20 end stuck (cost above 1,000)', () => {
    let stuck = 0;
    for (let seed = 11; seed <= 20; seed++) {
      const r = runPoseGraph({ ...defaultRequest(), sigmaTheta: 0.1, seed });
      if (r.iterations.at(-1)!.cost > 1000) stuck++;
    }
    expect(stuck).toBe(5);
  }, 60_000);
  it('2,000 poses: 827 loop closures, 6 iterations, 0.19% of Λ nonzero', () => {
    const r = runPoseGraph({ ...defaultRequest(), poses: 2000 });
    expect(r.setup.loops.length / 2).toBe(827);
    expect(r.iterations.length - 1).toBe(6);
    expect(((100 * r.setup.lambdaNnz) / r.setup.lambdaSize ** 2).toFixed(2)).toBe('0.19');
  });
});
