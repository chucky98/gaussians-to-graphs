import { describe, expect, it } from 'vitest';
import * as m from '../../../src/lib/demos/cost-landscape';

describe('cost-landscape model', () => {
  it('landscape: normalized heat in [0, 1], top row first; contours exist for low levels', () => {
    const l = m.landscape('corners', 30, 25);
    expect(l.heat).toHaveLength(30 * 25);
    expect(Math.min(...l.heat)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...l.heat)).toBeLessThanOrEqual(1);
    expect(l.contours.find((c) => c.level === 1000)!.segments.length).toBeGreaterThan(0);
  });
  it('iterationsTo and path', () => {
    const its = [
      { x: Float64Array.of(5, 5), cost: 9, accepted: true },
      { x: Float64Array.of(5, 5), cost: 9, accepted: false },
      { x: Float64Array.of(0, 0), cost: 0, accepted: true },
    ];
    expect(m.iterationsTo(its, Float64Array.of(0, 0))).toBe(2);
    expect(m.iterationsTo(its, Float64Array.of(9, 9))).toBeNull();
    expect(m.path(its)).toHaveLength(2);
  });
});
