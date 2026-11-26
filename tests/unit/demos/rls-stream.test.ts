import { describe, expect, it } from 'vitest';
import * as m from '../../../src/lib/demos/rls-stream';

describe('rls-stream model', () => {
  it('streams are seeded; the sag preset only changes the gain from step 60', () => {
    const a = m.makeStream('steady', 3);
    const b = m.makeStream('sag', 3);
    expect(b.duty).toEqual(a.duty);
    b.speed.forEach((v, k) => {
      if (k < m.MOTOR.sagAt) expect(v).toBe(a.speed[k]);
      else expect(v).toBeCloseTo(a.speed[k]! - 0.05 * a.duty[k]!, 10);
    });
  });
  it('lineStd matches √(aᵀPa); settleStep finds a stable entry or null', () => {
    const st = m.priorState();
    expect(m.lineStd(st, 50)).toBeCloseTo(Math.sqrt(4 + 2500 * 0.01), 12);
    const steps = m.runRls(m.makeStream('steady', m.MOTOR.seed), 1);
    const s = m.settleStep(steps, Array(steps.length).fill(m.MOTOR.gain), 0, 0.05);
    expect(s).not.toBeNull();
    expect(m.settleStep(steps, Array(steps.length).fill(1), 0, 0.01)).toBeNull();
  });
});
