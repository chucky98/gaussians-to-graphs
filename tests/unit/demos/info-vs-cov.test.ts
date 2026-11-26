import { describe, expect, it } from 'vitest';
import { logMagnitude, matricesAt } from '../../../src/lib/demos/info-vs-cov';
import { identity, maxAbsDiff, mul } from '../../../src/lib/math/matrix';

describe('info-vs-cov model', () => {
  it('P is the inverse of Ω', () => {
    for (const sc of ['corridor', 'aisle'] as const) {
      const m = matricesAt(sc, 8);
      expect(maxAbsDiff(mul(m.Omega, m.P), identity(m.size))).toBeLessThan(1e-9);
    }
  });
  it('log magnitudes: zeros stay 0, the largest entry maps to 1, tiny entries stay visible', () => {
    const v = logMagnitude({ rows: 1, cols: 4, data: Float64Array.of(0, 2, -1, 2e-13) });
    expect(v[0]).toBe(0);
    expect(v[1]).toBe(1);
    expect(v[2]!).toBeGreaterThan(0.9);
    expect(v[3]).toBeCloseTo(0.08, 12);
  });
});
