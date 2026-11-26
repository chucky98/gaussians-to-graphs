import { describe, expect, it } from 'vitest';
import { batchLinearGaussian, kfPredict, kfRun, kfUpdate, type KfState } from '../../../src/lib/filters/kf';
import { run1 } from '../../../src/lib/filters/kf1d';
import { condition } from '../../../src/lib/math/gaussian';
import {
  add,
  diag,
  fromArrays,
  identity,
  inverse,
  isSymmetricPSD,
  maxAbsDiff,
  mul,
  mulVec,
  transpose,
  vec,
  zeros,
  setBlock,
  getBlock,
  type Vec,
} from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';
import { constantVelocity, cvModel, positionSensor } from '../../../src/lib/models/linear';

const rng = createRng(1212);
const m = cvModel(2, 0.5, 0.3, 0.4);
const init: KfState = { x: vec([0, 0, 1, 0.5]), P: diag([1, 1, 4, 4]) };
const N = 25;
const zs: (Vec | null)[] = [];
{
  let x = vec([0.3, -0.2, 1.2, 0.4]);
  const L = [Math.sqrt(m.Q.data[0]!)];
  void L;
  for (let k = 0; k < N; k++) {
    x = mulVec(m.F, x);
    for (let i = 0; i < 4; i++) x[i]! += 0.05 * rng.normal();
    zs.push(k % 7 === 6 ? null : vec([x[0]! + 0.4 * rng.normal(), x[1]! + 0.4 * rng.normal()]));
  }
}

describe('Kalman filter (DESIGN §8.1 invariants)', () => {
  it('the last KF estimate equals the batch MAP solution, after every step (with gaps)', () => {
    const steps = kfRun(init, m, zs);
    for (const k of [1, 2, 6, 7, 13, N]) {
      const b = batchLinearGaussian(init, m, zs.slice(0, k));
      const last = steps[k - 1]!.post;
      for (let i = 0; i < 4; i++) expect(last.x[i]).toBeCloseTo(b.x[k]![i]!, 9);
      expect(maxAbsDiff(last.P, b.P[k]!)).toBeLessThan(1e-9);
    }
  });

  it('P stays symmetric positive semidefinite after every step', () => {
    for (const s of kfRun(init, m, zs)) {
      expect(isSymmetricPSD(s.prior.P)).toBe(true);
      expect(isSymmetricPSD(s.post.P)).toBe(true);
    }
  });

  it('Joseph and standard covariance updates agree at the optimal gain', () => {
    const a = kfRun(init, m, zs, undefined, { joseph: true });
    const b = kfRun(init, m, zs, undefined, { joseph: false });
    for (let k = 0; k < N; k++) expect(maxAbsDiff(a[k]!.post.P, b[k]!.post.P)).toBeLessThan(1e-12);
  });

  it('in one dimension it is the scalar filter of post 11 (F = 1, B = 1, H = 1)', () => {
    const one = fromArrays([[1]]);
    const model = { F: one, B: one, Q: fromArrays([[0.01]]), H: one, R: fromArrays([[0.09]]) };
    const zs1 = [1.1, 1.9, null, 4.2, 5.0];
    const a = kfRun(
      { x: vec([0]), P: fromArrays([[1]]) },
      model,
      zs1.map((z) => (z === null ? null : vec([z]))),
      [...Array(5)].map(() => vec([1])),
    );
    const b = run1({ x: 0, P: 1 }, [1, 1, 1, 1, 1], zs1, 0.01, 0.09);
    for (let k = 0; k < 5; k++) {
      expect(a[k]!.post.x[0]).toBeCloseTo(b[k]!.post.x, 14);
      expect(a[k]!.post.P.data[0]).toBeCloseTo(b[k]!.post.P, 14);
    }
  });

  it('the update is conditioning the joint Gaussian of (x, z) (post 3): the unmeasured velocity moves via the cross-covariance', () => {
    const prior = kfPredict(init, m);
    const n = 4;
    const Ht = transpose(m.H);
    let joint = zeros(6, 6);
    joint = setBlock(joint, 0, 0, prior.P);
    joint = setBlock(joint, 0, 4, mul(prior.P, Ht));
    joint = setBlock(joint, 4, 0, mul(m.H, prior.P));
    joint = setBlock(joint, 4, 4, add(mul(mul(m.H, prior.P), Ht), m.R));
    const mean = new Float64Array(6);
    mean.set(prior.x, 0);
    mean.set(mulVec(m.H, prior.x), 4);
    const z = vec([0.9, 0.1]);
    const c = condition({ mean, cov: joint }, [4, 5], z);
    const u = kfUpdate(prior, z, m);
    for (let i = 0; i < n; i++) expect(c.mean[i]).toBeCloseTo(u.state.x[i]!, 12);
    expect(maxAbsDiff(getBlock(c.cov, 0, 0, 4, 4), u.state.P)).toBeLessThan(1e-12);
    expect(Math.abs(u.state.x[2]! - prior.x[2]!)).toBeGreaterThan(0); // velocity corrected without being measured
  });

  it('diagnostics: S = H P Hᵀ + R, K = P Hᵀ S⁻¹ (n_x × n_z), NIS = νᵀ S⁻¹ ν', () => {
    const prior = kfPredict(init, m);
    const z = vec([0.4, -0.3]);
    const u = kfUpdate(prior, z, m);
    expect([u.K.rows, u.K.cols]).toEqual([4, 2]);
    const S = add(mul(mul(m.H, prior.P), transpose(m.H)), m.R);
    expect(maxAbsDiff(u.S, S)).toBeLessThan(1e-14);
    expect(maxAbsDiff(u.K, mul(mul(prior.P, transpose(m.H)), inverse(S)))).toBeLessThan(1e-12);
    const Si = inverse(S);
    const nu = u.nu;
    expect(u.nis).toBeCloseTo(
      nu[0]! * (Si.data[0]! * nu[0]! + Si.data[1]! * nu[1]!) + nu[1]! * (Si.data[2]! * nu[0]! + Si.data[3]! * nu[1]!),
      12,
    );
  });

  it('control input: x̂⁻ = F x̂ + B u', () => {
    const s = kfPredict(
      { x: vec([1, 2]), P: identity(2) },
      { F: identity(2), B: diag([2, 3]), Q: zeros(2, 2) },
      vec([1, 1]),
    );
    expect(Array.from(s.x)).toEqual([3, 5]);
  });
});

describe('linear models', () => {
  it('constant velocity: F moves position by v·dt; Q equals ∫₀^dt e^{As} G q Gᵀ e^{Aᵀs} ds', () => {
    const dt = 0.7;
    const q = 0.5;
    const { F, Q } = constantVelocity(1, dt, q);
    expect(Array.from(F.data)).toEqual([1, dt, 0, 1]);
    // e^{As} = [[1, s], [0, 1]], G = [0, 1]ᵀ ⇒ integrand q [[s², s], [s, 1]]; Simpson's rule.
    const n = 200;
    const acc = [0, 0, 0];
    for (let i = 0; i <= n; i++) {
      const s = (dt * i) / n;
      const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
      acc[0]! += w * s * s;
      acc[1]! += w * s;
      acc[2]! += w;
    }
    const h = dt / n / 3;
    expect(Q.data[0]).toBeCloseTo(q * acc[0]! * h, 12);
    expect(Q.data[1]).toBeCloseTo(q * acc[1]! * h, 12);
    expect(Q.data[3]).toBeCloseTo(q * acc[2]! * h, 12);
    const Q2 = constantVelocity(2, dt, q).Q;
    expect(Q2.data[0 * 4 + 2]).toBeCloseTo((q * dt ** 2) / 2, 14);
    expect(Q2.data[0 * 4 + 1]).toBe(0);
    expect(() => constantVelocity(0, 1, 1)).toThrow();
  });
  it('position sensor: H = [I 0], R = σ² I', () => {
    const { H, R } = positionSensor(2, 0.5);
    expect(Array.from(H.data)).toEqual([1, 0, 0, 0, 0, 1, 0, 0]);
    expect(Array.from(R.data)).toEqual([0.25, 0, 0, 0.25]);
    expect(() => positionSensor(2, 0)).toThrow();
  });
});
