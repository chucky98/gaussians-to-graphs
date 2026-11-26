/** Every concrete claim in post 18, checked against FilterVsSmoother's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import { FVS, estimates, rmsErr, scenario } from '../../../src/lib/demos/filter-vs-smoother';
import { TRACK } from '../../../src/lib/demos/tracker-1d';

const d = scenario();
const all = estimates(d, FVS.steps, FVS.lagDefault);
const gapRms = (tr: { mean: number[] }) =>
  Math.sqrt(
    Array.from({ length: 10 }, (_, i) => (tr.mean[16 + i]! - d.truth[16 + i]!) ** 2).reduce((a, b) => a + b, 0) / 10,
  );

describe('post 18: setup', () => {
  it("post 11's run: 40 steps, no fixes for steps 16–25, seed 7; at step 25 the filter was ± 0.69 m (95%) and 0.58 m off", () => {
    expect([FVS.steps, TRACK.outage.from, TRACK.outage.to - 1, FVS.seed]).toEqual([40, 16, 25, 7]);
    expect((1.96 * all.filter.sd[25]!).toFixed(2)).toBe('0.69');
    expect((all.filter.mean[25]! - d.truth[25]!).toFixed(2)).toBe('0.58');
  });
});

describe('post 18: the full run', () => {
  it('RMS 0.250 m (filter) vs 0.111 m (smoother), less than half; in the gap 0.385 vs 0.155', () => {
    expect(rmsErr(all.filter, d.truth).toFixed(3)).toBe('0.250');
    expect(rmsErr(all.smooth, d.truth).toFixed(3)).toBe('0.111');
    expect(rmsErr(all.smooth, d.truth)).toBeLessThan(0.5 * rmsErr(all.filter, d.truth));
    expect(gapRms(all.filter).toFixed(3)).toBe('0.385');
    expect(gapRms(all.smooth).toFixed(3)).toBe('0.155');
  });
  it('smoother = batch to within 1e-13 m', () => {
    const diff = Math.max(...all.smooth.mean.map((m, k) => Math.abs(m - all.batch.mean[k]!)));
    expect(diff).toBeLessThan(1e-13);
  });
  it('σ: filter peaks at the end of the gap (0.354 m at 25); smoother near the middle (0.200 m at 20), 0.166 m at 25', () => {
    const gap = (sd: number[]) => sd.slice(16, 26);
    const fPeak = gap(all.filter.sd).indexOf(Math.max(...gap(all.filter.sd))) + 16;
    const sPeak = gap(all.smooth.sd).indexOf(Math.max(...gap(all.smooth.sd))) + 16;
    expect(fPeak).toBe(25);
    expect(all.filter.sd[25]!.toFixed(3)).toBe('0.354');
    expect(sPeak).toBeGreaterThanOrEqual(19);
    expect(sPeak).toBeLessThanOrEqual(21);
    expect(all.smooth.sd[20]!.toFixed(3)).toBe('0.200');
    expect(all.smooth.sd[25]!.toFixed(3)).toBe('0.166');
  });
  it('the smoother is never less certain than the filter, and equal at the last step', () => {
    for (let k = 0; k <= 40; k++) expect(all.smooth.sd[k]!).toBeLessThanOrEqual(all.filter.sd[k]! + 1e-12);
    expect(all.smooth.sd[40]).toBeCloseTo(all.filter.sd[40]!, 14);
  });
});

describe('post 18: data arriving', () => {
  it('until step 25 the smoothed estimate of step 20 equals the filter; at 26 its error drops 0.41 → 0.13 m', () => {
    const at25 = estimates(d, 25, 3);
    expect(at25.smooth.mean[20]).toBeCloseTo(at25.filter.mean[20]!, 9);
    expect((at25.smooth.mean[20]! - d.truth[20]!).toFixed(2)).toBe('0.41');
    const at26 = estimates(d, 26, 3);
    expect((at26.smooth.mean[20]! - d.truth[20]!).toFixed(2)).toBe('0.13');
  });
  it('fixed lag: L = 1 → 0.212 m, L = 3 → 0.171 m, L = 10 → 0.121 m', () => {
    const r = (L: number) => rmsErr(estimates(d, 40, L).lag, d.truth).toFixed(3);
    expect([r(1), r(3), r(10)]).toEqual(['0.212', '0.171', '0.121']);
  });
});
