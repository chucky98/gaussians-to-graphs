import { describe, expect, it } from 'vitest';
import { averageBounds, fractionInside, nees, nis, verdict } from '../../../src/lib/filters/consistency';
import { LAB, LAB_PRESETS, oneRun, runLab } from '../../../src/lib/demos/tuning-lab';
import { diag, fromArrays, inverse, mulVec, vec, dot } from '../../../src/lib/math/matrix';
import { chi2Quantile } from '../../../src/lib/math/stats';

describe('consistency tools', () => {
  it('NEES and NIS are quadratic forms with the inverse covariance', () => {
    const P = fromArrays([
      [2, 0.5],
      [0.5, 1],
    ]);
    const e = vec([0.3, -0.4]);
    expect(nees(vec([1.3, 0.6]), P, vec([1, 1]))).toBeCloseTo(dot(e, mulVec(inverse(P), e)), 13);
    expect(nis(e, P)).toBeCloseTo(dot(e, mulVec(inverse(P), e)), 13);
    expect(nees(vec([1, 2]), diag([4, 9]), vec([3, 5]))).toBeCloseTo(1 + 1, 13);
  });

  it('bounds for an average of M χ²_n are χ²_{Mn} quantiles divided by M', () => {
    const b = averageBounds(4, 50);
    expect(b.lo).toBeCloseTo(chi2Quantile(0.025, 200) / 50, 12);
    expect(b.hi).toBeCloseTo(chi2Quantile(0.975, 200) / 50, 12);
    expect(b.lo).toBeLessThan(4);
    expect(b.hi).toBeGreaterThan(4);
    const one = averageBounds(2, 1);
    expect(one.hi).toBeCloseTo(-2 * Math.log(0.025), 12);
    expect(() => averageBounds(0, 1)).toThrow();
  });

  it('verdict and fractionInside', () => {
    const b = { lo: 1, hi: 3 };
    expect(verdict([2, 2, 5], b)).toBe('consistent');
    expect(verdict([5, 5, 2], b)).toBe('overconfident');
    expect(verdict([0.5, 0.5, 2], b)).toBe('underconfident');
    expect(fractionInside([0.5, 2, 2, 4], b)).toBe(0.5);
  });

  it('DESIGN §8.1: a correctly tuned filter over 200 seeded runs has its average NEES inside the 95% χ² bounds', () => {
    const r = runLab(LAB_PRESETS.tuned, 7, 200);
    const b = averageBounds(LAB.nx, 200);
    // Each step's average is a 95% test, so a few of the 40 may fall outside by chance.
    expect(fractionInside(r.avgNees, b)).toBeGreaterThanOrEqual(0.9);
    const grand = r.avgNees.reduce((a, v) => a + v, 0) / r.avgNees.length;
    expect(Math.abs(grand - LAB.nx)).toBeLessThan(0.15);
    expect(fractionInside(r.avgNis, averageBounds(LAB.nz, 200))).toBeGreaterThanOrEqual(0.9);
  });

  it('mistuned filters are detected: assumed noise too small → above the bounds; too large → below', () => {
    expect(runLab(LAB_PRESETS.overconfident).verdict).toBe('overconfident');
    expect(runLab(LAB_PRESETS.underconfident).verdict).toBe('underconfident');
    expect(runLab(LAB_PRESETS.divergent).verdict).toBe('overconfident');
  });
});

describe('tuning-lab fast path', () => {
  it('equals running the full Kalman filter on every run', () => {
    for (const p of Object.values(LAB_PRESETS)) {
      const fast = runLab(p, 3, 4);
      for (let r = 0; r < 4; r++) {
        const ref = oneRun(p, 3000 + r);
        for (let k = 0; k < LAB.steps; k++) {
          expect(fast.runs[r]!.nees[k]).toBeCloseTo(ref.nees[k]!, 8);
          expect(fast.runs[r]!.nis[k]).toBeCloseTo(ref.nis[k]!, 8);
          for (let i = 0; i < 4; i++) expect(fast.runs[r]!.post[k]!.x[i]).toBeCloseTo(ref.post[k]!.x[i]!, 10);
        }
      }
    }
  });
});
