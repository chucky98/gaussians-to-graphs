/** Every concrete claim in post 30, checked against IncrementalVsBatch's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import { INCR, incrementalRun, totals } from '../../../src/lib/demos/incremental';

const steps = incrementalRun();
const at = (t: number) => steps[t - 1]!;

describe('post 30', () => {
  it('300 poses, 299 steps', () => {
    expect(INCR.poses).toBe(300);
    expect(steps).toHaveLength(299);
  });
  it('step 299: closure to 277, 23 poses re-eliminated, work 2,198 vs 129,427', () => {
    const s = at(299);
    expect(s.closures).toEqual([277]);
    expect([s.affected.length, s.incremental, s.batch]).toEqual([23, 2198, 129427]);
  });
  it('first closure at step 32, to pose 0: all 33 poses; the next step only 2', () => {
    const first = steps.find((s) => s.closures.length > 0)!;
    expect([first.t, first.closures[0], first.affected.length]).toEqual([32, 0, 33]);
    expect(at(33).closures).toEqual([]);
    expect(at(33).affected).toEqual([32, 33]);
  });
  it('all 247 steps without a closure affect exactly 2 poses; 52 closure steps; largest 219 at step 222', () => {
    const quiet = steps.filter((s) => s.closures.length === 0);
    expect(quiet).toHaveLength(247);
    for (const s of quiet) expect(s.affected).toEqual([s.t - 1, s.t]);
    const t = totals(steps);
    expect([t.closureSteps, t.maxAffected]).toEqual([52, 219]);
    expect(steps.find((s) => s.affected.length === 219)!.t).toBe(222);
  });
  it('total work: batch is 7.4 times the incremental work', () => {
    const t = totals(steps);
    expect((t.batch / t.incremental).toFixed(1)).toBe('7.4');
  });
});
