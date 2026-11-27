/** DESIGN §8.1 sparse invariants: sparse Cholesky = dense Cholesky; the ordering is a valid permutation that does not increase fill. */
import { describe, expect, it } from 'vitest';
import {
  addTriplet,
  adjacency,
  blockOrdering,
  cholesky,
  etree,
  factorNnz,
  fromDense,
  minimumDegree,
  mulVec,
  nnz,
  permute,
  solveSpd,
  spyPattern,
  toCsc,
  toDense,
  triplets,
  type Csc,
} from '../../../src/lib/graph/sparse';
import { cholesky as denseCholesky, fromArrays, solveCholesky } from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';

const rng = createRng(28);

/** Random sparse SPD matrix: a random sparse B, then Bᵀ B + n I. */
function randomSparseSpd(n: number, density: number): Csc {
  const B: number[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => (rng.uniform() < density ? rng.normal() : 0)),
  );
  const d = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += B[k]![i]! * B[k]![j]!;
      d[i * n + j] = s + (i === j ? n : 0);
    }
  return fromDense(d, n);
}

/** A k × k grid graph Laplacian + I (a 2D mesh, the classic fill-in test). */
function grid(k: number): Csc {
  const n = k * k;
  const t = triplets(n);
  for (let r = 0; r < k; r++)
    for (let c = 0; c < k; c++) {
      const i = r * k + c;
      let deg = 0;
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ]) {
        const [rr, cc] = [r + dr!, c + dc!];
        if (rr < 0 || cc < 0 || rr >= k || cc >= k) continue;
        addTriplet(t, i, rr * k + cc, -1);
        deg++;
      }
      addTriplet(t, i, i, deg + 1);
    }
  return toCsc(t);
}

function denseL(a: Csc) {
  const L = denseCholesky({ rows: a.n, cols: a.n, data: toDense(a) });
  return L;
}

describe('sparse', () => {
  it('triplets sum duplicates; dense round trip; mulVec', () => {
    const t = triplets(3);
    addTriplet(t, 0, 0, 1);
    addTriplet(t, 0, 0, 2);
    addTriplet(t, 2, 1, 5);
    const a = toCsc(t);
    expect(nnz(a)).toBe(2);
    expect(Array.from(toDense(a))).toEqual([3, 0, 0, 0, 0, 0, 0, 5, 0]);
    expect(Array.from(mulVec(a, [1, 2, 3]))).toEqual([3, 0, 10]);
    expect(spyPattern(a)).toEqual([
      [0, 0],
      [2, 1],
    ]);
  });
  it('sparse Cholesky equals dense Cholesky on random sparse SPD matrices', () => {
    for (const [n, dens] of [
      [5, 0.3],
      [20, 0.1],
      [40, 0.05],
    ] as const) {
      for (let rep = 0; rep < 5; rep++) {
        const a = randomSparseSpd(n, dens);
        const f = cholesky(a);
        const Ld = denseL(a);
        const Ls = toDense(f.L);
        for (let i = 0; i < n * n; i++) expect(Ls[i]!).toBeCloseTo(Ld.data[i]!, 10);
      }
    }
  });
  it('solveSpd solves A x = b under any ordering', () => {
    const a = randomSparseSpd(30, 0.08);
    const b = Float64Array.from({ length: 30 }, () => rng.normal());
    const ref = solveCholesky(denseL(a), b);
    const perm = minimumDegree(adjacency(a));
    for (const p of [undefined, perm]) {
      const { x } = solveSpd(a, b, p);
      for (let i = 0; i < 30; i++) expect(x[i]!).toBeCloseTo(ref[i]!, 10);
    }
  });
  it('the elimination tree: parent[j] is the first nonzero below the diagonal in column j of L', () => {
    const a = randomSparseSpd(25, 0.06);
    const L = denseL(a).data;
    const parent = etree(a);
    for (let j = 0; j < 25; j++) {
      let first = -1;
      for (let i = j + 1; i < 25; i++)
        if (Math.abs(L[i * 25 + j]!) > 1e-12) {
          first = i;
          break;
        }
      expect(parent[j]).toBe(first);
    }
  });
  it('factorNnz equals the nonzeros of the computed factor', () => {
    const a = grid(6);
    const perm = minimumDegree(adjacency(a));
    expect(factorNnz(a, perm)).toBe(nnz(cholesky(permute(a, perm)).L));
    expect(factorNnz(a)).toBe(nnz(cholesky(a).L));
  });
  it('minimum degree is a valid permutation and does not increase fill on grid graphs', () => {
    for (const k of [4, 8, 12, 16]) {
      const a = grid(k);
      const perm = minimumDegree(adjacency(a));
      expect([...perm].sort((x, y) => x - y)).toEqual(Array.from({ length: k * k }, (_, i) => i));
      expect(factorNnz(a, perm)).toBeLessThanOrEqual(factorNnz(a));
    }
    // On a 16 × 16 grid it saves a lot: natural ordering fills the whole band.
    expect(factorNnz(grid(16), minimumDegree(adjacency(grid(16))))).toBeLessThan(0.6 * factorNnz(grid(16)));
  });
  it('blockOrdering expands a variable ordering to whole blocks', () => {
    const adj = [new Set([1]), new Set([0, 2]), new Set([1])];
    const { varPerm, perm } = blockOrdering(adj, [3, 2, 3]);
    expect([...varPerm].sort()).toEqual([0, 1, 2]);
    expect(perm).toHaveLength(8);
    const starts = [0, 3, 5];
    let k = 0;
    for (const v of varPerm) for (let d = 0; d < [3, 2, 3][v]!; d++) expect(perm[k++]).toBe(starts[v]! + d);
  });
  it('rejects matrices that are not positive definite', () => {
    expect(() =>
      cholesky(
        fromDense(
          fromArrays([
            [1, 2],
            [2, 1],
          ]).data,
          2,
        ),
      ),
    ).toThrow();
  });
});
