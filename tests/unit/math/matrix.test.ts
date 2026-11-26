import { describe, expect, it } from 'vitest';
import {
  add,
  cholesky,
  det,
  eigSym,
  eigSym2,
  fromArrays,
  getBlock,
  identity,
  inverse,
  isSymmetricPSD,
  luSolve,
  maxAbsDiff,
  mul,
  mulVec,
  scale,
  select,
  setBlock,
  solveCholesky,
  sub,
  symmetrize,
  toArrays,
  transpose,
  diag,
  vec,
  zeros,
  dot,
  type Mat,
} from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';
import { randomMat, randomSPD } from '../helpers';

const rng = createRng(20261126);

function residualNorm(a: Mat, x: Float64Array, b: Float64Array): number {
  const r = mulVec(a, x);
  let m = 0;
  for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(r[i]! - b[i]!));
  return m;
}

describe('matrix basics', () => {
  it('constructs, transposes and multiplies', () => {
    const a = fromArrays([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(toArrays(transpose(a))).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
    expect(toArrays(mul(a, transpose(a)))).toEqual([
      [14, 32],
      [32, 77],
    ]);
    expect(toArrays(add(a, a))).toEqual(toArrays(scale(a, 2)));
    expect(maxAbsDiff(sub(a, a), zeros(2, 3))).toBe(0);
    expect(Array.from(mulVec(a, vec([1, 1, 1])))).toEqual([6, 15]);
    expect(dot(vec([1, 2]), vec([3, 4]))).toBe(11);
    expect(toArrays(diag([2, 3]))).toEqual([
      [2, 0],
      [0, 3],
    ]);
  });

  it('rejects incompatible shapes', () => {
    expect(() => mul(zeros(2, 3), zeros(2, 3))).toThrow();
    expect(() => add(zeros(2, 3), zeros(3, 2))).toThrow();
    expect(() => fromArrays([[1, 2], [3]])).toThrow();
  });

  it('gets, sets and selects blocks', () => {
    const a = fromArrays([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
    expect(toArrays(getBlock(a, 1, 1, 2, 2))).toEqual([
      [5, 6],
      [8, 9],
    ]);
    const b = setBlock(a, 0, 1, fromArrays([[0, 0]]));
    expect(toArrays(b)[0]).toEqual([1, 0, 0]);
    expect(toArrays(a)[0]).toEqual([1, 2, 3]); // input untouched
    expect(toArrays(select(a, [0, 2], [0, 2]))).toEqual([
      [1, 3],
      [7, 9],
    ]);
    expect(() => getBlock(a, 2, 2, 2, 2)).toThrow();
  });

  it('symmetrizes', () => {
    const s = symmetrize(
      fromArrays([
        [1, 2],
        [4, 3],
      ]),
    );
    expect(toArrays(s)).toEqual([
      [1, 3],
      [3, 3],
    ]);
  });
});

describe('factorizations (DESIGN §8.1)', () => {
  it('Cholesky: L Lᵀ = A for random SPD A', () => {
    for (const n of [1, 2, 3, 5, 8, 12]) {
      const a = randomSPD(rng, n);
      const L = cholesky(a);
      expect(maxAbsDiff(mul(L, transpose(L)), a)).toBeLessThan(1e-10);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(L.data[i * n + j]).toBe(0);
    }
  });

  it('Cholesky rejects indefinite matrices', () => {
    expect(() =>
      cholesky(
        fromArrays([
          [1, 2],
          [2, 1],
        ]),
      ),
    ).toThrow(/positive definite/);
  });

  it('Cholesky and LU solves have residual < 1e-10', () => {
    for (const n of [2, 4, 9]) {
      const a = randomSPD(rng, n);
      const b = Float64Array.from({ length: n }, () => rng.normal());
      expect(residualNorm(a, solveCholesky(cholesky(a), b), b)).toBeLessThan(1e-10);
      const g = add(randomMat(rng, n, n), scale(identity(n), 3));
      expect(residualNorm(g, luSolve(g, b), b)).toBeLessThan(1e-10);
    }
  });

  it('inverse × A ≈ I (SPD and general)', () => {
    for (const n of [2, 3, 6]) {
      const a = randomSPD(rng, n);
      expect(maxAbsDiff(mul(inverse(a, { spd: true }), a), identity(n))).toBeLessThan(1e-10);
      const g = add(randomMat(rng, n, n), scale(identity(n), 3));
      expect(maxAbsDiff(mul(inverse(g), g), identity(n))).toBeLessThan(1e-10);
    }
    expect(() =>
      inverse(
        fromArrays([
          [1, 2],
          [2, 4],
        ]),
      ),
    ).toThrow(/singular/);
  });

  it('det matches known values and product rule', () => {
    expect(
      det(
        fromArrays([
          [2, 0, 0],
          [0, 3, 0],
          [0, 0, 4],
        ]),
      ),
    ).toBeCloseTo(24, 12);
    expect(
      det(
        fromArrays([
          [0, 1, 0],
          [1, 0, 0],
          [0, 0, 1],
        ]),
      ),
    ).toBeCloseTo(-1, 12);
    const a = randomMat(rng, 4, 4);
    const b = randomMat(rng, 4, 4);
    expect(det(mul(a, b))).toBeCloseTo(det(a) * det(b), 9);
    expect(
      det(
        fromArrays([
          [1, 2, 3],
          [2, 4, 6],
          [1, 1, 1],
        ]),
      ),
    ).toBe(0);
  });
});

describe('eigen-decomposition', () => {
  function reconstruct(values: Float64Array, V: Mat): Mat {
    return mul(mul(V, diag(Array.from(values))), transpose(V));
  }

  it('eigSym reconstructs A and has orthonormal vectors', () => {
    for (const n of [2, 3, 5, 8]) {
      const a = symmetrize(randomMat(rng, n, n));
      const { values, vectors } = eigSym(a);
      expect(maxAbsDiff(reconstruct(values, vectors), a)).toBeLessThan(1e-10);
      expect(maxAbsDiff(mul(transpose(vectors), vectors), identity(n))).toBeLessThan(1e-10);
      for (let i = 1; i < n; i++) expect(values[i]!).toBeLessThanOrEqual(values[i - 1]!);
    }
  });

  it('eigSym2 matches eigSym and the closed form on a hand case', () => {
    // [[2,1],[1,2]] has eigenvalues 3 and 1 with vectors (1,1)/√2 and (1,−1)/√2.
    const { values, vectors } = eigSym2(
      fromArrays([
        [2, 1],
        [1, 2],
      ]),
    );
    expect(values[0]).toBeCloseTo(3, 14);
    expect(values[1]).toBeCloseTo(1, 14);
    expect(Math.abs(vectors.data[0]!)).toBeCloseTo(Math.SQRT1_2, 14);
    for (let t = 0; t < 20; t++) {
      const a = randomSPD(rng, 2);
      const e2 = eigSym2(a);
      const e = eigSym(a);
      expect(Math.abs(e2.values[0]! - e.values[0]!)).toBeLessThan(1e-10);
      expect(Math.abs(e2.values[1]! - e.values[1]!)).toBeLessThan(1e-10);
      expect(maxAbsDiff(reconstruct(e2.values, e2.vectors), a)).toBeLessThan(1e-10);
    }
  });

  it('eigSym2 handles an isotropic matrix', () => {
    const { values, vectors } = eigSym2(scale(identity(2), 4));
    expect(Array.from(values)).toEqual([4, 4]);
    expect(maxAbsDiff(vectors, identity(2))).toBe(0);
  });

  it('isSymmetricPSD', () => {
    expect(isSymmetricPSD(randomSPD(rng, 4))).toBe(true);
    expect(
      isSymmetricPSD(
        fromArrays([
          [1, 1],
          [1, 1],
        ]),
      ),
    ).toBe(true); // PSD, singular
    expect(
      isSymmetricPSD(
        fromArrays([
          [1, 2],
          [2, 1],
        ]),
      ),
    ).toBe(false);
    expect(
      isSymmetricPSD(
        fromArrays([
          [1, 0.5],
          [0, 1],
        ]),
      ),
    ).toBe(false);
  });
});
