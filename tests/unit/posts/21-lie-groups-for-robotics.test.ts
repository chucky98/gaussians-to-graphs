/** Every concrete claim in post 21, checked against the formulas and the widgets' defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  SE2EXP,
  TANGENT,
  arcRadius,
  expEnd,
  naiveSum,
  poseDistance,
  startPose,
  steps,
  tangentState,
} from '../../../src/lib/demos/lie-groups';
import { oplus } from '../../../src/lib/geometry/lie';
import * as se2 from '../../../src/lib/geometry/se2';
import * as se3 from '../../../src/lib/geometry/se3';
import * as so3 from '../../../src/lib/geometry/so3';
import { SO2, angleDiff } from '../../../src/lib/geometry/so2';
import { fromArrays, identity, maxAbsDiff, mul, scale, add, getBlock } from '../../../src/lib/math/matrix';

const DEG = 180 / Math.PI;
const d1 = (r: number) => (r * DEG).toFixed(1);

describe('post 21: the hook and the groups', () => {
  it('from −179° to 179° is a turn of 2° (SO(2) ⊖)', () => {
    const a = SO2.exp(Float64Array.of(-179 / DEG));
    const b = SO2.exp(Float64Array.of(179 / DEG));
    expect(Math.abs(angleDiff(b, a) * DEG)).toBeCloseTo(2, 10);
  });
  it('the SE(2) matrix product is pose composition', () => {
    const A = se2.pose(1, 2, 0.4);
    const B = se2.pose(-0.5, 0.3, 1.2);
    expect(maxAbsDiff(mul(se2.toMatrix(A), se2.toMatrix(B)), se2.toMatrix(se2.compose(A, B)))).toBeLessThan(1e-15);
  });
});

describe('post 21: Exp, Log, V(θ), adjoint', () => {
  it('(1): (I + τ^/N)^N → Exp(τ) on SE(2)', () => {
    const tau = Float64Array.of(2, 0.3, 1.5);
    let M = identity(3);
    const N = 1 << 16;
    const step = add(identity(3), scale(se2.hat(tau), 1 / N));
    for (let i = 0; i < 16; i++) M = i === 0 ? mul(step, step) : mul(M, M);
    expect(maxAbsDiff(M, se2.toMatrix(se2.exp(tau)))).toBeLessThan(1e-3);
  });
  it('(2): t = V(θ) ρ with V as written; V → I as θ → 0', () => {
    const th = 1.5;
    const V = fromArrays([
      [Math.sin(th) / th, -(1 - Math.cos(th)) / th],
      [(1 - Math.cos(th)) / th, Math.sin(th) / th],
    ]);
    const T = se2.exp(Float64Array.of(2, 0.5, th));
    expect(T.x).toBeCloseTo(V.data[0]! * 2 + V.data[1]! * 0.5, 14);
    expect(T.y).toBeCloseTo(V.data[2]! * 2 + V.data[3]! * 0.5, 14);
    const v = se2.vMatrix(1e-8);
    expect(v[0]).toBeCloseTo(1, 14);
    expect(v[1]).toBeCloseTo(0, 7);
  });
  it('the SE(2) Exp arc equals the sinc-form velocity motion model of Post 14 (no sideways velocity)', () => {
    // The chord v·dt·sinc(ωdt/2) at heading θ + ωdt/2, with dt = 1 and θ = 0.
    const [v, w] = [2, 1.5];
    const T = se2.exp(Float64Array.of(v, 0, w));
    const chord = v * (Math.sin(w / 2) / (w / 2));
    expect(T.x).toBeCloseTo(chord * Math.cos(w / 2), 14);
    expect(T.y).toBeCloseTo(chord * Math.sin(w / 2), 14);
  });
  it('(3): X ⊕ (Y ⊖ X) = Y; (4): X ⊕ τ = Exp(Ad_X τ) ∘ X with the stated SE(2) adjoint', () => {
    const X = se2.pose(1.5, -0.7, 2.1);
    const tau = Float64Array.of(0.4, -0.2, 0.9);
    const Ad = fromArrays([
      [Math.cos(X.theta), -Math.sin(X.theta), X.y],
      [Math.sin(X.theta), Math.cos(X.theta), -X.x],
      [0, 0, 1],
    ]);
    expect(maxAbsDiff(Ad, se2.adjoint(X))).toBeLessThan(1e-15);
    const adt = Float64Array.from([0, 1, 2].map((r) => tau.reduce((s, v, c) => s + Ad.data[r * 3 + c]! * v, 0)));
    const lhs = oplus(se2.SE2, X, tau);
    const rhs = se2.compose(se2.exp(adt), X);
    expect(Math.hypot(lhs.x - rhs.x, lhs.y - rhs.y, angleDiff(lhs.theta, rhs.theta))).toBeLessThan(1e-14);
  });
  it('SO(3): the stated J_r; SE(3): Exp = (Exp θ, J_l(θ) ρ) and the block adjoint', () => {
    const th = Float64Array.of(0.4, -0.9, 0.3);
    const t = Math.hypot(...th);
    const K = so3.hat(th);
    const Jr = add(
      add(identity(3), scale(K, -(1 - Math.cos(t)) / t ** 2)),
      scale(mul(K, K), (t - Math.sin(t)) / t ** 3),
    );
    expect(maxAbsDiff(Jr, so3.jr(th))).toBeLessThan(1e-15);
    const rho = Float64Array.of(1, 2, -0.5);
    const T = se3.exp(Float64Array.of(...rho, ...th));
    const tt = so3.act(so3.jl(th), rho);
    expect(Math.hypot(...T.t.map((v, i) => v - tt[i]!))).toBeLessThan(1e-14);
    const Ad = se3.adjoint(T);
    expect(maxAbsDiff(getBlock(Ad, 0, 3, 3, 3), mul(so3.hat(T.t), T.C))).toBeLessThan(1e-15);
  });
});

describe('post 21: TangentSpace', () => {
  it('defaults: X at 30°, τ = 1.2: lands 68.8° past X at 98.8°; pulled back 50.2°; tip 0.56 off', () => {
    const s = tangentState(TANGENT.defaults.xDeg, TANGENT.defaults.tau);
    expect(d1(TANGENT.defaults.tau)).toBe('68.8');
    expect(d1(s.exactAngle)).toBe('98.8');
    expect(d1(s.projectedTurn)).toBe('50.2');
    expect(s.offCircle.toFixed(2)).toBe('0.56');
  });
  it('τ = 0.2: 11.3° instead of 11.5°; tip 0.02 off', () => {
    const s = tangentState(30, 0.2);
    expect(d1(s.projectedTurn)).toBe('11.3');
    expect(d1(0.2)).toBe('11.5');
    expect(s.offCircle.toFixed(2)).toBe('0.02');
  });
  it('τ = 4: lands at −100.8°; ⊖ returns −2.28 = 4 − 2π', () => {
    const s = tangentState(30, 4);
    expect(d1(s.exactAngle)).toBe('-100.8');
    expect(s.back.toFixed(2)).toBe('-2.28');
    expect(s.back).toBeCloseTo(4 - 2 * Math.PI, 12);
  });
  it('moving X changes only where X ⊕ τ lands', () => {
    const a = tangentState(30, 1.2);
    for (const x of [-150, -60, 100, 170]) {
      const b = tangentState(x, 1.2);
      expect(b.projectedTurn).toBeCloseTo(a.projectedTurn, 14);
      expect(b.offCircle).toBeCloseTo(a.offCircle, 14);
      expect(b.back).toBeCloseTo(a.back, 12);
      expect(b.exactAngle).not.toBeCloseTo(a.exactAngle, 3);
    }
  });
});

describe('post 21: SE2Exp', () => {
  const D = SE2EXP.defaults;
  const tw = { rho1: D.rho1, rho2: D.rho2, theta: D.theta };
  it('defaults: 2 m forward, turn 1.5 rad; ends at (1.33, 1.24) facing 86°; radius 1.33; naive (2, 0), 1.41 m away', () => {
    expect([D.rho1, D.rho2, D.theta, D.headingDeg, D.steps]).toEqual([2, 0, 1.5, 0, 4]);
    const e = expEnd(startPose(0), tw);
    expect([e.x.toFixed(2), e.y.toFixed(2), Math.round(e.theta * DEG)]).toEqual(['1.33', '1.24', 86]);
    expect(arcRadius(tw).toFixed(2)).toBe('1.33');
    const n = naiveSum(startPose(0), tw);
    expect([n.x, n.y]).toEqual([2, 0]);
    expect(poseDistance(e, n).toFixed(2)).toBe('1.41');
  });
  it('N steps: 1 is the naive answer (1.41); 2, 4, 8 → 0.69, 0.34, 0.17; 64 → 0.02', () => {
    const X = startPose(0);
    const e = expEnd(X, tw);
    const err = (N: number) => poseDistance(steps(X, tw, N)[N]!, e).toFixed(2);
    expect(poseDistance(steps(X, tw, 1)[1]!, naiveSum(X, tw))).toBeLessThan(1e-15);
    expect([1, 2, 4, 8, 64].map(err)).toEqual(['1.41', '0.69', '0.34', '0.17', '0.02']);
  });
  it('start heading 90°: Exp ends at (−1.24, 1.33); the naive sum at (2, 0), 3.50 m away', () => {
    const X = startPose(90);
    const e = expEnd(X, tw);
    expect([e.x.toFixed(2), e.y.toFixed(2)]).toEqual(['-1.24', '1.33']);
    const n = naiveSum(X, tw);
    expect([n.x, n.y]).toEqual([2, 0]);
    expect(poseDistance(e, n).toFixed(2)).toBe('3.50');
  });
});
