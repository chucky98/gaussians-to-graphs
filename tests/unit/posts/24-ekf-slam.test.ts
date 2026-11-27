/** Every concrete claim in post 24, checked against EKFSLAM's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  SLAM24,
  closureStep24,
  consistencyRuns,
  meanLandmarkSd,
  robotError,
  robotSd,
  run24,
  strongShare,
} from '../../../src/lib/demos/ekf-slam-run';
import { canonicalCorrelation } from '../../../src/lib/filters/ekf-slam';

const r = run24();
const kc = closureStep24(r);
const st = (k: number) => r.steps[k]!.state;
const f2 = (v: number) => v.toFixed(2);
const pct = (v: number) => Math.round(100 * v);

describe('post 24: scenario and cost table', () => {
  it('16 landmarks, 6 m circle, range 3.5 m, 240 steps, seed 18; closure at step 131', () => {
    expect(SLAM24.base.landmarks).toHaveLength(16);
    expect([SLAM24.base.radius, SLAM24.base.range, SLAM24.base.steps, SLAM24.seed]).toEqual([6, 3.5, 240, 18]);
    expect(kc).toBe(131);
  });
  it('the cost table: (3 + 2n)² for n = 16, 100, 1,000, 10,000', () => {
    expect([16, 100, 1000, 10000].map((n) => (3 + 2 * n) ** 2)).toEqual([1225, 41209, 4012009, 400120009]);
  });
  it('the closure reading is of landmark 15, one of the two mapped at the first step', () => {
    expect(r.steps[1]!.added.sort()).toEqual([0, 15]);
    expect(r.steps[kc]!.seen).toContain(15);
    expect(r.steps[kc - 1]!.seen).not.toContain(15);
  });
});

describe('post 24: try this', () => {
  it('step 90: 12 landmarks, 27 × 27 = 729 entries, robot 0.54 m, 73% strong', () => {
    const s = st(90);
    expect([s.ids.length, s.x.length, s.x.length ** 2]).toEqual([12, 27, 729]);
    expect(f2(robotSd(s))).toBe('0.54');
    expect(pct(strongShare(s))).toBe(73);
  });
  it('step 130: all 16, 1,225 entries, robot 0.53, landmarks 0.38, 55%; step 131: 0.25, 0.30, 74%', () => {
    const b = st(130);
    const a = st(131);
    expect([b.ids.length, b.x.length ** 2]).toEqual([16, 1225]);
    expect([f2(robotSd(b)), f2(meanLandmarkSd(b)), pct(strongShare(b))]).toEqual(['0.53', '0.38', 55]);
    expect([f2(robotSd(a)), f2(meanLandmarkSd(a)), pct(strongShare(a))]).toEqual(['0.25', '0.30', 74]);
    expect(robotSd(a)).toBeLessThan(robotSd(b) / 2 + 0.01);
  });
  it('step 240: 86% strong', () => {
    expect(pct(strongShare(st(240)))).toBe(86);
  });
  it('more heading noise: at step 240 the error is 1.56 m against a reported 0.50 m', () => {
    const h = run24('high');
    expect(f2(robotError(h, 240))).toBe('1.56');
    expect(f2(robotSd(h.steps[240]!.state))).toBe('0.50');
    expect(robotError(h, 240) / robotSd(h.steps[240]!.state)).toBeGreaterThan(3);
  });
});

describe('post 24: how the matrix fills in', () => {
  const avgByGap = (k: number, gap: number) => {
    const s = st(k);
    const v: number[] = [];
    for (let a = 0; a + gap < s.ids.length; a++) v.push(canonicalCorrelation(s, a, a + gap));
    return v.reduce((x, y) => x + y, 0) / v.length;
  };
  it('step 130: neighbours in mapping order 0.96, first–last 0.38; step 131: 0.58; step 240: 0.79', () => {
    expect(f2(avgByGap(130, 1))).toBe('0.96');
    expect(f2(avgByGap(130, 15))).toBe('0.38');
    expect(f2(avgByGap(131, 15))).toBe('0.58');
    expect(f2(avgByGap(240, 15))).toBe('0.79');
    for (let g = 2; g <= 15; g++) expect(avgByGap(130, g)).toBeLessThanOrEqual(avgByGap(130, g - 1));
  });
});

describe('post 24: inconsistency over 50 runs', () => {
  const above = (a: Float64Array, hi: number, from: number, to: number) =>
    Array.from(a.slice(from, to + 1)).filter((x) => x > hi).length;
  const mean = (a: Float64Array, from: number, to: number) =>
    Array.from(a.slice(from, to + 1)).reduce((s, x) => s + x, 0) / (to - from + 1);
  it('default: band 2.36–3.72; above it at 2 of 121 steps in lap 1, 68 of 110 after; last 40 average 3.90', () => {
    const c = consistencyRuns('default');
    expect([f2(c.bounds.lo), f2(c.bounds.hi)]).toEqual(['2.36', '3.72']);
    expect(above(c.nees, c.bounds.hi, 10, 130)).toBe(2);
    expect(above(c.nees, c.bounds.hi, 131, 240)).toBe(68);
    expect(f2(mean(c.nees, 200, 240))).toBe('3.90');
  });
  it('more heading noise: above the band at all 110 steps after the closure; last 40 average 7.39', () => {
    const c = consistencyRuns('high');
    expect(above(c.nees, c.bounds.hi, 131, 240)).toBe(110);
    expect(f2(mean(c.nees, 200, 240))).toBe('7.39');
  });
});
