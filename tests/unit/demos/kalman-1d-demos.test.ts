import { describe, expect, it } from 'vitest';
import {
  PRODUCT_DEFAULTS as PD,
  PRODUCT_LIMITS as PL,
  clampTo,
  combine,
  densityTop,
  yTop,
} from '../../../src/lib/demos/gaussian-product';
import {
  TRACK,
  TRACKER_DEFAULTS as D,
  T_MAX,
  beliefAt,
  coverage,
  initBelief,
  makeScenario,
  phaseOf,
  runTracker,
} from '../../../src/lib/demos/tracker-1d';
import { product1 } from '../../../src/lib/math/gaussian';

describe('gaussian-product model', () => {
  it('combine is the 1D Gaussian product, with gain σ₁²/(σ₁² + σ₂²)', () => {
    const r = combine(PD);
    const p = product1(PD.mu1, PD.s1 ** 2, PD.mu2, PD.s2 ** 2);
    expect(r.mean).toBeCloseTo(p.mean, 14);
    expect(r.sigma).toBeCloseTo(Math.sqrt(p.variance), 14);
    expect(r.K).toBeCloseTo(0.25 / 0.34, 15);
  });
  it('the y-axis top fits the tallest peak at every allowed setting', () => {
    for (const s1 of [PL.sigma.min, 0.5, PL.sigma.max])
      for (const s2 of [PL.sigma.min, 1, PL.sigma.max]) {
        const p = { ...PD, s1, s2 };
        const peak = 1 / (Math.min(s1, s2, combine(p).sigma) * Math.sqrt(2 * Math.PI));
        expect(yTop(p)).toBeGreaterThanOrEqual(peak);
      }
    expect(densityTop(1)).toBe(0.5);
    expect(densityTop(0.001)).toBe(10);
  });
  it('clampTo snaps to the step and the limits', () => {
    expect(clampTo(100, PL.mu)).toBe(PL.mu.max);
    expect(clampTo(-5, PL.sigma)).toBeCloseTo(PL.sigma.min, 12);
    expect(clampTo(12.34, PL.mu)).toBeCloseTo(12.35, 12);
  });
});

describe('tracker-1d model', () => {
  it('deterministic scenario; the outage only removes fixes (same truth)', () => {
    const a = makeScenario('steady', D, 3);
    const b = makeScenario('steady', D, 3);
    const o = makeScenario('outage', D, 3);
    expect(a).toEqual(b);
    expect(o.truth).toEqual(a.truth);
    expect(o.zs.filter((z) => z === null)).toHaveLength(TRACK.outage.to - TRACK.outage.from);
    expect(a.us).toEqual(new Array(TRACK.steps).fill(1));
    expect(a.truth).toHaveLength(TRACK.steps + 1);
  });
  it('common random numbers: scaling √R scales every fix error by the same factor', () => {
    const a = makeScenario('steady', D, 5);
    const b = makeScenario('steady', { ...D, sigmaZ: 2 * D.sigmaZ }, 5);
    expect(b.truth).toEqual(a.truth);
    for (let k = 1; k <= TRACK.steps; k++)
      expect(b.zs[k - 1]! - b.truth[k]!).toBeCloseTo(2 * (a.zs[k - 1]! - a.truth[k]!), 12);
  });
  it('half-steps: phases and beliefs', () => {
    expect(phaseOf(0)).toEqual({ k: 0, stage: 'start' });
    expect(phaseOf(1)).toEqual({ k: 1, stage: 'predicted' });
    expect(phaseOf(2)).toEqual({ k: 1, stage: 'updated' });
    expect(phaseOf(T_MAX)).toEqual({ k: TRACK.steps, stage: 'updated' });
    const st = runTracker(makeScenario('steady', D), D);
    expect(beliefAt(st, 0)).toEqual(initBelief());
    expect(beliefAt(st, 3)).toBe(st[1]!.prior);
    expect(beliefAt(st, 4)).toBe(st[1]!.post);
  });
  it('coverage counts estimates within ±1.96σ', () => {
    const st = runTracker(makeScenario('steady', D), D);
    const truth = st.map((x) => x.post.x);
    expect(coverage(st, [0, ...truth])).toBe(1);
    const far = [0, ...truth.map((x) => x + 100)];
    expect(coverage(st, far)).toBe(0);
  });
});
