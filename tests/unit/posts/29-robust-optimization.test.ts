/** Every concrete claim in post 29, checked against OutlierLoopClosures' defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import { ROBUST, runRobust, type RobustRequest } from '../../../src/lib/demos/robust-demo';

const run = (o: Partial<RobustRequest>) => runRobust({ ...ROBUST.defaults, ...o });
const f2 = (v: number) => v.toFixed(2);
const final = (r: ReturnType<typeof runRobust>) => f2(r.iterations.at(-1)!.rms);

describe('post 29', () => {
  it('defaults: 500 poses, 104 true closures, 10 false, L2, scale 3; rejection = weight below 0.1', () => {
    expect([
      ROBUST.poses,
      ROBUST.defaults.outliers,
      ROBUST.defaults.method,
      ROBUST.defaults.k,
      ROBUST.rejectBelow,
    ]).toEqual([500, 10, 'l2', 3, 0.1]);
    expect(run({}).trueLoops).toBe(104);
  });
  it('L2 with 10 false closures: 6.75 m against 2.32 m dead reckoning; 0.24 m with none', () => {
    const r = run({});
    expect([f2(r.iterations[0]!.rms), final(r)]).toEqual(['2.32', '6.75']);
    expect(final(run({ outliers: 0 }))).toBe('0.24');
  }, 60_000);
  it('Huber: all 10 false closures below a tenth of their weight, yet 1.02 m', () => {
    const r = run({ method: 'huber' });
    expect([r.falseRejected, final(r)]).toEqual([10, '1.02']);
  }, 60_000);
  it('Cauchy: 0.23 m, all false and no true rejected; 60 false: 0.24 m; Huber with 60: 5.82 m', () => {
    const c = run({ method: 'cauchy' });
    expect([final(c), c.falseRejected, c.trueRejected]).toEqual(['0.23', 10, 0]);
    expect(final(run({ method: 'cauchy', outliers: 60 }))).toBe('0.24');
    expect(final(run({ method: 'huber', outliers: 60 }))).toBe('5.82');
    expect(60 / (104 + 60)).toBeGreaterThan(1 / 3);
  }, 60_000);
  it('Geman–McClure at scale 1 rejects 100 of 104 true closures and ends 1.85 m off; GNC at scale 1: 0.29 m', () => {
    const g = run({ method: 'gm', k: 1 });
    expect([g.trueRejected, final(g)]).toEqual([100, '1.85']);
    expect(final(run({ method: 'gnc', k: 1 }))).toBe('0.29');
  }, 60_000);
  it('iterations at the default scale: GNC 87, Cauchy 18', () => {
    expect(run({ method: 'gnc' }).iterations.length - 1).toBe(87);
    expect(run({ method: 'cauchy' }).iterations.length - 1).toBe(18);
  }, 60_000);
});
