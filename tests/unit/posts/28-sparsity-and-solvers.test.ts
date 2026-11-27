/** Every concrete claim in post 28, checked against the widgets' defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import { SPARSE, blockPattern, marginalizeView, orderingView } from '../../../src/lib/demos/sparsity';
import { defaultRequest, runPoseGraph } from '../../../src/lib/demos/pose-graph-demo';

const a = blockPattern();

describe('post 28: orderings', () => {
  it('120 poses; Λ has 249 nonzero blocks in its lower triangle; dense L would have 7,260', () => {
    expect(SPARSE.poses).toBe(120);
    expect((orderingView(a, 'natural').lambdaBlocks + 120) / 2).toBe(249);
    expect((120 * 121) / 2).toBe(7260);
  });
  it('fill: natural 476 (L 725), random 240, RCM 149, minimum degree 117 (< a quarter of natural)', () => {
    const v = (k: 'natural' | 'random' | 'rcm' | 'mindegree') => orderingView(a, k);
    expect([v('natural').factorBlocks, v('natural').fill]).toEqual([725, 476]);
    expect([v('random').fill, v('rcm').fill, v('mindegree').fill]).toEqual([240, 149, 117]);
    expect(v('mindegree').fill).toBeLessThan(v('natural').fill / 4);
  });
  it('RCM gathers the nonzeros of Λ into a band (smaller bandwidth than the natural order)', () => {
    const bw = (k: 'natural' | 'rcm') => Math.max(...orderingView(a, k).lambda.map(([i, j]) => Math.abs(i - j)));
    expect(bw('rcm')).toBeLessThan(bw('natural'));
  });
  it('post 27: the natural order would have about sixteen times the minimum-degree fill', () => {
    const r = runPoseGraph(defaultRequest(), undefined, undefined);
    expect(Math.round(r.setup.fillNatural / r.setup.fillMinDegree)).toBe(16);
  });
});

describe('post 28: marginalization', () => {
  const key = (p: [number, number][]) => p.map(([x, y]) => `${x}-${y}`).sort();
  it('pose 5: its neighbours 4 and 6 become linked', () => {
    expect(key(marginalizeView([5]).induced)).toEqual(['4-6']);
  });
  it('poses 2 and 9: their neighbours 1, 3, 8, 10 become linked all to all (six new links)', () => {
    expect(key(marginalizeView([2, 9]).induced)).toEqual(['1-10', '1-3', '1-8', '3-10', '3-8', '8-10']);
  });
  it('sliding window: 7 left → 12 of 21 pairs linked; 4 left → 5 of 6', () => {
    const w = (r: number) => marginalizeView(Array.from({ length: r }, (_, i) => i));
    expect([w(5).kept.length, w(5).pairs.length]).toEqual([7, 12]);
    expect([w(8).kept.length, w(8).pairs.length]).toEqual([4, 5]);
  });
});
