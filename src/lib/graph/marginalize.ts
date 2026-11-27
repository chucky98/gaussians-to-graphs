/**
 * Marginalization in information form (DESIGN §5.1, Post 28). Removing variables m from a Gaussian with
 * information matrix Λ and vector η keeps the others k with
 *   Λ' = Λ_kk − Λ_km Λ_mm⁻¹ Λ_mk,   η' = η_k − Λ_km Λ_mm⁻¹ η_m,
 * the Schur complement. Λ' is dense among the variables that shared a factor with the removed ones: the
 * induced factor that "remembers" them.
 */
import { cholesky, schurComplement, select, solveCholesky, type Mat, type Vec } from '../math/matrix';

/** Marginalize out every index not in `keep` (indices into Λ and η). */
export function marginalize(Lambda: Mat, eta: Vec, keep: readonly number[]): { Lambda: Mat; eta: Vec } {
  const remove = Array.from({ length: Lambda.rows }, (_, i) => i).filter((i) => !keep.includes(i));
  if (remove.length === 0)
    return { Lambda: select(Lambda, keep, keep), eta: Float64Array.from(keep.map((i) => eta[i]!)) };
  const Lkm = select(Lambda, keep, remove);
  const w = solveCholesky(cholesky(select(Lambda, remove, remove)), Float64Array.from(remove.map((i) => eta[i]!)));
  const etaK = Float64Array.from(keep, (i, r) => {
    let s = eta[i]!;
    for (let c = 0; c < remove.length; c++) s -= Lkm.data[r * remove.length + c]! * w[c]!;
    return s;
  });
  return { Lambda: schurComplement(Lambda, keep), eta: etaK };
}
