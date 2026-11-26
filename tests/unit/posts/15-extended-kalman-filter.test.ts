/** Every concrete claim in post 15, checked against EKFLocalization's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  EKF_PRESETS as P,
  HALL,
  neesCoverage,
  posErr,
  route,
  runEkf,
  type EkfParams,
  type EkfRun,
} from '../../../src/lib/demos/ekf-localization';
import { eigSym2, getBlock } from '../../../src/lib/math/matrix';

const rms = (a: number[]) => Math.sqrt(a.reduce((x, y) => x + y * y, 0) / a.length);
const errs = (r: EkfRun) => r.steps.map((s) => posErr(s.post.x, s.truth));
const r95 = (r: EkfRun) =>
  r.steps.map((s) => Math.sqrt(5.991 * Math.max(...eigSym2(getBlock(s.post.P, 0, 0, 2, 2)).values)));
const go = (p: EkfParams) => runEkf(p, HALL.seed);

describe('post 15: setup', () => {
  it('σv 0.1 m/s, σω 0.05 rad/s, σr 0.1 m, σφ 2°, range 5 m, dt 0.5 s, 120 steps at 1 m/s', () => {
    expect(P.default).toMatchObject({ sigmaV: 0.1, sigmaW: 0.05, sigmaR: 0.1, sigmaPhiDeg: 2, range: 5 });
    expect(HALL.dt).toBe(0.5);
    expect(route()).toHaveLength(120);
    expect(route().every((u) => u.v === 1)).toBe(true);
  });
});

describe('post 15: default run', () => {
  const r = go(P.default);
  it('EKF RMS 0.09 m, max 0.29 m; odometry ends 1.92 m off; NEES inside at 118 of 120', () => {
    expect(rms(errs(r)).toFixed(2)).toBe('0.09');
    expect(Math.max(...errs(r)).toFixed(2)).toBe('0.29');
    expect(posErr(r.steps.at(-1)!.odom, r.steps.at(-1)!.truth).toFixed(2)).toBe('1.92');
    expect(Math.round(neesCoverage(r) * 120)).toBe(118);
  });
  it('around t = 43 s no marker is in view for three steps; the 95% radius peaks at 0.71 m there', () => {
    const blind = r.steps.map((s, i) => (s.seen.length === 0 ? i + 1 : 0)).filter(Boolean);
    expect(blind).toEqual([86, 87, 88]);
    expect(blind.map((k) => k * HALL.dt)).toEqual([43, 43.5, 44]);
    const rad = r95(r);
    const peak = rad.indexOf(Math.max(...rad)) + 1;
    expect(Math.max(...rad).toFixed(2)).toBe('0.71');
    expect(peak).toBeGreaterThanOrEqual(86);
    expect(peak).toBeLessThanOrEqual(89);
  });
  it('range 10 m: up to 7 markers, error 0.05 m; range 2 m: error 0.54 m', () => {
    const wide = go({ ...P.default, range: 10 });
    expect(Math.max(...wide.steps.map((s) => s.seen.length))).toBe(7);
    expect(rms(errs(wide)).toFixed(2)).toBe('0.05');
    expect(rms(errs(go({ ...P.default, range: 2 }))).toFixed(2)).toBe('0.54');
  });
  it('no markers: the estimate is exactly the odometry path; 95% radius 5.6 m at the end covers the 1.92 m drift', () => {
    const b = go(P.blind);
    for (const s of b.steps) {
      expect(s.post.x[0]).toBeCloseTo(s.odom[0]!, 12);
      expect(s.post.x[1]).toBeCloseTo(s.odom[1]!, 12);
    }
    expect(r95(b).at(-1)!.toFixed(1)).toBe('5.6');
    expect(posErr(b.steps.at(-1)!.post.x, b.steps.at(-1)!.truth).toFixed(2)).toBe('1.92');
  });
});

describe('post 15: break it', () => {
  const r = go(P.lost);
  it('starts 4.5 m and 150° off, claiming σ = 3 m and 180°', () => {
    expect(Math.hypot(P.lost.initErr[0], P.lost.initErr[1]).toFixed(1)).toBe('4.5');
    expect(P.lost.initErr[2]).toBe(150);
    expect(P.lost.initSd).toEqual([3, 3, 180]);
  });
  it('error peaks at 6.1 m; from step 23 (t = 11.5 s) on it stays within 0.5 m', () => {
    const e = errs(r);
    expect(Math.max(...e).toFixed(1)).toBe('6.1');
    expect(e[21]!).toBeGreaterThan(0.5);
    for (let k = 22; k < e.length; k++) expect(e[k]!).toBeLessThanOrEqual(0.5);
  });
  it('NEES inside at 86 of 120; above its range at all of steps 1–31 and only twice afterwards', () => {
    expect(Math.round(neesCoverage(r) * 120)).toBe(86);
    const above = r.steps.map((s, i) => (s.nees > 9.3484 ? i + 1 : 0)).filter(Boolean);
    expect(above.slice(0, 31)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(above.length - 31).toBe(2);
  });
  it('range 3 m: at most one marker in view; still 1.12 m off at the end', () => {
    const r3 = go({ ...P.lost, range: 3 });
    expect(Math.max(...r3.steps.map((s) => s.seen.length))).toBe(1);
    expect(posErr(r3.steps.at(-1)!.post.x, r3.steps.at(-1)!.truth).toFixed(2)).toBe('1.12');
  });
});

describe('post 15: seed 155 is typical', () => {
  it('EKF RMS and odometry drift within 10% of the medians over seeds 1–200', () => {
    const st = Array.from({ length: 200 }, (_, i) => {
      const r = runEkf(P.default, i + 1);
      return [rms(errs(r)), posErr(r.steps.at(-1)!.odom, r.steps.at(-1)!.truth)];
    });
    for (const c of [0, 1]) {
      const med = st.map((x) => x[c]!).sort((a, b) => a - b)[100]!;
      expect(Math.abs(st[HALL.seed - 1]![c]! / med - 1)).toBeLessThan(0.1);
    }
  });
});
