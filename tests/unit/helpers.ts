import { mul, transpose, zeros, add, identity, scale, type Mat } from '../../src/lib/math/matrix';
import type { Rng } from '../../src/lib/math/rng';

/** Random matrix with entries ~ N(0,1). */
export function randomMat(rng: Rng, rows: number, cols: number): Mat {
  const m = zeros(rows, cols);
  for (let k = 0; k < m.data.length; k++) m.data[k] = rng.normal();
  return m;
}

/** Random SPD matrix B Bᵀ + n·I (well conditioned). */
export function randomSPD(rng: Rng, n: number): Mat {
  const b = randomMat(rng, n, n);
  return add(mul(b, transpose(b)), scale(identity(n), n));
}
