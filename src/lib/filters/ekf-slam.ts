/**
 * EKF-SLAM (Posts 23–25): one Gaussian over the robot pose and every landmark seen so far,
 *   x = [x, y, θ, m₁ₓ, m₁ᵧ, m₂ₓ, m₂ᵧ, …],
 * with the velocity motion model of Post 14 and the range–bearing sensor of Post 14.
 *
 *  - predict: only the pose moves, so only the pose block and the pose–map cross-covariances change:
 *      P_rr ← F P_rr Fᵀ + V M Vᵀ,   P_rm ← F P_rm   (O(n) instead of O(n²) for n landmarks)
 *  - add a landmark from its first reading z: m = g(x_r, z), and the joint Gaussian grows by the
 *    linearized transform with Jacobians G_r = ∂g/∂x_r and G_z = ∂g/∂z:
 *      P_mm = G_r P_rr G_rᵀ + G_z R G_zᵀ,   P_m· = G_r P_r·
 *  - update with a reading of a known landmark: the EKF update with H nonzero only in the pose and that
 *    landmark's columns, done in O(n²). It changes every entry of P: this is how one reading improves the
 *    whole map.
 *
 * `ids[j]` is the true identity of the landmark in slot j (for drawing and for data association tests).
 */
import { wrapAngle } from '../geometry/so2';
import { add, fromArrays, mul, symmetrize, transpose, zeros, type Mat, type Vec } from '../math/matrix';
import { inverseRangeBearing, rangeBearing, rangeBearingJacobians } from '../models/range-bearing';
import {
  velocityJacobianControl,
  velocityJacobianState,
  velocityMotion,
  type VelocityControl,
} from '../models/unicycle';

export interface SlamState {
  x: Vec;
  P: Mat;
  /** True identity of the landmark stored in each slot. */
  ids: number[];
}

export const nLandmarks = (s: SlamState) => s.ids.length;

export function slamInit(pose: Vec, poseCov: Mat): SlamState {
  return { x: Float64Array.from(pose), P: poseCov, ids: [] };
}

/** Motion step: the pose moves with control u (noise covariance M on (v, ω)); landmarks stay put. */
export function slamPredict(s: SlamState, u: VelocityControl, dt: number, M: Mat): SlamState {
  const n = s.x.length;
  const pose = s.x.subarray(0, 3);
  const F = velocityJacobianState(pose, u, dt);
  const V = velocityJacobianControl(pose, u, dt);
  const x = Float64Array.from(s.x);
  x.set(velocityMotion(pose, u, dt), 0);
  const P = zeros(n, n);
  P.data.set(s.P.data);
  // Pose block.
  const Prr = fromArrays([0, 1, 2].map((i) => [0, 1, 2].map((j) => s.P.data[i * n + j]!)));
  const newRr = add(mul(mul(F, Prr), transpose(F)), mul(mul(V, M), transpose(V)));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) P.data[i * n + j] = newRr.data[i * 3 + j]!;
  // Cross blocks P_rm ← F P_rm (and the transpose).
  for (let c = 3; c < n; c++) {
    const col = [s.P.data[c]!, s.P.data[n + c]!, s.P.data[2 * n + c]!];
    for (let i = 0; i < 3; i++) {
      const v = F.data[i * 3]! * col[0]! + F.data[i * 3 + 1]! * col[1]! + F.data[i * 3 + 2]! * col[2]!;
      P.data[i * n + c] = v;
      P.data[c * n + i] = v;
    }
  }
  return { x, P: symmetrize(P), ids: s.ids };
}

/** Jacobians of the landmark initialization m = g(pose, z) = (x + r cos(θ + φ), y + r sin(θ + φ)). */
export function initJacobians(pose: Vec, z: Vec): { Gr: Mat; Gz: Mat } {
  const a = pose[2]! + z[1]!;
  const [c, sn] = [Math.cos(a), Math.sin(a)];
  const r = z[0]!;
  return {
    Gr: fromArrays([
      [1, 0, -r * sn],
      [0, 1, r * c],
    ]),
    Gz: fromArrays([
      [c, -r * sn],
      [sn, r * c],
    ]),
  };
}

/** Add a newly seen landmark (true identity `id`) from its first reading z with noise covariance R. */
export function slamAddLandmark(s: SlamState, z: Vec, R: Mat, id: number): SlamState {
  const n = s.x.length;
  const pose = s.x.subarray(0, 3);
  const m = inverseRangeBearing(pose, z);
  const { Gr, Gz } = initJacobians(pose, z);
  const x = new Float64Array(n + 2);
  x.set(s.x);
  x.set(m, n);
  const P = zeros(n + 2, n + 2);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) P.data[i * (n + 2) + j] = s.P.data[i * n + j]!;
  // Cross-covariance with everything: G_r P_r· (P_r· = the first three rows of P).
  for (let c = 0; c < n; c++)
    for (let i = 0; i < 2; i++) {
      let v = 0;
      for (let k = 0; k < 3; k++) v += Gr.data[i * 3 + k]! * s.P.data[k * n + c]!;
      P.data[(n + i) * (n + 2) + c] = v;
      P.data[c * (n + 2) + n + i] = v;
    }
  const Prr = fromArrays([0, 1, 2].map((i) => [0, 1, 2].map((j) => s.P.data[i * n + j]!)));
  const Pmm = add(mul(mul(Gr, Prr), transpose(Gr)), mul(mul(Gz, R), transpose(Gz)));
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) P.data[(n + i) * (n + 2) + n + j] = Pmm.data[i * 2 + j]!;
  return { x, P: symmetrize(P), ids: [...s.ids, id] };
}

/** Measurement Jacobian of the reading of the landmark in slot j: nonzero only in the pose and slot j. */
export function slamH(s: SlamState, j: number): Mat {
  const n = s.x.length;
  const pose = s.x.subarray(0, 3);
  const m = s.x.subarray(3 + 2 * j, 5 + 2 * j);
  const { Hx, Hm } = rangeBearingJacobians(pose, m);
  const H = zeros(2, n);
  for (let i = 0; i < 2; i++) {
    for (let k = 0; k < 3; k++) H.data[i * n + k] = Hx.data[i * 3 + k]!;
    for (let k = 0; k < 2; k++) H.data[i * n + 3 + 2 * j + k] = Hm.data[i * 2 + k]!;
  }
  return H;
}

/** Predicted reading of slot j. */
export function slamPredictReading(s: SlamState, j: number): Vec {
  return rangeBearing(s.x.subarray(0, 3), s.x.subarray(3 + 2 * j, 5 + 2 * j));
}

export interface SlamUpdate {
  state: SlamState;
  /** Innovation ν = z ⊟ ẑ, its covariance S and the normalized innovation squared νᵀ S⁻¹ ν. */
  nu: Vec;
  S: Mat;
  nis: number;
}

/** Innovation of a reading z of slot j: ν = z ⊟ h(x̂) and S = H P Hᵀ + R, using only H's nonzero columns. */
export function slamInnovation(
  s: SlamState,
  z: Vec,
  j: number,
  R: Mat,
): { nu: Vec; S: Mat; PHt: Float64Array; cols: number[]; Hc: Float64Array } {
  const n = s.x.length;
  const pose = s.x.subarray(0, 3);
  const m = s.x.subarray(3 + 2 * j, 5 + 2 * j);
  const { Hx, Hm } = rangeBearingJacobians(pose, m);
  const cols = [0, 1, 2, 3 + 2 * j, 4 + 2 * j];
  // H restricted to its five nonzero columns (2 × 5, row-major).
  const Hc = Float64Array.of(
    Hx.data[0]!,
    Hx.data[1]!,
    Hx.data[2]!,
    Hm.data[0]!,
    Hm.data[1]!,
    Hx.data[3]!,
    Hx.data[4]!,
    Hx.data[5]!,
    Hm.data[2]!,
    Hm.data[3]!,
  );
  // PHt = P Hᵀ (n × 2).
  const PHt = new Float64Array(2 * n);
  for (let i = 0; i < n; i++)
    for (let r = 0; r < 2; r++) {
      let v = 0;
      for (let c = 0; c < 5; c++) v += s.P.data[i * n + cols[c]!]! * Hc[r * 5 + c]!;
      PHt[i * 2 + r] = v;
    }
  const S = zeros(2, 2);
  for (let r = 0; r < 2; r++)
    for (let q = 0; q < 2; q++) {
      let v = R.data[r * 2 + q]!;
      for (let c = 0; c < 5; c++) v += Hc[r * 5 + c]! * PHt[cols[c]! * 2 + q]!;
      S.data[r * 2 + q] = v;
    }
  const zh = rangeBearing(pose, m);
  const nu = Float64Array.of(z[0]! - zh[0]!, wrapAngle(z[1]! - zh[1]!));
  return { nu, S, PHt, cols, Hc };
}

/**
 * EKF update with a reading z of the landmark in slot j, in O(n²): K = P Hᵀ S⁻¹, x̂ ← x̂ + K ν,
 * P ← P − K S Kᵀ (then symmetrized). H has only five nonzero columns, so P Hᵀ costs O(n).
 */
export function slamUpdate(s: SlamState, z: Vec, j: number, R: Mat): SlamUpdate {
  const n = s.x.length;
  const { nu, S, PHt } = slamInnovation(s, z, j, R);
  const d = S.data[0]! * S.data[3]! - S.data[1]! * S.data[2]!;
  const Si = [S.data[3]! / d, -S.data[1]! / d, -S.data[2]! / d, S.data[0]! / d];
  const K = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    const [a, b] = [PHt[i * 2]!, PHt[i * 2 + 1]!];
    K[i * 2] = a * Si[0]! + b * Si[2]!;
    K[i * 2 + 1] = a * Si[1]! + b * Si[3]!;
  }
  const x = Float64Array.from(s.x);
  for (let i = 0; i < n; i++) x[i]! += K[i * 2]! * nu[0]! + K[i * 2 + 1]! * nu[1]!;
  x[2] = wrapAngle(x[2]!);
  // K S Kᵀ = PHt Kᵀ (since K S = PHt).
  const P = zeros(n, n);
  for (let i = 0; i < n; i++)
    for (let k = i; k < n; k++) {
      const v = s.P.data[i * n + k]! - (PHt[i * 2]! * K[k * 2]! + PHt[i * 2 + 1]! * K[k * 2 + 1]!);
      P.data[i * n + k] = v;
      P.data[k * n + i] = v;
    }
  const nis = nu[0]! * (Si[0]! * nu[0]! + Si[1]! * nu[1]!) + nu[1]! * (Si[2]! * nu[0]! + Si[3]! * nu[1]!);
  return { state: { x, P, ids: s.ids }, nu, S, nis };
}

/** Slot of a landmark identity, or −1 if it is not in the map yet. */
export function slotOf(s: SlamState, id: number): number {
  return s.ids.indexOf(id);
}

/** 2 × 2 (or 3 × 3 for the pose) covariance block of a slot; slot −1 is the robot position (x, y). */
export function block(s: SlamState, a: number, rows = 2): Mat {
  const n = s.x.length;
  const o = a < 0 ? 0 : 3 + 2 * a;
  return fromArrays(
    Array.from({ length: rows }, (_, i) => Array.from({ length: rows }, (_, j) => s.P.data[(o + i) * n + o + j]!)),
  );
}

/**
 * Largest canonical correlation between two 2D blocks (slot −1 = robot position): the largest singular
 * value of Σ_aa^{−1/2} Σ_ab Σ_bb^{−1/2}. 0 means knowing one says nothing about the other; 1 means some
 * combination of one is determined exactly by the other.
 */
export function canonicalCorrelation(s: SlamState, a: number, b: number): number {
  const n = s.x.length;
  const oa = a < 0 ? 0 : 3 + 2 * a;
  const ob = b < 0 ? 0 : 3 + 2 * b;
  const g = (o1: number, o2: number) =>
    fromArrays([0, 1].map((i) => [0, 1].map((j) => s.P.data[(o1 + i) * n + o2 + j]!)));
  const Saa = g(oa, oa);
  const Sbb = g(ob, ob);
  const Sab = g(oa, ob);
  // ρ² = largest eigenvalue of Σ_aa⁻¹ Σ_ab Σ_bb⁻¹ Σ_ba (a 2 × 2 matrix).
  const inv2 = (m: Mat) => {
    const d = m.data[0]! * m.data[3]! - m.data[1]! * m.data[2]!;
    return fromArrays([
      [m.data[3]! / d, -m.data[1]! / d],
      [-m.data[2]! / d, m.data[0]! / d],
    ]);
  };
  const K = mul(mul(mul(inv2(Saa), Sab), inv2(Sbb)), transpose(Sab));
  const tr = K.data[0]! + K.data[3]!;
  const det = K.data[0]! * K.data[3]! - K.data[1]! * K.data[2]!;
  const lam = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  return Math.sqrt(Math.min(1, Math.max(0, lam)));
}
