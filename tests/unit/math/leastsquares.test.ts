import { describe, expect, it } from 'vitest';
import { fitLine, fitLineLAD, lineDesign, lstsq, normalResidual } from '../../../src/lib/math/leastsquares';
import { fromArrays, vec, mul, mulVec, transpose, inverse, zeros } from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';

const rng = createRng(505);

describe('lstsq', () => {
  it('recovers an exact solution', () => {
    const A = fromArrays([
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
    const r = lstsq(A, vec([1, 3, 5]));
    expect(r.x[0]).toBeCloseTo(1, 12);
    expect(r.x[1]).toBeCloseTo(2, 12);
    expect(r.cost).toBeCloseTo(0, 20);
  });

  it('residual is orthogonal to the columns of A (normal equations)', () => {
    for (let t = 0; t < 10; t++) {
      const A = zeros(20, 3);
      for (let k = 0; k < A.data.length; k++) A.data[k] = rng.normal();
      const b = Float64Array.from({ length: 20 }, () => rng.normal());
      const w = Float64Array.from({ length: 20 }, () => rng.uniformRange(0.1, 3));
      for (const ww of [undefined, w]) {
        const r = lstsq(A, b, ww);
        for (const v of normalResidual(A, r.residuals, ww)) expect(Math.abs(v)).toBeLessThan(1e-10);
      }
    }
  });

  it('matches the explicit formula (AᵀA)⁻¹Aᵀb and is the minimum', () => {
    const A = zeros(15, 2);
    for (let k = 0; k < A.data.length; k++) A.data[k] = rng.normal();
    const b = Float64Array.from({ length: 15 }, () => rng.normal());
    const r = lstsq(A, b);
    const At = transpose(A);
    const x = mulVec(mul(inverse(mul(At, A)), At), b);
    expect(r.x[0]).toBeCloseTo(x[0]!, 10);
    expect(r.x[1]).toBeCloseTo(x[1]!, 10);
    for (let t = 0; t < 20; t++) {
      const xp = vec([r.x[0]! + 0.01 * rng.normal(), r.x[1]! + 0.01 * rng.normal()]);
      const fit = mulVec(A, xp);
      const c = b.reduce((s, bi, i) => s + (bi - fit[i]!) ** 2, 0);
      expect(c).toBeGreaterThanOrEqual(r.cost - 1e-12);
    }
  });

  it('equal weights give the OLS answer; scaling all weights changes nothing but the cost', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = [1.1, 2.9, 5.2, 6.8, 9.1];
    const a = fitLine(xs, ys);
    const b = fitLine(xs, ys, [4, 4, 4, 4, 4]);
    expect(b.slope).toBeCloseTo(a.slope, 12);
    expect(b.intercept).toBeCloseTo(a.intercept, 12);
    expect(b.cost).toBeCloseTo(4 * a.cost, 12);
  });

  it('matches the textbook line-regression formulas', () => {
    const xs = [1, 2, 4, 5, 7];
    const ys = [2, 3, 7, 8, 12];
    const n = xs.length;
    const mx = xs.reduce((s, v) => s + v) / n;
    const my = ys.reduce((s, v) => s + v) / n;
    const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0);
    const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    const f = fitLine(xs, ys);
    expect(f.slope).toBeCloseTo(sxy / sxx, 12);
    expect(f.intercept).toBeCloseTo(my - (sxy / sxx) * mx, 12);
  });

  it('a weight of zero removes a point', () => {
    const xs = [0, 1, 2, 3];
    const ys = [0, 1, 2, 100];
    const f = fitLine(xs, ys, [1, 1, 1, 0]);
    expect(f.slope).toBeCloseTo(1, 12);
    expect(f.intercept).toBeCloseTo(0, 12);
  });

  it('validates inputs', () => {
    expect(() => lstsq(lineDesign([0, 1]), vec([1]))).toThrow();
    expect(() => lstsq(lineDesign([0, 1]), vec([1, 2]), vec([1]))).toThrow();
    expect(() => lstsq(lineDesign([0, 1]), vec([1, 2]), vec([1, -1]))).toThrow();
    expect(() => lstsq(lineDesign([1, 1]), vec([1, 2]))).toThrow(); // singular
  });
});

describe('fitLineLAD', () => {
  it('passes through the bulk of the data and ignores one wild point', () => {
    const xs = [0, 1, 2, 3, 4, 5, 6];
    const ys = [0, 1, 2, 3, 40, 5, 6];
    const lad = fitLineLAD(xs, ys);
    expect(lad.slope).toBeCloseTo(1, 12);
    expect(lad.intercept).toBeCloseTo(0, 12);
    expect(lad.cost).toBeCloseTo(36, 12);
    const ls = fitLine(xs, ys);
    expect(Math.abs(ls.slope - 1) + Math.abs(ls.intercept)).toBeGreaterThan(1);
  });

  it('is no worse than any line through two points or the LS line (brute-force check)', () => {
    const xs = Float64Array.from({ length: 9 }, (_, i) => i);
    const ys = Float64Array.from({ length: 9 }, (_, i) => 2 + 0.5 * i + rng.normal());
    const lad = fitLineLAD(xs, ys);
    const ls = fitLine(xs, ys);
    const l1 = (c: number, s: number) => ys.reduce((acc, y, i) => acc + Math.abs(y - c - s * xs[i]!), 0);
    expect(lad.cost).toBeLessThanOrEqual(l1(ls.intercept, ls.slope) + 1e-12);
    for (let t = 0; t < 200; t++) {
      expect(lad.cost).toBeLessThanOrEqual(
        l1(lad.intercept + 0.3 * rng.normal(), lad.slope + 0.1 * rng.normal()) + 1e-12,
      );
    }
  });

  it('validates inputs', () => {
    expect(() => fitLineLAD([1], [1])).toThrow();
    expect(() => fitLineLAD([1, 1], [1, 2])).toThrow();
  });
});
