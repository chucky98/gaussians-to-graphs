/** EKF-SLAM (Posts 23–25): augmentation, prediction, update, and the convergence property of Dissanayake et al. */
import { describe, expect, it } from 'vitest';
import {
  block,
  canonicalCorrelation,
  initJacobians,
  slamAddLandmark,
  slamH,
  slamInit,
  slamPredict,
  slamPredictReading,
  slamUpdate,
  slotOf,
  nLandmarks,
} from '../../../src/lib/filters/ekf-slam';
import { numericJacobian } from '../../../src/lib/math/autodiff';
import {
  det,
  diag,
  fromArrays,
  maxAbsDiff,
  mul,
  transpose,
  add,
  zeros,
  isSymmetricPSD,
  type Mat,
} from '../../../src/lib/math/matrix';
import { inverseRangeBearing, rangeBearing } from '../../../src/lib/models/range-bearing';
import { velocityJacobianControl, velocityJacobianState } from '../../../src/lib/models/unicycle';
import { corrRun } from '../../../src/lib/demos/correlations';
import { randomSPD } from '../helpers';
import { createRng } from '../../../src/lib/math/rng';

const rng = createRng(23);
const R = diag([0.01, 0.0012]);
const M = diag([0.0025, 0.0025]);

function someState() {
  let s = slamInit(Float64Array.of(1, -2, 0.4), randomSPD(rng, 3));
  s = slamAddLandmark(s, Float64Array.of(2, 0.3), R, 7);
  s = slamAddLandmark(s, Float64Array.of(3, -0.6), R, 2);
  return s;
}

describe('ekf-slam', () => {
  it('initialization Jacobians match finite differences', () => {
    const pose = Float64Array.of(0.5, 1, 0.7);
    const z = Float64Array.of(2.5, -0.4);
    const { Gr, Gz } = initJacobians(pose, z);
    expect(
      maxAbsDiff(
        Gr,
        numericJacobian((p) => inverseRangeBearing(p, z), pose),
      ),
    ).toBeLessThan(1e-8);
    expect(
      maxAbsDiff(
        Gz,
        numericJacobian((q) => inverseRangeBearing(pose, q), z),
      ),
    ).toBeLessThan(1e-8);
  });
  it('adding a landmark is the linear transform of the joint Gaussian (x, z) by [I 0; G_r G_z]', () => {
    const s0 = someState();
    const n = s0.x.length;
    const z = Float64Array.of(1.7, 1.1);
    const s1 = slamAddLandmark(s0, z, R, 9);
    const { Gr, Gz } = initJacobians(s0.x.subarray(0, 3), z);
    const J = zeros(n + 2, n + 2);
    for (let i = 0; i < n; i++) J.data[i * (n + 2) + i] = 1;
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < 3; k++) J.data[(n + i) * (n + 2) + k] = Gr.data[i * 3 + k]!;
      for (let k = 0; k < 2; k++) J.data[(n + i) * (n + 2) + n + k] = Gz.data[i * 2 + k]!;
    }
    const joint = zeros(n + 2, n + 2);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) joint.data[i * (n + 2) + j] = s0.P.data[i * n + j]!;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) joint.data[(n + i) * (n + 2) + n + j] = R.data[i * 2 + j]!;
    expect(maxAbsDiff(s1.P, mul(mul(J, joint), transpose(J)))).toBeLessThan(1e-12);
    expect(slotOf(s1, 9)).toBe(2);
    expect(nLandmarks(s1)).toBe(3);
    expect(Array.from(s1.x.subarray(n))).toEqual(Array.from(inverseRangeBearing(s0.x.subarray(0, 3), z)));
  });
  it('prediction equals F_full P F_fullᵀ + G V M Vᵀ Gᵀ and leaves the map block untouched', () => {
    const s0 = someState();
    const n = s0.x.length;
    const u = { v: 0.8, w: 0.3 };
    const s1 = slamPredict(s0, u, 0.5, M);
    const F = velocityJacobianState(s0.x.subarray(0, 3), u, 0.5);
    const V = velocityJacobianControl(s0.x.subarray(0, 3), u, 0.5);
    const Ff = zeros(n, n);
    for (let i = 0; i < n; i++) Ff.data[i * n + i] = 1;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) Ff.data[i * n + j] = F.data[i * 3 + j]!;
    const Q = zeros(n, n);
    const VMV = mul(mul(V, M), transpose(V));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) Q.data[i * n + j] = VMV.data[i * 3 + j]!;
    expect(maxAbsDiff(s1.P, add(mul(mul(Ff, s0.P), transpose(Ff)), Q))).toBeLessThan(1e-12);
    for (let i = 3; i < n; i++) for (let j = 3; j < n; j++) expect(s1.P.data[i * n + j]).toBe(s0.P.data[i * n + j]);
    expect(Array.from(s1.x.subarray(3))).toEqual(Array.from(s0.x.subarray(3)));
  });
  it('the measurement Jacobian matches finite differences and is zero outside the pose and the landmark', () => {
    const s = someState();
    const H = slamH(s, 1);
    const num = numericJacobian((x) => rangeBearing(x.subarray(0, 3), x.subarray(5, 7)), s.x);
    expect(maxAbsDiff(H, num)).toBeLessThan(1e-7);
    for (let i = 0; i < 2; i++) for (const c of [3, 4]) expect(H.data[i * s.x.length + c]).toBe(0);
    expect(Array.from(slamPredictReading(s, 1))).toEqual(
      Array.from(rangeBearing(s.x.subarray(0, 3), s.x.subarray(5, 7))),
    );
  });
  it('an update keeps P symmetric PSD and shrinks the robot block', () => {
    const s = someState();
    const z = slamPredictReading(s, 0).map((v, i) => v + (i ? 0.01 : 0.05));
    const u = slamUpdate(s, z, 0, R);
    expect(isSymmetricPSD(u.state.P)).toBe(true);
    expect(det(block(u.state, -1, 3))).toBeLessThan(det(block(s, -1, 3)));
  });
  it('Dissanayake et al. (2001): no landmark block determinant ever increases (the CorrelationsEmerge run)', () => {
    const r = corrRun();
    for (let k = 1; k < r.steps.length; k++) {
      const a = r.steps[k - 1]!.state;
      const b = r.steps[k]!.state;
      a.ids.forEach((_, j) => expect(det(block(b, j))).toBeLessThanOrEqual(det(block(a, j)) * (1 + 1e-9)));
    }
  });
});

describe('canonicalCorrelation', () => {
  function stateWith(P: Mat) {
    return { x: new Float64Array(P.rows), P, ids: [0] };
  }
  it('is 0 for independent blocks and 1 for a copy', () => {
    const P0 = zeros(5, 5);
    const S = randomSPD(rng, 5);
    for (let i = 0; i < 25; i++) P0.data[i] = S.data[i]!;
    for (let i = 0; i < 2; i++) for (let j = 3; j < 5; j++) P0.data[i * 5 + j] = P0.data[j * 5 + i] = 0;
    expect(canonicalCorrelation(stateWith(P0), -1, 0)).toBeCloseTo(0, 12);
    // b = a exactly: P_bb = P_ab = P_aa.
    const A = fromArrays([
      [2, 0.3],
      [0.3, 1],
    ]);
    const P1 = zeros(5, 5);
    for (const [o1, o2] of [
      [0, 0],
      [0, 3],
      [3, 0],
      [3, 3],
    ])
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) P1.data[(o1! + i) * 5 + o2! + j] = A.data[i * 2 + j]!;
    P1.data[2 * 5 + 2] = 1;
    expect(canonicalCorrelation(stateWith(P1), -1, 0)).toBeCloseTo(1, 10);
  });
  it('equals |ρ| when only one pair of coordinates is correlated', () => {
    const P = diag([1, 4, 1, 9, 2]);
    P.data[1 * 5 + 4] = P.data[4 * 5 + 1] = 0.6 * Math.sqrt(4 * 2);
    expect(canonicalCorrelation(stateWith(P), -1, 0)).toBeCloseTo(0.6, 12);
  });
});
