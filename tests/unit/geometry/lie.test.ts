/**
 * DESIGN §8.1 geometry invariants, checked for every group: Exp(Log(X)) = X; Log(Exp(τ)) = τ for rotation
 * angles below π; compose is associative; X ∘ X⁻¹ = I; and every analytic Jacobian matches central
 * finite differences on the manifold (relative error < 1e-6).
 */
import { describe, expect, it } from 'vitest';
import {
  composeCovariance,
  composeJacobians,
  interpolate,
  inverseJacobian,
  ominus,
  ominusJacobians,
  oplus,
  oplusJacobians,
  type LieGroup,
} from '../../../src/lib/geometry/lie';
import * as se2 from '../../../src/lib/geometry/se2';
import * as se3 from '../../../src/lib/geometry/se3';
import * as so2 from '../../../src/lib/geometry/so2';
import * as so3 from '../../../src/lib/geometry/so3';
import { identity, maxAbsDiff, mul, transpose, zeros, type Mat, type Vec } from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';

const rng = createRng(2024);

/** Central-difference Jacobian of f: A → B where A is perturbed by `plus` and B compared by `minus`. */
function fd<A, B>(
  f: (a: A) => B,
  a: A,
  plus: (a: A, d: Vec) => A,
  minus: (b: B, b0: B) => Vec,
  n: number,
  h = 1e-6,
): Mat {
  const f0 = f(a);
  const cols: Vec[] = [];
  for (let j = 0; j < n; j++) {
    const e = new Float64Array(n);
    e[j] = h;
    const p = minus(f(plus(a, e)), f0);
    const m = minus(
      f(
        plus(
          a,
          e.map((v) => -v),
        ),
      ),
      f0,
    );
    cols.push(p.map((v, i) => (v - m[i]!) / (2 * h)));
  }
  const J = zeros(cols[0]!.length, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < cols[0]!.length; i++) J.data[i * n + j] = cols[j]![i]!;
  return J;
}

function relErr(a: Mat, b: Mat): number {
  let s = 1;
  for (const v of a.data) s = Math.max(s, Math.abs(v));
  return maxAbsDiff(a, b) / s;
}

const vadd = (a: Vec, d: Vec) => a.map((v, i) => v + d[i]!);
const vsub = (a: Vec, b: Vec) => a.map((v, i) => v - b[i]!);
const vnorm = (a: Vec) => Math.hypot(...a);

interface Case<G> {
  G: LieGroup<G>;
  /** A random tangent vector whose rotation angle is at most maxAngle. */
  tau: (maxAngle: number) => Vec;
  /** Index range of the rotation part of τ. */
  rot: [number, number];
}

function randomTau(dof: number, rot: [number, number], maxAngle: number): Vec {
  const tau = new Float64Array(dof);
  for (let i = 0; i < dof; i++) tau[i] = rng.uniformRange(-2, 2);
  const nr = rot[1] - rot[0];
  // Uniform direction, angle uniform in [0, maxAngle].
  const dir = Array.from({ length: nr }, () => rng.normal());
  const dn = Math.hypot(...dir);
  const ang = nr === 1 ? rng.uniformRange(-maxAngle, maxAngle) : rng.uniformRange(0, maxAngle);
  for (let i = 0; i < nr; i++) tau[rot[0] + i] = nr === 1 ? ang : (ang * dir[i]!) / dn;
  return tau;
}

const cases: Case<unknown>[] = [
  { G: so2.SO2, rot: [0, 1], tau: (m) => randomTau(1, [0, 1], m) },
  { G: se2.SE2, rot: [2, 3], tau: (m) => randomTau(3, [2, 3], m) },
  { G: so3.SO3, rot: [0, 3], tau: (m) => randomTau(3, [0, 3], m) },
  { G: se3.SE3, rot: [3, 6], tau: (m) => randomTau(6, [3, 6], m) },
] as Case<unknown>[];

/** Angles that exercise the series branch (< 0.05), its edge, the direct branch and large rotations. */
const ANGLES = [1e-9, 1e-5, 0.03, 0.049, 0.051, 0.5, 2, 3];

for (const { G, tau } of cases) {
  const rand = () => G.exp(tau(3));
  const dist = (a: unknown, b: unknown) => vnorm(ominus(G, a, b));
  const plus = (X: unknown, d: Vec) => oplus(G, X, d);
  const minus = (Y: unknown, X: unknown) => ominus(G, Y, X);

  describe(`${G.name}`, () => {
    it('Exp(Log(X)) = X and Log(Exp(τ)) = τ for rotation angles below π', () => {
      for (let i = 0; i < 200; i++) {
        const X = rand();
        expect(dist(G.exp(G.log(X)), X)).toBeLessThan(1e-12);
      }
      for (const a of ANGLES)
        for (let i = 0; i < 20; i++) {
          const t = tau(a);
          expect(vnorm(vsub(G.log(G.exp(t)), t))).toBeLessThan(1e-12);
        }
    });
    it('compose is associative; X ∘ X⁻¹ = I; the identity is neutral', () => {
      for (let i = 0; i < 100; i++) {
        const [a, b, c] = [rand(), rand(), rand()];
        expect(dist(G.compose(G.compose(a, b), c), G.compose(a, G.compose(b, c)))).toBeLessThan(1e-12);
        expect(vnorm(G.log(G.compose(a, G.inverse(a))))).toBeLessThan(1e-12);
        expect(vnorm(G.log(G.compose(G.inverse(a), a)))).toBeLessThan(1e-12);
        expect(dist(G.compose(a, G.identity()), a)).toBeLessThan(1e-14);
      }
    });
    it('X ⊕ (Y ⊖ X) = Y; interpolate hits both ends', () => {
      for (let i = 0; i < 100; i++) {
        const [X, Y] = [rand(), rand()];
        expect(dist(oplus(G, X, ominus(G, Y, X)), Y)).toBeLessThan(1e-11);
        expect(dist(interpolate(G, X, Y, 0), X)).toBeLessThan(1e-12);
        expect(dist(interpolate(G, X, Y, 1), Y)).toBeLessThan(1e-11);
      }
    });
    it('adjoint: Exp(Ad_X τ) = X Exp(τ) X⁻¹, and J_l(τ) = Ad_{Exp τ} J_r(τ) = J_r(−τ)', () => {
      for (let i = 0; i < 100; i++) {
        const X = rand();
        const t = tau(2.5);
        const ad = G.adjoint(X);
        const adt = Float64Array.from({ length: G.dof }, (_, r) =>
          t.reduce((s, v, c) => s + ad.data[r * G.dof + c]! * v, 0),
        );
        expect(dist(G.exp(adt), G.compose(G.compose(X, G.exp(t)), G.inverse(X)))).toBeLessThan(1e-11);
        expect(maxAbsDiff(G.jl(t), mul(G.adjoint(G.exp(t)), G.jr(t)))).toBeLessThan(1e-11);
        expect(maxAbsDiff(G.jl(t), G.jr(t.map((v) => -v)))).toBeLessThan(1e-12);
      }
    });
    it('J_r⁻¹ J_r = I and J_l⁻¹ J_l = I', () => {
      for (const a of ANGLES)
        for (let i = 0; i < 10; i++) {
          const t = tau(a);
          expect(maxAbsDiff(mul(G.jrInv(t), G.jr(t)), identity(G.dof))).toBeLessThan(1e-10);
          expect(maxAbsDiff(mul(G.jlInv(t), G.jl(t)), identity(G.dof))).toBeLessThan(1e-10);
        }
    });
    it('J_r and J_l match finite differences of Exp, at small, medium and large angles', () => {
      for (const a of ANGLES)
        for (let i = 0; i < 10; i++) {
          const t = tau(a);
          const right = fd(G.exp, t, vadd, minus, G.dof);
          const left = fd(G.exp, t, vadd, (Y, X) => G.log(G.compose(Y, G.inverse(X))), G.dof);
          expect(relErr(G.jr(t), right)).toBeLessThan(1e-6);
          expect(relErr(G.jl(t), left)).toBeLessThan(1e-6);
        }
    });
    it('Jacobians of compose, inverse, ⊕ and ⊖ match finite differences', () => {
      for (let i = 0; i < 30; i++) {
        const [X, Y] = [rand(), rand()];
        const t = tau(2.5);
        const cj = composeJacobians(G, X, Y);
        expect(
          relErr(
            cj.dX,
            fd((A) => G.compose(A, Y), X, plus, minus, G.dof),
          ),
        ).toBeLessThan(1e-6);
        expect(
          relErr(
            cj.dY,
            fd((B) => G.compose(X, B), Y, plus, minus, G.dof),
          ),
        ).toBeLessThan(1e-6);
        expect(relErr(inverseJacobian(G, X), fd(G.inverse, X, plus, minus, G.dof))).toBeLessThan(1e-6);
        const oj = oplusJacobians(G, X, t);
        expect(
          relErr(
            oj.dX,
            fd((A) => oplus(G, A, t), X, plus, minus, G.dof),
          ),
        ).toBeLessThan(1e-6);
        expect(
          relErr(
            oj.dTau,
            fd((d) => oplus(G, X, d), t, vadd, minus, G.dof),
          ),
        ).toBeLessThan(1e-6);
        // Keep Y close enough to X that Y ⊖ X stays away from the cut at angle π.
        const Yn = oplus(G, X, tau(2.5));
        const mj = ominusJacobians(G, Yn, X);
        expect(
          relErr(
            mj.dY,
            fd((B) => ominus(G, B, X), Yn, plus, vsub, G.dof),
          ),
        ).toBeLessThan(1e-6);
        expect(
          relErr(
            mj.dX,
            fd((A) => ominus(G, Yn, A), X, plus, vsub, G.dof),
          ),
        ).toBeLessThan(1e-6);
      }
    });
    it('composeCovariance is Ad_{Z⁻¹} Px Adᵀ + Pz', () => {
      const Z = rand();
      const Px = identity(G.dof);
      const Pz = identity(G.dof);
      const A = G.adjoint(G.inverse(Z));
      const expected = mul(A, transpose(A));
      for (let i = 0; i < G.dof; i++) expected.data[i * G.dof + i]! += 1;
      expect(maxAbsDiff(composeCovariance(G, Z, Px, Pz), expected)).toBeLessThan(1e-12);
    });
  });
}

describe('act Jacobians match finite differences', () => {
  it('SE(2)', () => {
    for (let i = 0; i < 50; i++) {
      const T = se2.exp(randomTau(3, [2, 3], 3));
      const p: [number, number] = [rng.uniformRange(-3, 3), rng.uniformRange(-3, 3)];
      const J = se2.actJacobians(T, p);
      const f = (X: se2.Pose2) => Float64Array.from(se2.act(X, p));
      expect(
        relErr(
          J.dT,
          fd(f, T, (X, d) => oplus(se2.SE2, X, d), vsub, 3),
        ),
      ).toBeLessThan(1e-6);
      const g = (q: Vec) => Float64Array.from(se2.act(T, [q[0]!, q[1]!]));
      expect(relErr(J.dP, fd(g, Float64Array.from(p), vadd, vsub, 2))).toBeLessThan(1e-6);
    }
  });
  it('SO(3)', () => {
    for (let i = 0; i < 50; i++) {
      const C = so3.exp(randomTau(3, [0, 3], 3));
      const p = Float64Array.of(rng.normal(), rng.normal(), rng.normal());
      const J = so3.actJacobians(C, p);
      expect(
        relErr(
          J.dC,
          fd(
            (X: Mat) => so3.act(X, p),
            C,
            (X, d) => oplus(so3.SO3, X, d),
            vsub,
            3,
          ),
        ),
      ).toBeLessThan(1e-6);
      expect(
        relErr(
          J.dP,
          fd((q: Vec) => so3.act(C, q), p, vadd, vsub, 3),
        ),
      ).toBeLessThan(1e-6);
    }
  });
  it('SE(3)', () => {
    for (let i = 0; i < 50; i++) {
      const T = se3.exp(randomTau(6, [3, 6], 3));
      const p = Float64Array.of(rng.normal(), rng.normal(), rng.normal());
      const J = se3.actJacobians(T, p);
      expect(
        relErr(
          J.dT,
          fd(
            (X: se3.Pose3) => se3.act(X, p),
            T,
            (X, d) => oplus(se3.SE3, X, d),
            vsub,
            6,
          ),
        ),
      ).toBeLessThan(1e-6);
      expect(
        relErr(
          J.dP,
          fd((q: Vec) => se3.act(T, q), p, vadd, vsub, 3),
        ),
      ).toBeLessThan(1e-6);
    }
  });
});

describe('hat, vee and matrix forms', () => {
  it('vee(hat(τ)) = τ, and Exp agrees with the matrix exponential of τ^', () => {
    const expm = (A: Mat) => {
      // Scaling and squaring with a Taylor series: plenty for test-sized matrices.
      const n = A.rows;
      let s = 0;
      let norm = 0;
      for (const v of A.data) norm = Math.max(norm, Math.abs(v));
      while (norm > 0.1) {
        norm /= 2;
        s++;
      }
      const B = { ...A, data: A.data.map((v) => v / 2 ** s) };
      let term = identity(n);
      let sum = identity(n);
      for (let k = 1; k < 20; k++) {
        term = mul(term, B);
        term = { ...term, data: term.data.map((v) => v / k) };
        sum = { ...sum, data: sum.data.map((v, i) => v + term.data[i]!) };
      }
      for (let i = 0; i < s; i++) sum = mul(sum, sum);
      return sum;
    };
    for (let i = 0; i < 30; i++) {
      const t2 = randomTau(3, [2, 3], 3);
      expect(vnorm(vsub(se2.vee(se2.hat(t2)), t2))).toBe(0);
      expect(maxAbsDiff(expm(se2.hat(t2)), se2.toMatrix(se2.exp(t2)))).toBeLessThan(1e-12);
      const t3 = randomTau(3, [0, 3], 3);
      expect(vnorm(vsub(so3.vee(so3.hat(t3)), t3))).toBe(0);
      expect(maxAbsDiff(expm(so3.hat(t3)), so3.exp(t3))).toBeLessThan(1e-12);
      const t6 = randomTau(6, [3, 6], 3);
      expect(vnorm(vsub(se3.vee(se3.hat(t6)), t6))).toBe(0);
      expect(maxAbsDiff(expm(se3.hat(t6)), se3.toMatrix(se3.exp(t6)))).toBeLessThan(1e-12);
      const a = rng.uniformRange(-3, 3);
      expect(so2.vee(so2.hat(a))).toBe(a);
      expect(maxAbsDiff(expm(so2.hat(a)), so2.toMatrix(a))).toBeLessThan(1e-12);
      expect(so2.fromMatrix(so2.toMatrix(a))).toBeCloseTo(a, 14);
      const T = se2.exp(t2);
      const back = se2.fromMatrix(se2.toMatrix(T));
      expect(Math.hypot(back.x - T.x, back.y - T.y, back.theta - T.theta)).toBeLessThan(1e-14);
    }
  });
  it('SE(2) Exp drives the constant-twist arc: a quarter circle of radius 1', () => {
    const T = se2.exp(Float64Array.of(Math.PI / 2, 0, Math.PI / 2));
    expect(T.x).toBeCloseTo(1, 14);
    expect(T.y).toBeCloseTo(1, 14);
    expect(T.theta).toBeCloseTo(Math.PI / 2, 14);
  });
  it('SO(3) Log is accurate right next to angle π', () => {
    for (let i = 0; i < 50; i++) {
      const dir = randomTau(3, [0, 3], 1);
      const u = dir.map((v) => v / vnorm(dir));
      const phi = u.map((v) => v * (Math.PI - 1e-7));
      const back = so3.log(so3.exp(phi));
      expect(vnorm(vsub(back, phi))).toBeLessThan(1e-8);
    }
  });
  it('SE(3) Log(Exp(τ)) right next to angle π', () => {
    const t = Float64Array.of(0.3, -0.2, 0.5, 0, 0, Math.PI - 1e-6);
    expect(vnorm(vsub(se3.log(se3.exp(t)), t))).toBeLessThan(1e-8);
  });
});
