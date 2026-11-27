/**
 * DESIGN §8.1 solver, marginalize and io invariants: factor Jacobians match finite differences on the
 * manifold; Gauss–Newton solves a linear problem in one iteration; a noise-free synthetic pose graph reaches
 * cost ≈ 0 and recovers the truth; LM decreases the cost monotonically; the Schur-complement marginal equals
 * the covariance-form marginal; g2o read–write–read round trip.
 */
import { describe, expect, it } from 'vitest';
import {
  betweenFactorSE2,
  betweenFactorSE3,
  factorCost,
  pointPriorFactor,
  priorFactorSE2,
  rangeBearingFactor,
  reprojectionFactor,
  type Factor,
} from '../../../src/lib/graph/factors';
import { readG2o, writeG2o } from '../../../src/lib/graph/io';
import { marginalize } from '../../../src/lib/graph/marginalize';
import { buildPoseGraph, posesOf } from '../../../src/lib/graph/pose-graph';
import { graphCost, linearizeGraph, optimizeGraph } from '../../../src/lib/graph/solver';
import {
  ordering,
  point2,
  point3,
  pose2,
  pose3,
  retractVar,
  values,
  type Values,
  type Variable,
} from '../../../src/lib/graph/values';
import * as se2 from '../../../src/lib/geometry/se2';
import * as se3 from '../../../src/lib/geometry/se3';
import { diag, fromArrays, identity, inverse, maxAbsDiff, select, zeros, type Mat } from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';
import { manhattan, MANHATTAN_DEFAULTS } from '../../../src/lib/sim/manhattan';
import { randomSPD } from '../helpers';

const rng = createRng(26);

/** Finite-difference Jacobian of f.residual with respect to variable k (right perturbations). */
function fdJacobian(f: Factor, v: Values, k: string): Mat {
  const x = v.get(k)!;
  const n = x.kind === 'se2' ? 3 : x.kind === 'se3' ? 6 : x.value.length;
  const J = zeros(f.dim, n);
  const h = 1e-6;
  for (let c = 0; c < n; c++) {
    const d = new Float64Array(n);
    d[c] = h;
    const vp = new Map(v).set(k, retractVar(x, d));
    d[c] = -h;
    const vm = new Map(v).set(k, retractVar(x, d));
    const rp = f.residual(vp);
    const rm = f.residual(vm);
    for (let r = 0; r < f.dim; r++) J.data[r * n + c] = (rp[r]! - rm[r]!) / (2 * h);
  }
  return J;
}

function checkJacobians(f: Factor, v: Values) {
  const { J } = f.linearize(v);
  f.keys.forEach((k, i) => {
    const num = fdJacobian(f, v, k);
    let scaleMax = 1;
    for (const x of J[i]!.data) scaleMax = Math.max(scaleMax, Math.abs(x));
    expect(maxAbsDiff(J[i]!, num) / scaleMax).toBeLessThan(1e-6);
  });
}

const randPose2 = () => se2.pose(rng.uniformRange(-3, 3), rng.uniformRange(-3, 3), rng.uniformRange(-3, 3));
const randPose3 = () =>
  se3.exp(Float64Array.from({ length: 6 }, (_, i) => (i < 3 ? rng.uniformRange(-2, 2) : rng.uniformRange(-1, 1))));

describe('factor Jacobians match finite differences', () => {
  it('SE(2) prior and between, SE(3) between, range–bearing, point prior', () => {
    for (let rep = 0; rep < 20; rep++) {
      const v = values([
        ['a', pose2(randPose2())],
        ['b', pose2(randPose2())],
        ['l', point2(rng.uniformRange(-5, 5), rng.uniformRange(-5, 5))],
        ['c', pose3(randPose3())],
        ['d', pose3(randPose3())],
      ]);
      checkJacobians(priorFactorSE2('a', randPose2(), identity(3)), v);
      checkJacobians(betweenFactorSE2('a', 'b', randPose2(), identity(3)), v);
      checkJacobians(betweenFactorSE3('c', 'd', randPose3(), identity(6)), v);
      checkJacobians(rangeBearingFactor('a', 'l', Float64Array.of(3, 0.4), identity(2)), v);
      checkJacobians(pointPriorFactor('l', Float64Array.of(1, 2), identity(2)), v);
    }
  });
  it('reprojection factor (camera SE(3), point 3D) matches finite differences', () => {
    const K = { fx: 500, fy: 480, cx: 320, cy: 240 };
    for (let rep = 0; rep < 20; rep++) {
      const cam = se3.exp(
        Float64Array.of(
          rng.normal(),
          rng.normal(),
          rng.normal(),
          0.3 * rng.normal(),
          0.3 * rng.normal(),
          0.3 * rng.normal(),
        ),
      );
      // A point 4–8 m in front of the camera, in world coordinates.
      const pc = Float64Array.of(rng.uniformRange(-1, 1), rng.uniformRange(-1, 1), rng.uniformRange(4, 8));
      const pw = se3.act(cam, pc);
      const v = values([
        ['c', pose3(cam)],
        ['p', point3(pw[0]!, pw[1]!, pw[2]!)],
      ]);
      checkJacobians(reprojectionFactor('c', 'p', Float64Array.of(300, 200), K, identity(2)), v);
    }
  });
  it('a between factor has zero residual at the measured relative pose', () => {
    const A = randPose2();
    const Z = randPose2();
    const v = values([
      ['a', pose2(A)],
      ['b', pose2(se2.compose(A, Z))],
    ]);
    expect(factorCost(betweenFactorSE2('a', 'b', Z, identity(3)), v)).toBeLessThan(1e-24);
  });
});

/** A linear factor r = p_j − p_i − d between 2D points (for the one-step test). */
function linearBetween(ki: string, kj: string, d: [number, number], info: Mat): Factor {
  const I = identity(2);
  const mI = diag([-1, -1]);
  const res = (v: Values) => {
    const pi = (v.get(ki) as Variable & { kind: 'point2' }).value;
    const pj = (v.get(kj) as Variable & { kind: 'point2' }).value;
    return Float64Array.of(pj[0]! - pi[0]! - d[0], pj[1]! - pi[1]! - d[1]);
  };
  return {
    type: 'lin',
    keys: [ki, kj],
    dim: 2,
    information: info,
    residual: res,
    linearize: (v) => ({ r: res(v), J: [mI, I] }),
  };
}

describe('graph solver', () => {
  it('Gauss–Newton solves a linear problem in one iteration', () => {
    const n = 8;
    const factors: Factor[] = [pointPriorFactor('p0', Float64Array.of(0, 0), identity(2))];
    for (let i = 1; i < n; i++)
      factors.push(
        linearBetween(`p${i - 1}`, `p${i}`, [1 + rng.normal() * 0.1, rng.normal() * 0.1], randomSPD(rng, 2)),
      );
    factors.push(linearBetween('p0', `p${n - 1}`, [7, 0.3], randomSPD(rng, 2)));
    const init = values(
      Array.from({ length: n }, (_, i) => [`p${i}`, point2(rng.normal() * 5, rng.normal() * 5)] as [string, Variable]),
    );
    const its = optimizeGraph(factors, init, { method: 'gn', maxIterations: 5 });
    // After one step the gradient is zero: a second step does not move.
    const sys = linearizeGraph(factors, its[1]!.values, ordering(its[1]!.values));
    expect(Math.max(...sys.eta.map(Math.abs))).toBeLessThan(1e-9);
    expect(its[2]!.cost).toBeCloseTo(its[1]!.cost, 12);
  });
  it('a noise-free synthetic pose graph reaches cost ≈ 0 and recovers the truth (gauge fixed by the prior)', () => {
    const d = manhattan({ ...MANHATTAN_DEFAULTS, poses: 200, sigmaXY: 0, sigmaTheta: 0, seed: 5 });
    // Noise-free measurements, but a badly perturbed initial guess.
    const init = d.truth.map((p, i) =>
      i === 0 ? p : se2.pose(p.x + rng.normal() * 0.3, p.y + rng.normal() * 0.3, p.theta + rng.normal() * 0.1),
    );
    const g = buildPoseGraph(init, d.odometry, d.loops, identity(3));
    const its = optimizeGraph(g.factors, g.initial, { method: 'gn', maxIterations: 20 });
    expect(its.at(-1)!.cost).toBeLessThan(1e-16);
    const p = posesOf(its.at(-1)!.values, 200);
    p.forEach((q, i) => {
      expect(Math.hypot(q.x - d.truth[i]!.x, q.y - d.truth[i]!.y)).toBeLessThan(1e-7);
      expect(Math.abs(se2.log(se2.between(q, d.truth[i]!))[2]!)).toBeLessThan(1e-7);
    });
  });
  it('Levenberg–Marquardt decreases the cost monotonically (Manhattan, 300 poses, dead-reckoning start)', () => {
    const d = manhattan({ ...MANHATTAN_DEFAULTS, poses: 300 });
    const g = buildPoseGraph(d.initial, d.odometry, d.loops, d.information);
    const its = optimizeGraph(g.factors, g.initial, { method: 'lm', maxIterations: 15 });
    for (let k = 1; k < its.length; k++) expect(its[k]!.cost).toBeLessThanOrEqual(its[k - 1]!.cost);
    expect(its.at(-1)!.cost).toBeLessThan(its[0]!.cost / 100);
    expect(graphCost(g.factors, its.at(-1)!.values)).toBeCloseTo(its.at(-1)!.cost, 9);
  });
  it('minimum-degree and natural orderings give the same solution', () => {
    const d = manhattan({ ...MANHATTAN_DEFAULTS, poses: 120, seed: 9 });
    const g = buildPoseGraph(d.initial, d.odometry, d.loops, d.information);
    const a = optimizeGraph(g.factors, g.initial, { method: 'gn', maxIterations: 1 });
    const b = optimizeGraph(g.factors, g.initial, { method: 'gn', maxIterations: 1, ordering: 'natural' });
    const pa = posesOf(a[1]!.values, 120);
    const pb = posesOf(b[1]!.values, 120);
    pa.forEach((q, i) => expect(Math.hypot(q.x - pb[i]!.x, q.y - pb[i]!.y)).toBeLessThan(1e-8));
  });
});

describe('marginalize', () => {
  it('the Schur-complement marginal equals the covariance-form marginal', () => {
    const Lambda = randomSPD(rng, 7);
    const eta = Float64Array.from({ length: 7 }, () => rng.normal());
    const keep = [0, 2, 5];
    const m = marginalize(Lambda, eta, keep);
    const P = inverse(Lambda, { spd: true });
    const Pk = select(P, keep, keep);
    expect(maxAbsDiff(inverse(m.Lambda, { spd: true }), Pk)).toBeLessThan(1e-10);
    // The mean is unchanged: Λ' x_k = η' with x = Λ⁻¹ η.
    const x = Float64Array.from({ length: 7 }, (_, i) =>
      P.data.slice(i * 7, i * 7 + 7).reduce((s, v, j) => s + v * eta[j]!, 0),
    );
    const lhs = Float64Array.from(keep, (_, r) => keep.reduce((s, c, q) => s + m.Lambda.data[r * 3 + q]! * x[c]!, 0));
    lhs.forEach((v, r) => expect(v).toBeCloseTo(m.eta[r]!, 10));
  });
});

describe('io', () => {
  it('g2o read → write → read round trip', () => {
    const d = manhattan({ ...MANHATTAN_DEFAULTS, poses: 50 });
    const info = fromArrays([
      [400, 1.5, 0],
      [1.5, 400, 2],
      [0, 2, 2500],
    ]);
    const g = {
      vertices: new Map(d.initial.map((p, i) => [i, p] as [number, se2.Pose2])),
      edges: [...d.odometry, ...d.loops].map((e) => ({ ...e, information: info })),
    };
    const text = writeG2o(g);
    const back = readG2o(text);
    expect(writeG2o(back)).toBe(text);
    expect(back.vertices.size).toBe(50);
    expect(back.edges).toHaveLength(g.edges.length);
    expect(back.vertices.get(7)!.x).toBe(d.initial[7]!.x);
    expect(maxAbsDiff(back.edges[3]!.information, info)).toBe(0);
  });
});

describe('Manhattan generator', () => {
  it('moves one block per step on the grid; odometry composes to the dead-reckoning guess', () => {
    const d = manhattan({ ...MANHATTAN_DEFAULTS, poses: 400 });
    for (let k = 1; k < 400; k++) {
      expect(Math.hypot(d.truth[k]!.x - d.truth[k - 1]!.x, d.truth[k]!.y - d.truth[k - 1]!.y)).toBeCloseTo(1, 12);
      expect(Math.abs(d.truth[k]!.x)).toBeLessThanOrEqual(MANHATTAN_DEFAULTS.extent);
    }
    d.loops.forEach((e) => {
      expect(e.j - e.i).toBeGreaterThanOrEqual(MANHATTAN_DEFAULTS.minGap);
      expect(Math.hypot(d.truth[e.i]!.x - d.truth[e.j]!.x, d.truth[e.i]!.y - d.truth[e.j]!.y)).toBeLessThan(1e-9);
    });
  });
});
