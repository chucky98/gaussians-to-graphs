/**
 * Data association for EKF-SLAM (Post 25): which mapped landmark, if any, produced each reading?
 *
 *  - Individual compatibility: reading i and landmark j are compatible if the Mahalanobis distance of the
 *    innovation, d²ᵢⱼ = νᵢⱼᵀ Sᵢⱼ⁻¹ νᵢⱼ, is inside the gate χ²₂(p).
 *  - Nearest neighbour (NN): pair each reading with its most compatible landmark, taking the closest pairs
 *    first so that no landmark is used twice. Each decision is made alone.
 *  - Joint compatibility branch and bound (JCBB, Neira and Tardós 2001): search for the hypothesis with the
 *    most pairings whose stacked innovation is jointly compatible, D²_H = ν_Hᵀ S_H⁻¹ ν_H ≤ χ²_{2k}(p),
 *    where S_H includes the correlations between predictions through the robot's uncertainty.
 *
 * A hypothesis is an array: assoc[i] = slot of the landmark paired with reading i, or −1 for none.
 */
import { cholesky, solveCholesky, zeros, type Mat, type Vec } from '../math/matrix';
import { chi2Quantile } from '../math/stats';
import { wrapAngle } from '../geometry/so2';
import { slamH, slamInnovation, slamPredictReading, type SlamState } from './ekf-slam';

export type Hypothesis = number[];

/** d²ᵢⱼ for every reading i and landmark slot j (rows: readings). */
export function compatibility(s: SlamState, readings: readonly Vec[], R: Mat): number[][] {
  return readings.map((z) =>
    s.ids.map((_, j) => {
      const { nu, S } = slamInnovation(s, z, j, R);
      const d = S.data[0]! * S.data[3]! - S.data[1]! * S.data[2]!;
      return (S.data[3]! * nu[0]! ** 2 - 2 * S.data[1]! * nu[0]! * nu[1]! + S.data[0]! * nu[1]! ** 2) / d;
    }),
  );
}

export const gate = (prob: number, pairs = 1) => chi2Quantile(prob, 2 * pairs);

/** Nearest neighbour with individual gating; closest pairs are taken first, each landmark at most once. */
export function nearestNeighbour(s: SlamState, readings: readonly Vec[], R: Mat, prob: number): Hypothesis {
  const d2 = compatibility(s, readings, R);
  const g = gate(prob);
  const cands: [number, number, number][] = [];
  d2.forEach((row, i) => row.forEach((v, j) => v <= g && cands.push([v, i, j])));
  cands.sort((a, b) => a[0] - b[0]);
  const assoc: Hypothesis = readings.map(() => -1);
  const used = new Set<number>();
  for (const [, i, j] of cands) {
    if (assoc[i] !== -1 || used.has(j)) continue;
    assoc[i] = j;
    used.add(j);
  }
  return assoc;
}

/** Joint Mahalanobis distance D²_H of a hypothesis (NaN if it pairs nothing). */
export function jointDistance(s: SlamState, readings: readonly Vec[], assoc: Hypothesis, R: Mat): number {
  const pairs = assoc.map((j, i) => [i, j] as const).filter(([, j]) => j >= 0);
  if (pairs.length === 0) return NaN;
  const n = s.x.length;
  const k = pairs.length;
  const H = zeros(2 * k, n);
  const nu = new Float64Array(2 * k);
  pairs.forEach(([i, j], p) => {
    const Hj = slamH(s, j);
    H.data.set(Hj.data, 2 * p * n);
    const zh = slamPredictReading(s, j);
    nu[2 * p] = readings[i]![0]! - zh[0]!;
    nu[2 * p + 1] = wrapAngle(readings[i]![1]! - zh[1]!);
  });
  // S_H = H P Hᵀ + blockdiag(R).
  const HP = zeros(2 * k, n);
  for (let r = 0; r < 2 * k; r++)
    for (let c = 0; c < n; c++) {
      let v = 0;
      for (let t = 0; t < n; t++) v += H.data[r * n + t]! * s.P.data[t * n + c]!;
      HP.data[r * n + c] = v;
    }
  const S = zeros(2 * k, 2 * k);
  for (let r = 0; r < 2 * k; r++)
    for (let c = 0; c < 2 * k; c++) {
      let v = 0;
      for (let t = 0; t < n; t++) v += HP.data[r * n + t]! * H.data[c * n + t]!;
      if (Math.floor(r / 2) === Math.floor(c / 2)) v += R.data[(r % 2) * 2 + (c % 2)]!;
      S.data[r * 2 * k + c] = v;
    }
  const w = solveCholesky(cholesky(S), nu);
  let d = 0;
  for (let r = 0; r < 2 * k; r++) d += nu[r]! * w[r]!;
  return d;
}

/**
 * JCBB: depth-first over readings; each reading is paired with an individually compatible landmark not
 * yet used, or left unpaired. A branch is pruned when its partial hypothesis is not jointly compatible, or
 * when it can no longer beat the best number of pairings found. Ties are broken by the smaller D²_H.
 */
export function jcbb(s: SlamState, readings: readonly Vec[], R: Mat, prob: number): Hypothesis {
  const d2 = compatibility(s, readings, R);
  const g1 = gate(prob);
  const cand = d2.map((row) =>
    row
      .map((v, j) => [v, j] as const)
      .filter(([v]) => v <= g1)
      .sort((a, b) => a[0] - b[0])
      .map(([, j]) => j),
  );
  const m = readings.length;
  let best: Hypothesis = readings.map(() => -1);
  let bestPairs = 0;
  let bestD = Infinity;
  const cur: Hypothesis = readings.map(() => -1);
  const used = new Set<number>();
  const rec = (i: number, pairs: number) => {
    if (i === m) {
      const D = pairs ? jointDistance(s, readings, cur, R) : 0;
      if (pairs > bestPairs || (pairs === bestPairs && pairs > 0 && D < bestD)) {
        best = [...cur];
        bestPairs = pairs;
        bestD = D;
      }
      return;
    }
    for (const j of cand[i]!) {
      if (used.has(j)) continue;
      cur[i] = j;
      if (jointDistance(s, readings, cur, R) <= gate(prob, pairs + 1)) {
        used.add(j);
        rec(i + 1, pairs + 1);
        used.delete(j);
      }
      cur[i] = -1;
    }
    // Leave reading i unpaired, if the rest could still beat the best.
    if (pairs + (m - i - 1) >= bestPairs) rec(i + 1, pairs);
  };
  rec(0, 0);
  return best;
}
