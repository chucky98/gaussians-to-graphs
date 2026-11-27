/** Every concrete claim in post 22, checked against PoseCompounding's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  POSES,
  boxAround,
  cartesianPropagation,
  coverage,
  headingSpreadDeg,
  sampleFinalPoses,
  standardDraws,
  stepModel,
  tangentPropagation,
  tangentRegion95,
  type ChainParams,
} from '../../../src/lib/demos/pose-compounding';
import * as se2 from '../../../src/lib/geometry/se2';
import { eigSym, fromArrays, maxAbsDiff } from '../../../src/lib/math/matrix';
import { sampleCov } from '../../../src/lib/math/stats';

const z = standardDraws();
function run(over: Partial<ChainParams> = {}) {
  const p = { ...POSES.defaults, ...over };
  const poses = sampleFinalPoses(p, z);
  const tan = tangentPropagation(p);
  const cart = cartesianPropagation(p);
  const reg = tangentRegion95(tan.mean, tan.P, boxAround(poses));
  return { p, poses, tan, cart, reg, cov: coverage(poses, cart, tan, reg.level) };
}
const pct = (v: number) => Math.round(100 * v);

describe('post 22: defaults', () => {
  const r = run();
  it('ten 1 m moves, 5° heading noise, 3 cm position noise, 2,000 runs, seed 4', () => {
    expect(POSES.defaults).toEqual({ steps: 10, stepLength: 1, turnDeg: 0, sigmaThetaDeg: 5, sigmaXY: 0.03 });
    expect(POSES.samples).toBe(2000);
    expect(POSES.seed).toBe(4);
  });
  it('ellipse 69%, tangent region 97%; heading spread 15.8°', () => {
    expect(pct(r.cov.cartesian)).toBe(69);
    expect(pct(r.cov.tangent)).toBe(97);
    expect(headingSpreadDeg(r.tan.P).toFixed(1)).toBe('15.8');
  });
  it('the runs average 0.17 m short of the planned end', () => {
    const mx = r.poses.reduce((s, q) => s + q.x, 0) / r.poses.length;
    expect((r.tan.mean.x - mx).toFixed(2)).toBe('0.17');
  });
  it('sideways variance d²σ²Σm² + Nσ_xy² = 2.18 m², std 1.48 m', () => {
    const s = (5 * Math.PI) / 180;
    let sum = 0;
    for (let m = 0; m < 10; m++) sum += m * m;
    const v = s * s * sum + 10 * 0.03 ** 2;
    expect(r.tan.P.data[4]!).toBeCloseTo(v, 12);
    expect(v.toFixed(2)).toBe('2.18');
    expect(Math.sqrt(v).toFixed(2)).toBe('1.48');
  });
  it('first-order mismatch along the path: 0.15 m in the runs vs 0.095 m predicted; 86% in 3D', () => {
    const { cov } = sampleCov(r.poses.map((T) => se2.log(se2.between(r.tan.mean, T))));
    expect(Math.sqrt(cov.data[0]!).toFixed(2)).toBe('0.15');
    expect(Math.sqrt(r.tan.P.data[0]!).toFixed(3)).toBe('0.095');
    expect(pct(r.cov.tangent3)).toBe(86);
  });
  it('the grid behind the region holds more than 99.9% of the probability', () => {
    expect(r.reg.gridMass).toBeGreaterThan(0.999);
  });
});

describe('post 22: try this', () => {
  it('1° per step: both 95%', () => {
    const r = run({ sigmaThetaDeg: 1 });
    expect([pct(r.cov.cartesian), pct(r.cov.tangent)]).toEqual([95, 95]);
  });
  it('10° per step: heading spread 31.6°, ellipse 30%, tangent 95%', () => {
    const r = run({ sigmaThetaDeg: 10 });
    expect(headingSpreadDeg(r.tan.P).toFixed(1)).toBe('31.6');
    expect([pct(r.cov.cartesian), pct(r.cov.tangent)]).toEqual([30, 95]);
  });
  it('20 steps: 39% vs 96%', () => {
    const r = run({ steps: 20 });
    expect([pct(r.cov.cartesian), pct(r.cov.tangent)]).toEqual([39, 96]);
  });
  it('turn 10° per step: ellipse 88%; the position spread is smaller than on the straight drive', () => {
    const r = run({ turnDeg: 10 });
    expect(pct(r.cov.cartesian)).toBe(88);
    const big = (P: typeof r.cart.P) =>
      eigSym(
        fromArrays([
          [P.data[0]!, P.data[1]!],
          [P.data[3]!, P.data[4]!],
        ]),
      ).values[0]!;
    expect(big(r.cart.P)).toBeLessThan(big(run().cart.P));
  });
});

describe('post 22: formulas', () => {
  it('the hook lever: 10 m with 15° off is 2.6 m aside and 0.34 m short', () => {
    expect((10 * Math.sin((15 * Math.PI) / 180)).toFixed(1)).toBe('2.6');
    expect((10 * (1 - Math.cos((15 * Math.PI) / 180))).toFixed(2)).toBe('0.34');
  });
  it('the adjoint of a straight move inverted is [[1,0,0],[0,1,d],[0,0,1]]', () => {
    const { delta } = stepModel({ ...POSES.defaults, stepLength: 1.7 });
    const A = se2.adjoint(se2.inverse(delta));
    expect(
      maxAbsDiff(
        A,
        fromArrays([
          [1, 0, 0],
          [0, 1, 1.7],
          [0, 0, 1],
        ]),
      ),
    ).toBeLessThan(1e-15);
  });
  it('Exp(τ) X = X Exp(Ad_{X⁻¹} τ), and the left-perturbation covariance is Ad P Adᵀ', () => {
    const X = se2.pose(1, -2, 0.7);
    const tau = Float64Array.of(0.3, 0.1, -0.4);
    const A = se2.adjoint(se2.inverse(X));
    const at = Float64Array.from([0, 1, 2].map((r) => tau.reduce((s, v, c) => s + A.data[r * 3 + c]! * v, 0)));
    const l = se2.compose(se2.exp(tau), X);
    const rr = se2.compose(X, se2.exp(at));
    expect(Math.hypot(l.x - rr.x, l.y - rr.y, l.theta - rr.theta)).toBeLessThan(1e-14);
  });
});
