import { describe, expect, it } from 'vitest';
import * as m from '../../../src/lib/demos/line-fit';

describe('line-fit model', () => {
  it('ten fixes, 10 m apart, default accuracy 3 m; multipath moves only fix 7', () => {
    const c = m.initialFixes('clean');
    const o = m.initialFixes('multipath');
    expect(c.map((f) => f.x)).toEqual([5, 15, 25, 35, 45, 55, 65, 75, 85, 95]);
    expect(c.every((f) => f.sigma === 3)).toBe(true);
    o.forEach((f, i) => expect(f.y - c[i]!.y).toBeCloseTo(i === 6 ? 22 : 0, 12));
  });
  it('weights are (3/σ)²; the square area equals the weighted squared residual', () => {
    expect(m.weightOf({ x: 0, y: 0, sigma: 3 })).toBe(1);
    expect(m.weightOf({ x: 0, y: 0, sigma: 10 })).toBeCloseTo(0.09, 14);
    const f = { x: 50, y: 30, sigma: 6 };
    for (const r of [4, -4]) {
      const s = m.residualSquare(f, r, m.weightOf(f));
      expect(s.side ** 2).toBeCloseTo(m.weightOf(f) * r * r, 12);
      // the square touches the fix and extends towards the line
      if (r > 0) expect(s.y + s.side).toBeCloseTo(f.y, 12);
      else expect(s.y).toBeCloseTo(f.y, 12);
    }
    // near the right edge the square flips to the left
    const edge = m.residualSquare({ x: 98, y: 30, sigma: 3 }, 5, 1);
    expect(edge.x).toBeCloseTo(93, 12);
  });
  it('fitAll: total area equals Σ w r²; clamp keeps fixes in the plot', () => {
    const s = m.fitAll(m.initialFixes('clean'));
    const area = s.weights.reduce((acc, w, i) => acc + w * s.ls.residuals[i]! ** 2, 0);
    expect(s.ls.cost).toBeCloseTo(area, 10);
    expect(m.clampFix({ x: -5, y: 99, sigma: 3 })).toEqual({ x: 1, y: 59, sigma: 3 });
    expect(m.offsetFromRoad(m.ROAD, 40)).toBe(0);
  });
});
