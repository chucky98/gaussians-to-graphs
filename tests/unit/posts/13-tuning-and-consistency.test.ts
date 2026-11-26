/** Every concrete claim in post 13, checked against TuningLab's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import { LAB, LAB_PRESETS, runLab, type LabParams } from '../../../src/lib/demos/tuning-lab';
import { averageBounds } from '../../../src/lib/filters/consistency';
import { kfRun } from '../../../src/lib/filters/kf';
import { update1 } from '../../../src/lib/filters/kf1d';
import { createRng } from '../../../src/lib/math/rng';
import { diag, maxAbsDiff, scale, vec } from '../../../src/lib/math/matrix';
import { cvModel } from '../../../src/lib/models/linear';

const f2 = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(2));
const tailMean = (v: number[]) => v.slice(LAB.skip).reduce((a, b) => a + b, 0) / (v.length - LAB.skip);
const outsideBand = (r: ReturnType<typeof runLab>) => {
  const run = r.runs[0]!;
  return run.post.filter((s, i) => Math.abs(s.x[0]! - run.truth[i + 1]![0]!) > 1.96 * Math.sqrt(s.P.data[0]!)).length;
};

describe('post 13: bounds', () => {
  it('M = 50, n_x = 4: [3.25, 4.82]; NIS [1.48, 2.59]; one run of 35 steps [1.39, 2.71]', () => {
    const b = averageBounds(4, 50);
    expect([f2(b.lo), f2(b.hi)]).toEqual(['3.25', '4.82']);
    const n = averageBounds(2, 50);
    expect([f2(n.lo), f2(n.hi)]).toEqual(['1.48', '2.59']);
    const o = averageBounds(2, LAB.steps - LAB.skip);
    expect(LAB.steps - LAB.skip).toBe(35);
    expect([f2(o.lo), f2(o.hi)]).toEqual(['1.39', '2.71']);
    expect([LAB.runs, LAB.nx, LAB.nz, LAB.skip]).toEqual([50, 4, 2, 5]);
  });
});

describe('post 13: presets', () => {
  it('well tuned: NEES 3.94, NIS 2.15, one-run NIS 2.13; the run never leaves its band', () => {
    const r = runLab(LAB_PRESETS.tuned);
    expect([f2(tailMean(r.avgNees)), f2(tailMean(r.avgNis)), f2(r.oneRunNis)]).toEqual(['3.94', '2.15', '2.13']);
    expect(r.verdict).toBe('consistent');
    expect(r.nisVerdict).toBe('consistent');
    expect(outsideBand(r)).toBe(0);
  });
  it('cameras 3× better: NEES 22.48, NIS 14.71, one run 14.66; out of band 18/40; claimed σ less than half the real error', () => {
    const r = runLab(LAB_PRESETS.overconfident);
    expect([f2(tailMean(r.avgNees)), f2(tailMean(r.avgNis)), f2(r.oneRunNis)]).toEqual(['22.48', '14.71', '14.66']);
    expect(outsideBand(r)).toBe(18);
    // Claimed x standard deviation vs the actual RMS x error over all runs and steps 6–40.
    let e2 = 0;
    let n = 0;
    for (const run of r.runs)
      run.post.forEach((s, i) => {
        if (i < LAB.skip) return;
        e2 += (s.x[0]! - run.truth[i + 1]![0]!) ** 2;
        n++;
      });
    const claimed = Math.sqrt(r.runs[0]!.post[LAB.steps - 1]!.P.data[0]!);
    expect(claimed).toBeLessThan(0.5 * Math.sqrt(e2 / n));
  });
  it('cameras 3× worse: NEES 2.08, NIS 0.40 (below); estimates nearly as good as the tuned filter', () => {
    const r = runLab(LAB_PRESETS.underconfident);
    expect([f2(tailMean(r.avgNees)), f2(tailMean(r.avgNis))]).toEqual(['2.08', '0.40']);
    expect(r.verdict).toBe('underconfident');
  });
  it('blind spot (q × 0.1, σ × 1.4): NIS 2.23 consistent, NEES 18.51 overconfident', () => {
    const p: LabParams = { trueQ: 0.01, trueSigma: 0.5, qFactor: 0.1, sigmaFactor: 1.4 };
    const r = runLab(p);
    expect([f2(tailMean(r.avgNis)), f2(tailMean(r.avgNees))]).toEqual(['2.23', '18.51']);
    expect(r.nisVerdict).toBe('consistent');
    expect(r.verdict).toBe('overconfident');
    // The slider positions reproduce exactly these factors.
    expect(+(10 ** -1).toPrecision(2)).toBe(0.1);
    expect(+(10 ** 0.15).toPrecision(2)).toBe(1.4);
  });
  it('q 1000× too small: NEES 900, NIS 13.29; out of band 27/40', () => {
    const r = runLab(LAB_PRESETS.divergent);
    expect([f2(tailMean(r.avgNees)), f2(tailMean(r.avgNis))]).toEqual(['900', '13.29']);
    expect(outsideBand(r)).toBe(27);
  });
});

describe('post 13: math claims', () => {
  it('scaling Q and R by c leaves the steady-state gain unchanged and scales P by c', () => {
    const c = 10;
    const a = cvModel(2, 1, 0.01, 0.5);
    const b = { ...a, Q: scale(a.Q, c), R: scale(a.R, c) };
    const zs = Array.from({ length: 200 }, () => vec([0, 0]));
    const init = { x: vec([0, 0, 0, 0]), P: diag([1, 1, 1, 1]) };
    const sa = kfRun(init, a, zs).at(-1)!;
    const sb = kfRun(init, b, zs).at(-1)!;
    expect(maxAbsDiff(sa.update!.K, sb.update!.K)).toBeLessThan(1e-9);
    expect(maxAbsDiff(scale(sa.post.P, c), sb.post.P)).toBeLessThan(1e-9);
  });
  it('P = R = 1, optimal gain 0.5; with gain 1.5 the short form gives −0.5, Joseph 2.5 (= the true variance)', () => {
    expect(update1({ x: 0, P: 1 }, 0, 1).K).toBe(0.5);
    const K = 1.5;
    expect((1 - K) * 1).toBe(-0.5);
    const joseph = (1 - K) ** 2 * 1 + K * K * 1;
    expect(joseph).toBe(2.5);
    // Simulate: x ~ N(0, 1), z = x + v, v ~ N(0, 1); error of x̂ = K z is (K − 1) x + K v.
    const rng = createRng(13);
    let s = 0;
    const n = 200000;
    for (let i = 0; i < n; i++) {
      const x = rng.normal();
      const z = x + rng.normal();
      s += (K * z - x) ** 2;
    }
    expect(s / n).toBeCloseTo(2.5, 1);
  });
});
