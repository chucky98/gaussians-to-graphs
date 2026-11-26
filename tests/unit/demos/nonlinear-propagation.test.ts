import { describe, expect, it } from 'vitest';
import {
  FN_ORDER,
  FUNCTIONS,
  PROP_DEFAULTS as D,
  defaultParams,
  inputGaussian,
  outputHistogram,
  propagate,
  standardDraws,
} from '../../../src/lib/demos/nonlinear-propagation';

describe('nonlinear-propagation model', () => {
  it('every function has defaults within its slider ranges and a consistent dimension', () => {
    for (const id of FN_ORDER) {
      const cfg = FUNCTIONS[id];
      expect(cfg.fn.inDim).toBe(cfg.dim);
      for (const s of cfg.sliders) {
        expect(s.default).toBeGreaterThanOrEqual(s.min);
        expect(s.default).toBeLessThanOrEqual(s.max);
      }
      const r = propagate(id, defaultParams(id), standardDraws(D.seed, 300, cfg.dim));
      expect(r.inPts).toHaveLength(600);
      expect(r.outPts).toHaveLength(300 * cfg.dim);
    }
  });
  it('polar input converts degrees to radians; input plot uses (θ in degrees, r)', () => {
    const g = inputGaussian('polar', { muR: 2, sigmaR: 0.1, muT: 90, sigmaT: 10 });
    expect(g.mean[1]).toBeCloseTo(Math.PI / 2, 14);
    expect(g.cov.data[3]).toBeCloseTo(((10 * Math.PI) / 180) ** 2, 14);
    const r = propagate('polar', defaultParams('polar'), standardDraws(1, 50, 2));
    expect(Math.abs(r.inPts[0]! - 90)).toBeLessThan(90); // degrees, near 90
    expect(Math.abs(r.inPts[1]! - 2)).toBeLessThan(1); // range
  });
  it('outputHistogram integrates to the fraction of samples inside the plot range', () => {
    const r = propagate('sine', defaultParams('sine'), standardDraws(3, 4000, 1));
    const h = outputHistogram('sine', r.outPts, 40);
    const w = h.edges[1]! - h.edges[0]!;
    expect(h.density.reduce((s, d) => s + d * w, 0)).toBeCloseTo(1, 10); // sin ∈ [−1, 1] ⊂ plot range
  });
  it('a degenerate linearized region contains nothing', () => {
    const r = propagate('square', { mu: 0, sigma: 0.5 }, standardDraws(3, 500, 1));
    expect(r.insideLin).toBe(0);
  });
});
