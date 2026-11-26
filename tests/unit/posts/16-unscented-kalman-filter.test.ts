/** Every concrete claim in post 16, checked against the widgets' defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import { compare, utDefaults } from '../../../src/lib/demos/unscented-transform';
import {
  PROP_DEFAULTS,
  defaultParams,
  standardDraws,
  type FnId,
  type Params,
} from '../../../src/lib/demos/nonlinear-propagation';
import {
  COMPARE,
  meanNees,
  neesCoverage,
  posErr,
  rmsErr,
  runCompare,
  filterHall,
  simulateHall,
} from '../../../src/lib/demos/ekf-localization';
import type { UtParams } from '../../../src/lib/filters/ukf';

const pct = (v: number) => (100 * v).toFixed(1);
const run = (id: FnId, over: Params = {}, ut?: UtParams) => {
  const dim = id === 'polar' || id === 'linear' ? 2 : 1;
  return compare(
    id,
    { ...defaultParams(id), ...over },
    standardDraws(PROP_DEFAULTS.seed, PROP_DEFAULTS.n, dim),
    ut ?? utDefaults(dim),
  );
};

describe('post 16: UnscentedTransform', () => {
  it('defaults: α = 1, β = 0, κ = 3 − n; five sigma points for the 2D polar case', () => {
    expect(utDefaults(2)).toEqual({ alpha: 1, beta: 0, kappa: 1 });
    expect(utDefaults(1)).toEqual({ alpha: 1, beta: 0, kappa: 2 });
    expect(run('polar').sigmaIn).toHaveLength(5);
    expect(run('square').sigmaIn).toHaveLength(3);
  });
  it('polar at σθ = 25°: UT 93.6% inside, mean error < 0.2 mm; samples 93.4% (mean 9 mm off); linearized 70.0%, 18 cm off', () => {
    const r = run('polar');
    expect(pct(r.insideUt)).toBe('93.6');
    expect(r.meanErrUt).toBeLessThan(2e-4);
    expect(pct(r.insideMc)).toBe('93.4');
    expect((1000 * r.meanErrMc).toFixed(0)).toBe('9');
    expect(pct(r.insideLin)).toBe('70.0');
    expect((100 * r.meanErrLin).toFixed(0)).toBe('18');
    expect(r.meanErrUt).toBeLessThan(r.meanErrMc);
  });
  it('σθ = 50°: linearized 40.2%, 0.63 m off; UT 94.2%. σθ = 5°: all three within a point of each other', () => {
    const w = run('polar', { sigmaT: 50 });
    expect(pct(w.insideLin)).toBe('40.2');
    expect(w.meanErrLin.toFixed(2)).toBe('0.63');
    expect(pct(w.insideUt)).toBe('94.2');
    const n = run('polar', { sigmaT: 5 });
    const v = [n.insideLin, n.insideUt, n.insideMc];
    expect(Math.max(...v) - Math.min(...v)).toBeLessThan(0.01);
  });
  it('x²: linearized variance 0.250 and mean 0.25 off; UT exact mean and variance 0.375', () => {
    const r = run('square');
    expect(r.lin.cov.data[0]!.toFixed(3)).toBe('0.250');
    expect(r.meanErrLin.toFixed(2)).toBe('0.25');
    expect(r.meanErrUt).toBeLessThan(1e-12);
    expect(r.ut.cov.data[0]!).toBeCloseTo(r.exactVar!, 12);
    expect(r.exactVar!.toFixed(3)).toBe('0.375');
  });
  it('polar with α = 0.1: UT holds only 74.3% but its mean stays accurate', () => {
    const r = run('polar', {}, { alpha: 0.1, beta: 0, kappa: 1 });
    expect(pct(r.insideUt)).toBe('74.3');
    expect(r.meanErrUt).toBeLessThan(0.01);
  });
});

describe('post 16: UKFvsEKF', () => {
  it('rough = σω 0.15 rad/s and range 3 m; seed 15', () => {
    expect(COMPARE.scenarios.rough).toMatchObject({ sigmaW: 0.15, range: 3 });
    expect(COMPARE.scenarios.mild).toMatchObject({ sigmaW: 0.05, range: 5 });
    expect(COMPARE.seed).toBe(15);
  });
  it('mild: the estimates never differ by more than 1.8 cm', () => {
    const c = runCompare('mild');
    const d = Math.max(...c.ekf.steps.map((s, i) => posErr(s.post.x, c.ukf.steps[i]!.post.x)));
    expect((100 * d).toFixed(1)).toBe('1.8');
  });
  it('rough: RMS 0.66 vs 0.65 m; NEES 4.66 vs 3.54; inside 107 vs 115 of 120', () => {
    const c = runCompare('rough');
    expect([rmsErr(c.ekf).toFixed(2), rmsErr(c.ukf).toFixed(2)]).toEqual(['0.66', '0.65']);
    expect([meanNees(c.ekf).toFixed(2), meanNees(c.ukf).toFixed(2)]).toEqual(['4.66', '3.54']);
    expect([Math.round(neesCoverage(c.ekf) * 120), Math.round(neesCoverage(c.ukf) * 120)]).toEqual([107, 115]);
  });
  it('over seeds 1–100 of rough: EKF ends > 1 m off in 38 runs, UKF in 28', () => {
    const p = COMPARE.scenarios.rough;
    let fe = 0;
    let fu = 0;
    for (let s = 1; s <= 100; s++) {
      const sim = simulateHall(p, s);
      const end = sim.truths.at(-1)!;
      if (posErr(filterHall('ekf', sim, p).steps.at(-1)!.post.x, end) > 1) fe++;
      if (posErr(filterHall('ukf', sim, p).steps.at(-1)!.post.x, end) > 1) fu++;
    }
    expect([fe, fu]).toEqual([38, 28]);
  }, 30_000);
  it('seed 15 is typical of rough: both filters’ NEES within 20% of their medians over seeds 1–100', () => {
    const p = COMPARE.scenarios.rough;
    const rows = Array.from({ length: 100 }, (_, i) => {
      const sim = simulateHall(p, i + 1);
      return [meanNees(filterHall('ekf', sim, p)), meanNees(filterHall('ukf', sim, p))];
    });
    for (const c of [0, 1]) {
      const med = rows.map((r) => r[c]!).sort((a, b) => a - b)[50]!;
      expect(Math.abs(rows[COMPARE.seed - 1]![c]! / med - 1)).toBeLessThan(0.2);
    }
  }, 30_000);
});
