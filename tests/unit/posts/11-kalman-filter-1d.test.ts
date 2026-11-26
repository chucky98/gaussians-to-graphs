/** Every concrete claim in post 11, checked against the widgets' defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import { PRODUCT_DEFAULTS as PD, combine } from '../../../src/lib/demos/gaussian-product';
import {
  TRACK,
  TRACKER_DEFAULTS as D,
  coverage,
  makeScenario,
  runTracker,
  steady,
  type TrackerParams,
  type TrackerPreset,
} from '../../../src/lib/demos/tracker-1d';

const f2 = (v: number) => v.toFixed(2);
const f3 = (v: number) => v.toFixed(3);
const run = (preset: TrackerPreset = 'steady', p: TrackerParams = D) => {
  const s = makeScenario(preset, p, TRACK.seed);
  return { s, st: runTracker(s, p) };
};

describe('post 11: GaussianProduct', () => {
  it('defaults: prediction 12.0 ± 0.5 m, fix 12.8 ± 0.3 m → gain 0.74, 12.59 ± 0.26 m, narrower than both', () => {
    expect(PD).toEqual({ mu1: 12, s1: 0.5, mu2: 12.8, s2: 0.3 });
    const r = combine(PD);
    expect([f2(r.K), f2(r.mean), f2(r.sigma)]).toEqual(['0.74', '12.59', '0.26']);
    expect(r.sigma).toBeLessThan(Math.min(PD.s1, PD.s2));
  });
  it('both σ = 0.4: gain exactly 0.5, halfway at 12.40 m, σ = 0.4/√2 = 0.28', () => {
    const r = combine({ ...PD, s1: 0.4, s2: 0.4 });
    expect(r.K).toBe(0.5);
    expect(f2(r.mean)).toBe('12.40');
    expect(r.sigma).toBeCloseTo(0.4 / Math.SQRT2, 14);
    expect(f2(r.sigma)).toBe('0.28');
  });
  it('σ₂ = 2 m: gain 0.06, the estimate moves 5 cm to 12.05 m', () => {
    const r = combine({ ...PD, s2: 2 });
    expect(f2(r.K)).toBe('0.06');
    expect(f2(r.mean)).toBe('12.05');
  });
  it('a reading at 16 m: estimate 14.94 m, σ still 0.26 m (independent of the disagreement)', () => {
    const r = combine({ ...PD, mu2: 16 });
    expect(f2(r.mean)).toBe('14.94');
    expect(r.sigma).toBeCloseTo(combine(PD).sigma, 15);
  });
  it('intuition: 0.4 m and 0.1 m errors combine to about 0.41 m (variances add to 0.17)', () => {
    expect(0.4 ** 2 + 0.1 ** 2).toBeCloseTo(0.17, 15);
    expect(f2(Math.sqrt(0.17))).toBe('0.41');
  });
});

describe('post 11: Tracker1D', () => {
  it('model: 40 steps of 1 m; Q = α² = 0.01 m², R = 0.09 m²; prior 0 ± 1 m', () => {
    expect([TRACK.steps, TRACK.move, TRACK.x0, TRACK.sigma0]).toEqual([40, 1, 0, 1]);
    expect(D.alpha ** 2).toBeCloseTo(0.01, 15);
    expect(D.sigmaZ ** 2).toBeCloseTo(0.09, 15);
  });
  it('steady state: K∞ = 0.282, √P∞ = 0.159 m (predicted 0.188 m), matching the closed form', () => {
    const ss = steady(D);
    expect([f3(ss.K), f3(Math.sqrt(ss.Ppost)), f3(Math.sqrt(ss.Ppred))]).toEqual(['0.282', '0.159', '0.188']);
    const Q = 0.01;
    const R = 0.09;
    expect(ss.Ppost + Q).toBeCloseTo(0.5 * (Q + Math.sqrt(Q * Q + 4 * Q * R)), 14);
  });
  it('gains 0.918, 0.507, 0.382, 0.330, 0.306; the first prediction is ± 1 m', () => {
    const { st } = run();
    expect(st.slice(0, 5).map((x) => f3(x.K))).toEqual(['0.918', '0.507', '0.382', '0.330', '0.306']);
    expect(f2(Math.sqrt(st[0]!.prior.P))).toBe('1.00');
  });
  it('by step 8 both teeth are within 2 mm of the steady values', () => {
    const { st } = run();
    const ss = steady(D);
    for (let k = 8; k <= 40; k++) {
      expect(Math.abs(Math.sqrt(st[k - 1]!.prior.P) - Math.sqrt(ss.Ppred))).toBeLessThanOrEqual(0.002);
      expect(Math.abs(Math.sqrt(st[k - 1]!.post.P) - Math.sqrt(ss.Ppost))).toBeLessThanOrEqual(0.002);
    }
  });
  it('fixes RMS 0.31 m, estimates 0.15 m; 38 of 40 inside the 95% band', () => {
    const { s, st } = run();
    const rms = (e: number[]) => Math.sqrt(e.reduce((a, b) => a + b * b, 0) / e.length);
    expect(f2(rms(s.zs.map((z, i) => z! - s.truth[i + 1]!)))).toBe('0.31');
    expect(f2(rms(st.map((x, i) => x.post.x - s.truth[i + 1]!)))).toBe('0.15');
    expect(Math.round(coverage(st, s.truth) * 40)).toBe(38);
  });
  it('seed 7 is typical: filter RMS and coverage near the medians over seeds 1–200', () => {
    const stats = Array.from({ length: 200 }, (_, i) => {
      const s = makeScenario('steady', D, i + 1);
      const st = runTracker(s, D);
      return {
        rms: Math.sqrt(st.reduce((a, x, k) => a + (x.post.x - s.truth[k + 1]!) ** 2, 0) / st.length),
        cov: coverage(st, s.truth),
      };
    });
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[100]!;
    expect(Math.abs(med(stats.map((x) => x.rms)) - stats[TRACK.seed - 1]!.rms)).toBeLessThan(0.015);
    expect(med(stats.map((x) => x.cov))).toBe(stats[TRACK.seed - 1]!.cov);
  });
  it('α = 0.02 m: K∞ = 0.064, √P∞ = 0.076 m', () => {
    const ss = steady({ ...D, alpha: 0.02 });
    expect([f3(ss.K), f3(Math.sqrt(ss.Ppost))]).toEqual(['0.064', '0.076']);
  });
});

describe('post 11: outage preset', () => {
  const { s, st } = run('outage');
  it('no fixes for steps 16–25; σ climbs from 0.159 m to 0.354 m by step 25', () => {
    expect([TRACK.outage.from, TRACK.outage.to - 1]).toEqual([16, 25]);
    for (let k = 16; k <= 25; k++) expect(s.zs[k - 1]).toBeNull();
    expect(f3(Math.sqrt(st[14]!.post.P))).toBe('0.159');
    expect(f3(Math.sqrt(st[24]!.post.P))).toBe('0.354');
  });
  it('error 0.58 m at step 25, inside the ± 0.69 m band', () => {
    const e = st[24]!.post.x - s.truth[25]!;
    const band = 1.96 * Math.sqrt(st[24]!.post.P);
    expect(f2(Math.abs(e))).toBe('0.58');
    expect(f2(band)).toBe('0.69');
    expect(Math.abs(e)).toBeLessThan(band);
  });
  it('step 26: gain 0.601, σ 0.233 m; step 30: σ 0.164 m', () => {
    expect(f3(st[25]!.K)).toBe('0.601');
    expect(f3(Math.sqrt(st[25]!.post.P))).toBe('0.233');
    expect(f3(Math.sqrt(st[29]!.post.P))).toBe('0.164');
  });
});
