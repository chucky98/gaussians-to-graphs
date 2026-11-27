/** Every concrete claim in post 26, checked against FactorGraphBuilder's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import { FGB, candidates, initialGuess, solve, structure } from '../../../src/lib/demos/factor-graph-builder';

const all = candidates();
const v = initialGuess();
const pick = (keep: (id: string) => boolean) => all.filter((c) => keep(c.id)).map((c) => c.factor);

describe('post 26', () => {
  it('13 candidate factors: a prior, 4 odometry, 8 landmark readings; 5 poses and 3 landmarks', () => {
    expect(all).toHaveLength(13);
    expect(all.filter((c) => c.kind === 'odometry')).toHaveLength(4);
    expect(all.filter((c) => c.kind === 'landmark')).toHaveLength(8);
    expect([FGB.poses.length, FGB.landmarks.length]).toEqual([5, 3]);
  });
  it('all on: J 31 × 21 with 135 of 651 nonzero; no free direction', () => {
    const s = structure(
      pick(() => true),
      v,
    );
    expect([s.rows, s.cols, s.jNonzeros.length, s.rows * s.cols, s.freeDirections]).toEqual([31, 21, 135, 651, 0]);
  });
  it('an odometry factor touches 6 columns, a landmark reading 5', () => {
    const s = structure(
      pick(() => true),
      v,
    );
    const cols = (b: { start: number; dim: number }) =>
      new Set(s.jNonzeros.filter(([r]) => r >= b.start && r < b.start + b.dim).map(([, c]) => c)).size;
    for (const b of s.rowBlocks.filter((b) => b.id.startsWith('odometry'))) expect(cols(b)).toBe(6);
    for (const b of s.rowBlocks.filter((b) => b.id.startsWith('range-bearing'))) expect(cols(b)).toBe(5);
  });
  it('Solve: 6 iterations, cost 463 → 5.64, RMS error 0.58 → 0.09 m', () => {
    const sol = solve(
      pick(() => true),
      v,
    );
    expect(sol.iterations.length - 1).toBe(6);
    expect(Math.round(sol.iterations[0]!.cost)).toBe(463);
    expect(sol.iterations.at(-1)!.cost.toFixed(2)).toBe('5.64');
    expect([sol.errorBefore.toFixed(2), sol.errorAfter.toFixed(2)]).toEqual(['0.58', '0.09']);
  });
  it('without the prior: 3 free directions; without l2 readings: 2; without odometry x1–x2: still solvable', () => {
    expect(
      structure(
        pick((id) => id !== 'prior'),
        v,
      ).freeDirections,
    ).toBe(3);
    const noL2 = structure(
      pick((id) => !id.endsWith('l2')),
      v,
    );
    expect(noL2.freeDirections).toBe(2);
    const off = noL2.colBlocks.find((b) => b.key === 'l2')!.start;
    for (let i = 0; i < 21; i++) for (const c of [off, off + 1]) expect(noL2.lambda.data[c * 21 + i]).toBe(0);
    expect(
      structure(
        pick((id) => id !== 'odo2'),
        v,
      ).freeDirections,
    ).toBe(0);
    expect(all.map((c) => c.id)).toEqual(expect.arrayContaining(['x1l0', 'x1l1', 'x2l0', 'x2l1']));
  });
  it('Λ is nonzero exactly where two unknowns share a factor', () => {
    const s = structure(
      pick(() => true),
      v,
    );
    const share = (a: string, b: string) =>
      a === b || all.some((c) => c.factor.keys.includes(a) && c.factor.keys.includes(b));
    for (const A of s.colBlocks)
      for (const B of s.colBlocks) {
        let nz = false;
        for (let i = 0; i < A.dim; i++)
          for (let j = 0; j < B.dim; j++) if (s.lambda.data[(A.start + i) * 21 + B.start + j] !== 0) nz = true;
        expect(nz).toBe(share(A.key, B.key));
      }
  });
});
