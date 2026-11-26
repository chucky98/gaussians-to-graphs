import { describe, expect, it } from 'vitest';
import {
  LINEAR_A,
  linearMap,
  polarMean,
  polarToCartesian,
  sine,
  sineMoments,
  square,
  squareMoments,
  type VectorFunction,
} from '../../../src/lib/models/nonlinear';
import { numericJacobian } from '../../../src/lib/math/autodiff';
import { linearize, monteCarlo } from '../../../src/lib/math/propagate';
import { linearTransform } from '../../../src/lib/math/gaussian';
import { fromArrays, maxAbsDiff, vec, type Mat } from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';
import { cov2 } from '../../../src/lib/math/gaussian';

const rng = createRng(404);
function relErr(a: Mat, b: Mat): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < a.data.length; i++) {
    num = Math.max(num, Math.abs(a.data[i]! - b.data[i]!));
    den = Math.max(den, Math.abs(b.data[i]!));
  }
  return num / Math.max(den, 1e-12);
}

describe('numericJacobian', () => {
  it('matches a hand-computed Jacobian', () => {
    const f = (x: Float64Array) => vec([x[0]! * x[1]!, Math.exp(x[0]!)]);
    const J = numericJacobian(f, vec([0.3, 2]));
    expect(
      maxAbsDiff(
        J,
        fromArrays([
          [2, 0.3],
          [Math.exp(0.3), 0],
        ]),
      ),
    ).toBeLessThan(1e-8);
  });
});

describe('models/nonlinear: analytic Jacobians == central differences (DESIGN §8.1)', () => {
  const cases: [VectorFunction, () => Float64Array][] = [
    [polarToCartesian, () => vec([rng.uniformRange(0.2, 5), rng.uniformRange(-Math.PI, Math.PI)])],
    [square, () => vec([rng.uniformRange(-3, 3)])],
    [sine, () => vec([rng.uniformRange(-4, 4)])],
    [linearMap, () => vec([rng.normal(), rng.normal()])],
  ];
  it.each(cases)('%s', (fn, draw) => {
    for (let t = 0; t < 50; t++) {
      const x = draw();
      const J = fn.jacobian(x);
      expect(J.rows).toBe(fn.outDim);
      expect(J.cols).toBe(fn.inDim);
      const e = relErr(J, numericJacobian(fn.f, x));
      if (Math.max(...Array.from(J.data).map(Math.abs)) > 1e-3) expect(e).toBeLessThan(1e-6);
      else expect(maxAbsDiff(J, numericJacobian(fn.f, x))).toBeLessThan(1e-8);
    }
  });
});

describe('propagation', () => {
  const z2 = Float64Array.from({ length: 2 * 200_000 }, () => rng.normal());
  const z1 = Float64Array.from({ length: 200_000 }, () => rng.normal());

  it('linearization of a linear map equals the exact linear transform', () => {
    const g = { mean: vec([1, 0.5]), cov: cov2(0.6, 0.4, 0.3) };
    const lin = linearize(g, linearMap);
    const exact = linearTransform(g, LINEAR_A);
    expect(maxAbsDiff(lin.cov, exact.cov)).toBeLessThan(1e-14);
    expect(Math.abs(lin.mean[0]! - exact.mean[0]!)).toBeLessThan(1e-14);
  });

  it('Monte Carlo of a linear map converges to the exact result', () => {
    const g = { mean: vec([1, 0.5]), cov: cov2(0.6, 0.4, 0.3) };
    const mc = monteCarlo(g, linearMap, z2);
    const exact = linearTransform(g, LINEAR_A);
    expect(maxAbsDiff(mc.fit.cov, exact.cov)).toBeLessThan(0.01);
    expect(Math.abs(mc.fit.mean[0]! - exact.mean[0]!)).toBeLessThan(0.01);
    expect(mc.inputs).toHaveLength(200_000);
  });

  it('Monte Carlo of x² and sin x converges to the exact moments', () => {
    for (const [fn, moments] of [
      [square, squareMoments],
      [sine, sineMoments],
    ] as const) {
      for (const [mu, s] of [
        [0, 0.5],
        [0.5, 0.5],
        [1.2, 0.9],
      ] as const) {
        const mc = monteCarlo({ mean: vec([mu]), cov: fromArrays([[s * s]]) }, fn, z1);
        const ex = moments(mu, s);
        expect(Math.abs(mc.fit.mean[0]! - ex.mean)).toBeLessThan(0.01);
        expect(Math.abs(mc.fit.cov.data[0]! - ex.variance) / Math.max(ex.variance, 0.01)).toBeLessThan(0.03);
      }
    }
  });

  it('exact polar mean matches Monte Carlo (pulled inward by e^{−σθ²/2})', () => {
    const g = {
      mean: vec([2, Math.PI / 2]),
      cov: fromArrays([
        [0.01, 0],
        [0, 0.19],
      ]),
    };
    const mc = monteCarlo(g, polarToCartesian, z2);
    const [mx, my] = polarMean(2, Math.PI / 2, Math.sqrt(0.19));
    expect(Math.abs(mc.fit.mean[0]! - mx)).toBeLessThan(0.01);
    expect(Math.abs(mc.fit.mean[1]! - my)).toBeLessThan(0.01);
  });

  it('rejects mismatched dimensions', () => {
    expect(() => monteCarlo({ mean: vec([0]), cov: fromArrays([[1]]) }, polarToCartesian, z2)).toThrow();
  });
});
