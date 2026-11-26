import { describe, expect, it } from 'vitest';
import { compare, utDefaults } from '../../../src/lib/demos/unscented-transform';
import { FUNCTIONS, defaultParams, standardDraws } from '../../../src/lib/demos/nonlinear-propagation';

describe('unscented-transform model', () => {
  it('sigma images are f(sigma points); the linear case agrees with linearization exactly', () => {
    const z = standardDraws(4, 500, 2);
    const r = compare('linear', defaultParams('linear'), z, utDefaults(2));
    r.sigmaOut.forEach((y, i) => {
      const x = Float64Array.from(r.sigmaIn[i]!);
      const fx = FUNCTIONS.linear.fn.f(x);
      expect(y[0]).toBeCloseTo(fx[0]!, 12);
    });
    expect(r.meanErrUt).toBeLessThan(1e-12);
    expect(r.insideUt).toBe(r.insideLin);
  });
  it('polar sigma points are reported in plot units (degrees, metres)', () => {
    const r = compare('polar', defaultParams('polar'), standardDraws(4, 200, 2), utDefaults(2));
    expect(r.sigmaIn[0]).toEqual([90, 2]);
  });
});
