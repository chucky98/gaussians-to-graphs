/** Every concrete claim in post 19, checked against InfoVsCov's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import { INFO, endToEndCorrelation, matricesAt } from '../../../src/lib/demos/info-vs-cov';

describe('post 19: corridor', () => {
  it('40 steps: 41 unknowns; Ω has 121 nonzeros (7%) = (3N + 1) n²; P all 1,681', () => {
    const m = matricesAt('corridor', 40);
    expect(INFO.maxSteps.corridor).toBe(40);
    expect(m.size).toBe(41);
    expect(m.nnzOmega).toBe(121);
    expect(m.nnzOmega).toBe((3 * 40 + 1) * 1);
    expect(Math.round((100 * 121) / 1681)).toBe(7);
    expect(m.nnzP).toBe(1681);
  });
  it('each step adds exactly 3 nonzeros to Ω', () => {
    for (let k = 1; k < 40; k++)
      expect(matricesAt('corridor', k + 1).nnzOmega - matricesAt('corridor', k).nnzOmega).toBe(3);
  });
  it('first-to-last correlation: 0.07 after 10 steps, 3.4 × 10⁻⁶ after 40 (never zero)', () => {
    expect(endToEndCorrelation(matricesAt('corridor', 10)).toFixed(2)).toBe('0.07');
    const c = endToEndCorrelation(matricesAt('corridor', 40));
    expect(c.toExponential(1)).toBe('3.4e-6');
    expect(c).not.toBe(0);
  });
});

describe('post 19: forklift in an aisle', () => {
  it('2 per step; after 25 steps Ω has 304 of 2,704 nonzero, 12 more per step; P full', () => {
    const m = matricesAt('aisle', 25);
    expect([m.n, m.size, m.nnzOmega, m.nnzP]).toEqual([2, 52, 304, 2704]);
    expect(m.nnzOmega).toBe((3 * 25 + 1) * 4);
    expect(matricesAt('aisle', 11).nnzOmega - matricesAt('aisle', 10).nnzOmega).toBe(12);
  });
});
