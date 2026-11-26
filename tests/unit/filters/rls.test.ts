import { describe, expect, it } from 'vitest';
import { batchSolution, rlsRun, rlsUpdate } from '../../../src/lib/filters/rls';
import { diag, isSymmetricPSD, maxAbsDiff, vec } from '../../../src/lib/math/matrix';
import { fitLine } from '../../../src/lib/math/leastsquares';
import { createRng } from '../../../src/lib/math/rng';

const rng = createRng(808);
const N = 60;
const us = Array.from({ length: N }, () => rng.uniformRange(20, 100));
const rows = us.map((u) => vec([1, u]));
const ys = us.map((u) => -1 + 0.25 * u + 0.8 * rng.normal());
const init = { x: vec([0, 0]), P: diag([100, 1]) };

describe('RLS (post 08 invariants)', () => {
  it('with β = 1, RLS equals the batch MAP solution after every step', () => {
    const run = rlsRun(init, rows, ys, 0.64);
    for (const k of [0, 1, 5, 20, N - 1]) {
      const b = batchSolution(init, rows.slice(0, k + 1), ys.slice(0, k + 1), 0.64);
      expect(Math.abs(run[k]!.x[0]! - b.x[0]!)).toBeLessThan(1e-9);
      expect(Math.abs(run[k]!.x[1]! - b.x[1]!)).toBeLessThan(1e-11);
      expect(maxAbsDiff(run[k]!.P, b.P)).toBeLessThan(1e-10);
    }
  });

  it('with a vague prior, RLS converges to ordinary least squares', () => {
    const vague = { x: vec([0, 0]), P: diag([1e10, 1e8]) };
    const last = rlsRun(vague, rows, ys, 0.64).at(-1)!;
    const ls = fitLine(us, ys);
    expect(last.x[0]).toBeCloseTo(ls.intercept, 5);
    expect(last.x[1]).toBeCloseTo(ls.slope, 7);
  });

  it('with β < 1, RLS equals exponentially weighted batch least squares', () => {
    for (const beta of [0.98, 0.9, 0.8]) {
      const run = rlsRun(init, rows, ys, 0.64, beta);
      const b = batchSolution(init, rows, ys, 0.64, beta);
      expect(Math.abs(run.at(-1)!.x[0]! - b.x[0]!)).toBeLessThan(1e-8);
      expect(Math.abs(run.at(-1)!.x[1]! - b.x[1]!)).toBeLessThan(1e-10);
      expect(maxAbsDiff(run.at(-1)!.P, b.P)).toBeLessThan(1e-10);
    }
  });

  it('P stays symmetric PSD and shrinks with data (β = 1); the gain is P a / (r + aᵀPa)', () => {
    const run = rlsRun(init, rows, ys, 0.64);
    let prevTrace = Infinity;
    for (const st of run) {
      expect(isSymmetricPSD(st.P)).toBe(true);
      const tr = st.P.data[0]! + st.P.data[3]!;
      expect(tr).toBeLessThanOrEqual(prevTrace + 1e-12);
      prevTrace = tr;
    }
    const s = rlsUpdate(init, vec([1, 50]), 11, 0.64);
    const Pa = [100 * 1, 1 * 50];
    const den = 0.64 + 1 * Pa[0]! + 50 * Pa[1]!;
    expect(s.K[0]).toBeCloseTo(Pa[0]! / den, 14);
    expect(s.K[1]).toBeCloseTo(Pa[1]! / den, 14);
    expect(s.innovation).toBe(11);
  });

  it('validates arguments', () => {
    expect(() => rlsUpdate(init, vec([1, 1]), 0, 0.64, 0)).toThrow();
    expect(() => rlsUpdate(init, vec([1, 1]), 0, 0.64, 1.1)).toThrow();
    expect(() => rlsUpdate(init, vec([1, 1]), 0, 0)).toThrow();
  });
});
