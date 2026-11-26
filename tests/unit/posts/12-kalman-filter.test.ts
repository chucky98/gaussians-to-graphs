/** Every concrete claim in post 12, checked against CVTracker2D's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  CV,
  CV_DEFAULTS as D,
  makeScenario,
  priorState,
  runCv,
  sdOf,
  velocityCoverage,
  type CvParams,
  type CvPreset,
} from '../../../src/lib/demos/cv-tracker';
import { mahalanobis2 } from '../../../src/lib/math/gaussian';
import { chi2Quantile } from '../../../src/lib/math/stats';
import { getBlock } from '../../../src/lib/math/matrix';

const f2 = (v: number) => v.toFixed(2);
const f3 = (v: number) => v.toFixed(3);
const go = (preset: CvPreset = 'wander', p: CvParams = D) => {
  const s = makeScenario(preset, p, CV.seed);
  return { s, st: runCv(s, p) };
};
const v95 = (st: ReturnType<typeof go>['st'], k: number) => 1.96 * sdOf(st[k - 1]!.post, 2);
const rms = (a: number[]) => Math.sqrt(a.reduce((x, y) => x + y * y, 0) / a.length);
const posErr = (r: ReturnType<typeof go>) =>
  r.st.map((x, i) => Math.hypot(x.post.x[0]! - r.s.truth[i + 1]![0]!, x.post.x[1]! - r.s.truth[i + 1]![1]!));
const fixErr = (r: ReturnType<typeof go>) =>
  r.s.zs.map((z, i) => Math.hypot(z[0]! - r.s.truth[i + 1]![0]!, z[1]! - r.s.truth[i + 1]![1]!));
const outside95 = (r: ReturnType<typeof go>) =>
  r.st
    .map((x, i) => {
      const g = { mean: x.post.x.slice(0, 2), cov: getBlock(x.post.P, 0, 0, 2, 2) };
      return mahalanobis2(g, r.s.truth[i + 1]!.slice(0, 2)) > chi2Quantile(0.95, 2) ? i + 1 : 0;
    })
    .filter(Boolean);

describe('post 12: setup', () => {
  it('Δt = 1 s, q = 0.01 (velocity drifts ~0.1 m/s per second), σ = 0.5 m; prior velocity 0 ± 2 m/s (± 4 at 95%)', () => {
    expect([CV.dt, D.q, D.sigma, CV.steps]).toEqual([1, 0.01, 0.5, 40]);
    expect(Math.sqrt(D.q * CV.dt)).toBeCloseTo(0.1, 12);
    expect(f2(1.96 * sdOf(priorState(), 2))).toBe('3.92');
    expect([priorState().x[2], priorState().x[3]]).toEqual([0, 0]);
  });
});

describe('post 12: default run (seed 50)', () => {
  const r = go();
  it('velocity: 0.33 ± 2.82 → 1.85 ± 1.18 → 1.54 ± 0.67 (truth 1.46); ± 0.32 from step 10 on', () => {
    const at = (k: number) => [f2(r.st[k - 1]!.post.x[2]!), f2(v95(r.st, k))];
    expect(at(1)).toEqual(['0.33', '2.82']);
    expect(at(2)).toEqual(['1.85', '1.18']);
    expect(at(3)).toEqual(['1.54', '0.67']);
    expect(f2(r.s.truth[3]![2]!)).toBe('1.46');
    for (let k = 10; k <= 40; k++) expect(f2(v95(r.st, k))).toBe('0.32');
  });
  it('steady gain [0.469 I; 0.146 I]; position σ 0.47 m predicted, 0.34 m updated', () => {
    const K = r.st[39]!.update!.K.data;
    expect([f3(K[0]!), f3(K[3]!), f3(K[4]!), f3(K[7]!)]).toEqual(['0.469', '0.469', '0.146', '0.146']);
    expect([K[1], K[2], K[5], K[6]]).toEqual([0, 0, 0, 0]);
    expect(f2(sdOf(r.st[39]!.prior, 0))).toBe('0.47');
    expect(f2(sdOf(r.st[39]!.post, 0))).toBe('0.34');
  });
  it('position RMS 0.51 m vs fixes 0.72 m; vx inside its 95% band at 38 of 40 steps', () => {
    expect(f2(rms(posErr(r)))).toBe('0.51');
    expect(f2(rms(fixErr(r)))).toBe('0.72');
    expect(Math.round(velocityCoverage(r.st, r.s.truth) * 40)).toBe(38);
  });
  it('σ = 1.5 m: fixes 2.15 m, filter 1.18 m; velocity gain 0.056; band below ± 0.5 m/s at step 9 (vs 4)', () => {
    const h = go('wander', { ...D, sigma: 1.5 });
    expect(f2(rms(fixErr(h)))).toBe('2.15');
    expect(f2(rms(posErr(h)))).toBe('1.18');
    expect(f3(h.st[39]!.update!.K.data[4]!)).toBe('0.056');
    const first = (x: ReturnType<typeof go>) => x.st.findIndex((_, i) => v95(x.st, i + 1) < 0.5) + 1;
    expect(first(h)).toBe(9);
    expect(first(r)).toBe(4);
  });
  it('seed 50 is typical over seeds 1–200 (position, fix and velocity RMS within 3% of the medians)', () => {
    const all = Array.from({ length: 200 }, (_, i) => {
      const s = makeScenario('wander', D, i + 1);
      const x = { s, st: runCv(s, D) };
      const ev = x.st.map((y, j) => Math.hypot(y.post.x[2]! - s.truth[j + 1]![2]!, y.post.x[3]! - s.truth[j + 1]![3]!));
      return [rms(posErr(x)), rms(fixErr(x)), rms(ev)];
    });
    for (let c = 0; c < 3; c++) {
      const med = all.map((a) => a[c]!).sort((a, b) => a - b)[100]!;
      expect(Math.abs(all[CV.seed - 1]![c]! / med - 1)).toBeLessThan(0.03);
    }
  });
});

describe('post 12: the turn', () => {
  it('q = 0.01: outside the 95% ellipse at 4 of the 5 steps 22–26; vy at t = 25 is 1.11 vs 1.40', () => {
    const r = go('turn');
    expect(outside95(r).filter((k) => k >= 22 && k <= 26)).toHaveLength(4);
    expect(f2(r.st[24]!.post.x[3]!)).toBe('1.11');
    expect(f2(r.s.truth[25]![3]!)).toBe('1.40');
    expect(CV.turn).toEqual({ speed: 1.4, at: 20, over: 2 });
  });
  it('q = 0.1: inside through the turn; straight-stretch error 0.37 → 0.50 m', () => {
    const lo = go('turn');
    const hi = go('turn', { ...D, q: 0.1 });
    expect(outside95(hi).filter((k) => k >= 18 && k <= 40)).toEqual([]);
    expect(f2(rms(posErr(lo).slice(9, 19)))).toBe('0.37');
    expect(f2(rms(posErr(hi).slice(9, 19)))).toBe('0.50');
  });
});
