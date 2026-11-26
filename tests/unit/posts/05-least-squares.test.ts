/** Every concrete claim in post 05, checked against LineFit's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  LINEFIT_DEFAULTS as D,
  LINEFIT_LIMITS as L,
  ROAD,
  fitAll,
  initialFixes,
  lineAt,
  weightOf,
} from '../../../src/lib/demos/line-fit';

const maxGap = (l: { intercept: number; slope: number }) => {
  let g = 0;
  for (let x = L.xDomain[0]; x <= L.xDomain[1]; x += 0.5) g = Math.max(g, Math.abs(lineAt(l, x) - lineAt(ROAD, x)));
  return g;
};
const clean = initialFixes('clean');
const multi = initialFixes('multipath');
const sClean = fitAll(clean);
const sMulti = fitAll(multi);

describe('post 05: clear-day data', () => {
  it('ten fixes, one every 10 m over 100 m, about 3 m error; road y = 20 + 0.15 t', () => {
    expect(clean).toHaveLength(10);
    expect(D.sigma).toBe(3);
    expect(ROAD).toEqual({ intercept: 20, slope: 0.15 });
  });
  it('fit y = 19.49 + 0.155 t, total area 81.9 m², RMS residual 2.86 m', () => {
    expect(sClean.ls.intercept.toFixed(2)).toBe('19.49');
    expect(sClean.ls.slope.toFixed(3)).toBe('0.155');
    expect(sClean.ls.cost.toFixed(1)).toBe('81.9');
    expect(Math.sqrt(sClean.ls.cost / 10).toFixed(2)).toBe('2.86');
  });
  it('fixes up to 4.99 m from the road (the worst almost 5 m); fit within 0.51 m over 100 m', () => {
    const worst = Math.max(...clean.map((f) => Math.abs(f.y - lineAt(ROAD, f.x))));
    expect(worst.toFixed(2)).toBe('4.99');
    expect(maxGap(sClean.ls).toFixed(2)).toBe('0.51');
  });
  it('LAD on clean data: same line as with the outlier, up to 1.83 m from the road', () => {
    expect(maxGap(sClean.lad).toFixed(2)).toBe('1.83');
    expect(sClean.lad.intercept.toFixed(2)).toBe('21.19');
    expect(sClean.lad.slope.toFixed(3)).toBe('0.120');
  });
});

describe('post 05: one bounced fix', () => {
  it('fix 7 reads 22 m too far north; residual 19.3 m (> 6σ); 73% of 510 m²; line up to 4.17 m off', () => {
    expect(D.outlierIndex + 1).toBe(7);
    expect(D.outlierJump).toBe(22);
    const r = sMulti.ls.residuals[6]!;
    expect(r.toFixed(1)).toBe('19.3');
    expect(r / D.sigma).toBeGreaterThan(6);
    expect(Math.round(sMulti.ls.cost)).toBe(510);
    expect(Math.round((100 * r * r) / sMulti.ls.cost)).toBe(73);
    expect(maxGap(sMulti.ls).toFixed(2)).toBe('4.17');
  });
  it('reported accuracy ±10 m → weight 0.09 → line back within 0.49 m', () => {
    const fx = multi.map((f, i) => (i === 6 ? { ...f, sigma: 10 } : f));
    expect(weightOf(fx[6]!).toFixed(2)).toBe('0.09');
    expect(maxGap(fitAll(fx).ls).toFixed(2)).toBe('0.49');
    expect(10).toBeLessThanOrEqual(L.sigma.max);
  });
  it('LAD gives exactly the same line with or without the outlier', () => {
    expect(sMulti.lad.intercept).toBe(sClean.lad.intercept);
    expect(sMulti.lad.slope).toBe(sClean.lad.slope);
  });
});

describe('post 05: other claims', () => {
  it('road angle 8.5°; vertical vs perpendicular residual differ by about 1%', () => {
    const a = Math.atan(ROAD.slope);
    expect(((a * 180) / Math.PI).toFixed(1)).toBe('8.5');
    expect(Math.round(100 * (1 - Math.cos(a)))).toBe(1);
  });
});
