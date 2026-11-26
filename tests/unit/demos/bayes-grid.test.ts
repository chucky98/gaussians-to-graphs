import { describe, expect, it } from 'vitest';
import * as m from '../../../src/lib/demos/bayes-grid';

describe('bayes-grid model', () => {
  it('reading sequences are seeded around each preset’s true distance', () => {
    const a = m.readingSequence('odometry');
    expect(a).toEqual(m.readingSequence('odometry'));
    expect(a).toHaveLength(m.BAYES_DEFAULTS.maxReadings);
    const mean = a.reduce((s, v) => s + v, 0) / a.length;
    expect(Math.abs(mean - m.priorSpec('odometry').truth)).toBeLessThan(0.15);
  });
  it('modes: single peak, flat top and tie', () => {
    const one = m.infer('odometry', 0, [2.5], 1);
    expect(one.map).not.toBeNull();
    expect(one.mapCandidates).toHaveLength(1);
    expect(m.infer('none', 0, [], 1)).toMatchObject({ map: null, mapCandidates: [] });
    const tie = m.infer('doorways', 0, [], 1);
    expect(tie.map).toBeNull();
    expect(tie.mapCandidates).toHaveLength(2);
    expect(m.infer('odometry', 0, [], 0).map).toBeNull(); // κ = 0 and no data: flat
  });
  it('shifting the prior moves its anchor; shift is clamped and snapped', () => {
    expect(m.priorSpec('odometry', 0.5).anchor).toBe(2.5);
    expect(m.clampShift(9)).toBe(1.5);
    expect(m.clampShift(0.123)).toBe(0.1);
  });
});
