import { describe, expect, it } from 'vitest';
import {
  argmax,
  gaussianLogLik,
  gaussianPosterior,
  gridMean,
  gridStd,
  makeGrid,
  massBetween,
  normalize,
  normalizedLikelihood,
  posterior,
} from '../../../src/lib/math/bayes1d';
import { pdf1 } from '../../../src/lib/math/gaussian';
import { fitLine } from '../../../src/lib/math/leastsquares';

const g = makeGrid(-5, 10, 15000);
const gaussPrior = (mu: number, s: number) =>
  normalize(
    g,
    g.x.map((x) => pdf1(x, mu, s)),
  );

describe('bayes1d grid', () => {
  it('grid and normalization', () => {
    expect(g.x[0]).toBeCloseTo(-5 + 0.0005, 12);
    expect(g.dx).toBeCloseTo(0.001, 14);
    const p = normalize(
      g,
      g.x.map(() => 1),
    );
    expect(p.reduce((a, b) => a + b, 0) * g.dx).toBeCloseTo(1, 12);
    expect(() => normalize(g, new Float64Array(g.n))).toThrow();
    expect(() => makeGrid(1, 0, 10)).toThrow();
  });

  it('Gaussian prior × Gaussian likelihood on the grid matches the closed form', () => {
    const z = [2.4, 2.7, 2.55];
    const post = posterior(g, gaussPrior(2, 0.3), gaussianLogLik(g, z, 0.2), 1);
    const cf = gaussianPosterior(2, 0.3, 1, z, 0.2);
    expect(gridMean(g, post)).toBeCloseTo(cf.mean, 6);
    expect(gridStd(g, post)).toBeCloseTo(cf.std, 6);
    expect(argmax(g, post)).toBeCloseTo(cf.mean, 3);
  });

  it('MLE of Gaussian readings is their mean, which is least squares on a constant model', () => {
    const z = [2.4, 2.7, 2.55, 2.31];
    const mle = argmax(g, normalizedLikelihood(g, gaussianLogLik(g, z, 0.2)));
    const mean = z.reduce((a, b) => a + b) / z.length;
    expect(mle).toBeCloseTo(mean, 3);
    // Least squares for y = x₁ (a constant) via the line fitter with slope column all zero is singular, so
    // compare with the closed form for a constant: the minimizer of Σ(zᵢ − d)² is the mean.
    const ls = fitLine([0, 1, 2, 3], z);
    expect(ls.intercept + ls.slope * 1.5).toBeCloseTo(mean, 12); // the LS line passes through the mean
  });

  it('κ = 0 makes MAP = MLE; κ → ∞ pulls MAP to the prior mean; tempering a Gaussian prior is σ₀/√κ', () => {
    const z = [2.6, 2.8];
    const ll = gaussianLogLik(g, z, 0.2);
    const prior = gaussPrior(2, 0.3);
    expect(argmax(g, posterior(g, prior, ll, 0))).toBeCloseTo(2.7, 3);
    expect(argmax(g, posterior(g, prior, ll, 1e4))).toBeCloseTo(2, 2);
    const k = 4;
    const tempered = posterior(g, prior, ll, k);
    const cf = gaussianPosterior(2, 0.3, k, z, 0.2);
    const cf2 = gaussianPosterior(2, 0.3 / Math.sqrt(k), 1, z, 0.2);
    expect(gridMean(g, tempered)).toBeCloseTo(cf.mean, 6);
    expect(cf.mean).toBeCloseTo(cf2.mean, 12);
    expect(cf.std).toBeCloseTo(cf2.std, 12);
  });

  it('a uniform prior on [a, b] gives MAP = MLE clamped to [a, b]', () => {
    const prior = normalize(
      g,
      g.x.map((x) => (x >= 0 && x <= 3 ? 1 : 0)),
    );
    const ll = gaussianLogLik(g, [3.4, 3.6], 0.2);
    expect(argmax(g, posterior(g, prior, ll))).toBeCloseTo(3, 2);
    expect(massBetween(g, posterior(g, prior, ll), 3.001, 10)).toBe(0);
  });

  it('errors on disjoint prior and likelihood support or no information', () => {
    const prior = normalize(
      g,
      g.x.map((x) => (x < 0 ? 1 : 0)),
    );
    const ll = g.x.map((x) => (x < 0 ? -Infinity : 0));
    expect(() => posterior(g, prior, ll)).toThrow();
    expect(() => gaussianPosterior(0, 1, 0, [], 1)).toThrow();
  });
});
