import { describe, expect, it } from 'vitest';
import { cost, gaussNewton, levenbergMarquardt, normalSystem, type LsqProblem } from '../../../src/lib/graph/solver';
import { rangeProblem } from '../../../src/lib/models/ranging';
import { numericJacobian } from '../../../src/lib/math/autodiff';
import { fromArrays, maxAbsDiff, mulVec, vec, zeros } from '../../../src/lib/math/matrix';
import { lstsq } from '../../../src/lib/math/leastsquares';
import { contourSegments, sampleField } from '../../../src/lib/math/contour';
import { createRng } from '../../../src/lib/math/rng';

const rng = createRng(909);

describe('Gauss–Newton and Levenberg–Marquardt (DESIGN §8.1 solver)', () => {
  it('Gauss–Newton solves a linear problem in one iteration, matching linear least squares', () => {
    const A = zeros(12, 3);
    for (let k = 0; k < A.data.length; k++) A.data[k] = rng.normal();
    const b = Float64Array.from({ length: 12 }, () => rng.normal());
    const p: LsqProblem = { residual: (x) => mulVec(A, x).map((v, i) => v - b[i]!), jacobian: () => A };
    const its = gaussNewton(p, vec([5, -3, 2]));
    const ls = lstsq(A, b);
    for (let i = 0; i < 3; i++) expect(its[1]!.x[i]).toBeCloseTo(ls.x[i]!, 10);
    expect(its[1]!.cost).toBeCloseTo(0.5 * ls.cost, 10);
    expect(its.length).toBeLessThanOrEqual(3);
  });

  it('noise-free trilateration reaches cost ≈ 0 at the true position', () => {
    const anchors: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 8],
      [0, 8],
    ];
    const truth = [6, 3];
    const z = anchors.map(([ax, ay]) => Math.hypot(truth[0]! - ax, truth[1]! - ay));
    const p = rangeProblem(anchors, z, 0.1);
    for (const solve of [gaussNewton, levenbergMarquardt]) {
      const last = solve(p, vec([2, 6])).at(-1)!;
      expect(last.cost).toBeLessThan(1e-16);
      expect(last.x[0]).toBeCloseTo(6, 8);
      expect(last.x[1]).toBeCloseTo(3, 8);
    }
  });

  it('LM never increases the cost (accepted iterates are monotone); rejected trials keep x', () => {
    const anchors: [number, number][] = [
      [0, 0],
      [10, 0],
      [5, 8],
    ];
    const z = [5.1, 6.9, 5.2];
    const p = rangeProblem(anchors, z, 0.1);
    for (let t = 0; t < 30; t++) {
      const its = levenbergMarquardt(p, vec([rng.uniformRange(-20, 30), rng.uniformRange(-20, 30)]), {
        lambda0: 10 ** rng.uniformRange(-4, 2),
      });
      for (let k = 1; k < its.length; k++) {
        expect(its[k]!.cost).toBeLessThanOrEqual(its[k - 1]!.cost + 1e-12);
        if (!its[k]!.accepted) expect(Array.from(its[k]!.x)).toEqual(Array.from(its[k - 1]!.x));
      }
    }
  });

  it('range Jacobian matches central differences; normal system is JᵀWJ, −JᵀWr', () => {
    const anchors: [number, number][] = [
      [0, 0],
      [10, 0],
      [5, 8],
    ];
    const p = rangeProblem(anchors, [5, 6, 7], 0.2);
    for (let t = 0; t < 20; t++) {
      const x = vec([rng.uniformRange(-5, 15), rng.uniformRange(-5, 15)]);
      expect(maxAbsDiff(p.jacobian(x), numericJacobian(p.residual, x))).toBeLessThan(1e-7);
    }
    const x = vec([3, 4]);
    const { Lambda, eta, r } = normalSystem(p, x);
    const J = p.jacobian(x);
    const L2 = fromArrays([
      [0, 0],
      [0, 0],
    ]);
    for (let i = 0; i < 3; i++)
      for (let a = 0; a < 2; a++)
        for (let c = 0; c < 2; c++) L2.data[a * 2 + c]! += 25 * J.data[i * 2 + a]! * J.data[i * 2 + c]!;
    expect(maxAbsDiff(Lambda, L2)).toBeLessThan(1e-12);
    expect(eta[0]).toBeCloseTo(-25 * (J.data[0]! * r[0]! + J.data[2]! * r[1]! + J.data[4]! * r[2]!), 12);
    expect(cost(p, x)).toBeCloseTo(0.5 * 25 * r.reduce((s, v) => s + v * v, 0), 12);
    expect(() => rangeProblem(anchors, [1, 2], 0.1)).toThrow();
  });
});

describe('contours', () => {
  it('contours of x² + y² at level 4 lie on the circle of radius 2', () => {
    const g = sampleField((x, y) => x * x + y * y, 81, 81, -3, 3, -3, 3);
    const segs = contourSegments(g, 4);
    expect(segs.length).toBeGreaterThan(40);
    for (const [ax, ay, bx, by] of segs) {
      expect(Math.abs(Math.hypot(ax, ay) - 2)).toBeLessThan(0.02);
      expect(Math.abs(Math.hypot(bx, by) - 2)).toBeLessThan(0.02);
    }
    expect(contourSegments(g, 100)).toHaveLength(0);
  });
  it('handles saddle cells', () => {
    const g = sampleField((x, y) => x * y, 2, 2, -1, 1, -1, 1);
    expect(contourSegments(g, 0.0001)).toHaveLength(2);
  });
});
