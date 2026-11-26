import { describe, expect, it } from 'vitest';
import {
  condition,
  cov2,
  ellipseParams,
  ellipsePoints,
  fromInformation,
  linearTransform,
  logpdf,
  mahalanobis,
  mahalanobis2,
  marginalize,
  pdf,
  pdf1,
  product,
  product1,
  productNormalizer,
  sample,
  toInformation,
  type Gaussian,
} from '../../../src/lib/math/gaussian';
import { add, fromArrays, inverse, maxAbsDiff, mul, toArrays, vec, identity } from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';
import { chi2Quantile, sampleCov } from '../../../src/lib/math/stats';
import { randomSPD } from '../helpers';

const g2: Gaussian = {
  mean: vec([1, 2]),
  cov: fromArrays([
    [4, 2],
    [2, 3],
  ]),
};

describe('density', () => {
  it('pdf matches the 1D formula and the 2D closed form', () => {
    const g1 = { mean: vec([1]), cov: fromArrays([[4]]) };
    expect(pdf(g1, vec([2]))).toBeCloseTo(pdf1(2, 1, 2), 14);
    expect(pdf1(0, 0, 1)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 15);
    // 2D: det Σ = 8, x − μ = (1, −1), Σ⁻¹ = [[3,−2],[−2,4]]/8 -> q = (3+4+4)/8 = 11/8.
    const expected = Math.exp(-0.5 * (11 / 8)) / (2 * Math.PI * Math.sqrt(8));
    expect(pdf(g2, vec([2, 1]))).toBeCloseTo(expected, 14);
    expect(logpdf(g2, vec([2, 1]))).toBeCloseTo(Math.log(expected), 12);
    expect(mahalanobis2(g2, vec([2, 1]))).toBeCloseTo(11 / 8, 14);
    expect(mahalanobis(g2, vec([1, 2]))).toBe(0);
  });

  it('1D pdf integrates to 1 (trapezoid rule)', () => {
    let s = 0;
    const h = 0.001;
    for (let x = -10; x < 10; x += h) s += h * pdf1(x, 0.3, 1.7);
    expect(s).toBeCloseTo(1, 6);
  });
});

describe('sampling (DESIGN §8.1)', () => {
  it('sample covariance converges to cov', () => {
    const rng = createRng(11);
    const xs = sample(g2, rng, 100_000);
    const s = sampleCov(xs);
    expect(Math.abs(s.mean[0]! - 1)).toBeLessThan(0.03);
    expect(Math.abs(s.mean[1]! - 2)).toBeLessThan(0.03);
    expect(maxAbsDiff(s.cov, g2.cov)).toBeLessThan(0.08);
  });

  it('about 95% of samples fall inside the 95% ellipse', () => {
    for (const [seed, g] of [
      [5, g2],
      [6, { mean: vec([0, 0]), cov: cov2(1, 0.3, -0.9) }],
    ] as const) {
      const rng = createRng(seed);
      const c = chi2Quantile(0.95, 2);
      const xs = sample(g, rng, 100_000);
      const inside = xs.filter((x) => mahalanobis2(g, x) <= c).length / xs.length;
      // Binomial standard error √(0.95·0.05/1e5) ≈ 0.0007.
      expect(Math.abs(inside - 0.95)).toBeLessThan(0.003);
    }
  });
});

describe('ellipse', () => {
  it('boundary points satisfy d_M² = χ²₂(0.95)', () => {
    const c = chi2Quantile(0.95, 2);
    for (const p of ellipsePoints(g2, 0.95, 32)) expect(mahalanobis2(g2, vec(p))).toBeCloseTo(c, 10);
    for (const p of ellipsePoints(g2, 0.5, 16)) expect(mahalanobis2(g2, vec(p))).toBeCloseTo(-2 * Math.log(0.5), 10);
  });

  it('axis-aligned case has semi-axes √c·σ', () => {
    const e = ellipseParams({ mean: vec([0, 0]), cov: cov2(3, 1, 0) });
    const c = chi2Quantile(0.95, 2);
    expect(e.rx).toBeCloseTo(3 * Math.sqrt(c), 12);
    expect(e.ry).toBeCloseTo(Math.sqrt(c), 12);
    expect(e.angle).toBeCloseTo(0, 14);
    expect(e.c).toBeCloseTo(5.991464547107979, 12);
  });

  it('equal variances with positive correlation tilt the major axis by 45°', () => {
    const e = ellipseParams({ mean: vec([0, 0]), cov: cov2(1, 1, 0.5) });
    expect(e.angle).toBeCloseTo(Math.PI / 4, 12);
    const c = chi2Quantile(0.95, 2);
    expect(e.rx).toBeCloseTo(Math.sqrt(1.5 * c), 12);
    expect(e.ry).toBeCloseTo(Math.sqrt(0.5 * c), 12);
  });
});

describe('marginalize and condition (DESIGN §8.1)', () => {
  it('marginal is the sub-block', () => {
    const m = marginalize(g2, [1]);
    expect(Array.from(m.mean)).toEqual([2]);
    expect(toArrays(m.cov)).toEqual([[3]]);
  });

  it('2D conditioning matches the hand-computed closed form', () => {
    // x₁ | x₂ = 5: μ = 1 + (2/3)(5 − 2) = 3, σ² = 4 − 2²/3 = 8/3.
    const c = condition(g2, [1], vec([5]));
    expect(c.mean[0]).toBeCloseTo(3, 14);
    expect(c.cov.data[0]).toBeCloseTo(8 / 3, 14);
  });

  it('3D conditioning matches the hand-computed closed form', () => {
    const g: Gaussian = {
      mean: vec([0, 0, 0]),
      cov: fromArrays([
        [4, 2, 0],
        [2, 3, 1],
        [0, 1, 2],
      ]),
    };
    const c = condition(g, [2], vec([1]));
    expect(c.mean[0]).toBeCloseTo(0, 14);
    expect(c.mean[1]).toBeCloseTo(0.5, 14);
    expect(
      maxAbsDiff(
        c.cov,
        fromArrays([
          [4, 2],
          [2, 2.5],
        ]),
      ),
    ).toBeLessThan(1e-14);
  });

  it('conditional covariance equals the inverse of the information sub-block', () => {
    const rng = createRng(21);
    const cov = randomSPD(rng, 5);
    const g = { mean: vec([1, 2, 3, 4, 5]), cov };
    const c = condition(g, [1, 3], vec([0, 0]));
    const info = inverse(cov, { spd: true });
    const keep = [0, 2, 4];
    const sub = fromArrays(keep.map((i) => keep.map((j) => info.data[i * 5 + j]!)));
    expect(maxAbsDiff(c.cov, inverse(sub, { spd: true }))).toBeLessThan(1e-10);
  });
});

describe('linear transform, product, information form', () => {
  it('linearTransform gives Aμ + b and AΣAᵀ', () => {
    const A = fromArrays([
      [1, 1],
      [0, 2],
    ]);
    const y = linearTransform(g2, A, vec([1, 0]));
    expect(Array.from(y.mean)).toEqual([4, 4]);
    // AΣAᵀ = [[4+2+2+3, 2·(2+3)], [·, 4·3]] = [[11, 10], [10, 12]]
    expect(toArrays(y.cov)).toEqual([
      [11, 10],
      [10, 12],
    ]);
  });

  it('1D product matches the closed form', () => {
    const p = product1(0, 1, 2, 1);
    expect(p.mean).toBe(1);
    expect(p.variance).toBe(0.5);
    const q = product({ mean: vec([0]), cov: fromArrays([[4]]) }, { mean: vec([3]), cov: fromArrays([[1]]) });
    const r = product1(0, 4, 3, 1);
    expect(q.mean[0]).toBeCloseTo(r.mean, 14);
    expect(q.cov.data[0]).toBeCloseTo(r.variance, 14);
    expect(r.mean).toBeCloseTo(2.4, 14);
    expect(r.variance).toBeCloseTo(0.8, 14);
  });

  it('nD product equals Σ = (Σ₁⁻¹ + Σ₂⁻¹)⁻¹, and pointwise product = c · N(μ, Σ)', () => {
    const h: Gaussian = { mean: vec([3, 0]), cov: cov2(1, 2, -0.4) };
    const p = product(g2, h);
    const expected = inverse(add(inverse(g2.cov, { spd: true }), inverse(h.cov, { spd: true })), { spd: true });
    expect(maxAbsDiff(p.cov, expected)).toBeLessThan(1e-12);
    const c = productNormalizer(g2, h);
    for (const x of [vec([0, 0]), vec([2, 1]), vec([-1, 3])]) {
      expect(pdf(g2, x) * pdf(h, x)).toBeCloseTo(c * pdf(p, x), 14);
    }
  });

  it('information form round trip', () => {
    const f = toInformation(g2);
    expect(maxAbsDiff(mul(f.info, g2.cov), identity(2))).toBeLessThan(1e-14);
    const back = fromInformation(f);
    expect(maxAbsDiff(back.cov, g2.cov)).toBeLessThan(1e-12);
    expect(Math.abs(back.mean[0]! - 1) + Math.abs(back.mean[1]! - 2)).toBeLessThan(1e-12);
  });

  it('cov2 builds [[σx², ρσxσy], [ρσxσy, σy²]]', () => {
    expect(toArrays(cov2(2, 3, 0.5))).toEqual([
      [4, 3],
      [3, 9],
    ]);
  });
});
