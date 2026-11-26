/** Every concrete claim in post 04, checked against NonlinearPropagation's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  FUNCTIONS,
  PROP_DEFAULTS as D,
  defaultParams,
  propagate,
  standardDraws,
  type FnId,
  type Params,
} from '../../../src/lib/demos/nonlinear-propagation';
import { polarToCartesian, sineMoments, squareMoments } from '../../../src/lib/models/nonlinear';
import { vec } from '../../../src/lib/math/matrix';

const run = (id: FnId, over: Params = {}) => {
  const p = { ...defaultParams(id), ...over };
  for (const s of FUNCTIONS[id].sliders) {
    // every value used in the text must be reachable on the slider
    const v = p[s.key]!;
    expect(v).toBeGreaterThanOrEqual(s.min);
    expect(v).toBeLessThanOrEqual(s.max);
    const k = (v - s.min) / s.step;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
  }
  return propagate(id, p, standardDraws(D.seed, D.n, FUNCTIONS[id].dim));
};
const pct = (v: number) => (100 * v).toFixed(1);
const f2 = (v: number) => v.toFixed(2);

describe('post 04: polar defaults', () => {
  const r = run('polar');
  it('defaults: r = 2 m, θ = 90°, σr = 0.1 m, σθ = 25°, 2000 samples', () => {
    expect(defaultParams('polar')).toEqual({ muR: 2, sigmaR: 0.1, muT: 90, sigmaT: 25 });
    expect(D.n).toBe(2000);
  });
  it('Jacobian at the default is [[0, −2], [1, 0]]; linearized std 0.87 sideways, 0.10 along the beam', () => {
    const J = polarToCartesian.jacobian(vec([2, Math.PI / 2]));
    expect(Array.from(J.data).map((v) => Math.round(v * 1e12) / 1e12)).toEqual([0, -2, 1, 0]);
    expect(f2(Math.sqrt(r.lin.cov.data[0]!))).toBe('0.87');
    expect(f2(Math.sqrt(r.lin.cov.data[3]!))).toBe('0.10');
    expect(((25 * Math.PI) / 180).toFixed(3)).toBe('0.436');
  });
  it('means: samples (−0.01, 1.82), exact (0, 1.82) with factor 0.91, linearized (0, 2.00)', () => {
    expect(Array.from(r.mc.mean).map(f2)).toEqual(['-0.01', '1.82']);
    expect(r.exactMean!.map(f2)).toEqual(['0.00', '1.82']);
    expect(Math.exp(-(((25 * Math.PI) / 180) ** 2) / 2).toFixed(2)).toBe('0.91');
    expect(Array.from(r.lin.mean).map(f2)).toEqual(['0.00', '2.00']);
  });
  it('fitted ellipse holds 93.4%, linearized 70.0%; the linearized one is thinner along the beam', () => {
    expect(pct(r.insideMc)).toBe('93.4');
    expect(pct(r.insideLin)).toBe('70.0');
    expect(r.lin.cov.data[3]!).toBeLessThan(r.mc.cov.data[3]!);
  });
});

describe('post 04: polar Try this', () => {
  it('1: σθ = 5° → both ellipses hold 94.6%', () => {
    const r = run('polar', { sigmaT: 5 });
    expect(pct(r.insideLin)).toBe('94.6');
    expect(pct(r.insideMc)).toBe('94.6');
  });
  it('2: σθ = 60° → linearized holds about 35%; exact mean 1.16 m', () => {
    const r = run('polar', { sigmaT: 60 });
    expect(Math.round(100 * r.insideLin)).toBe(35);
    expect((2 * Math.exp(-((Math.PI / 3) ** 2) / 2)).toFixed(2)).toBe('1.16');
    expect(r.exactMean![1]!.toFixed(2)).toBe('1.16');
  });
  it('3: σθ = 5°, σr = 0.5 → linearization stays accurate (94.8% inside)', () => {
    const r = run('polar', { sigmaT: 5, sigmaR: 0.5 });
    expect(pct(r.insideLin)).toBe('94.8');
  });
  it('4: linear map → linearization exact; both hold about 95% for many spreads', () => {
    for (const [s1, s2] of [
      [0.6, 0.4],
      [1.2, 0.1],
      [0.1, 1.2],
    ] as const) {
      const r = run('linear', { s1, s2 });
      expect(Math.abs(r.insideLin - 0.95)).toBeLessThan(0.012);
      expect(Math.abs(r.insideMc - 0.95)).toBeLessThan(0.012);
      expect(r.exactMean).toEqual(Array.from(r.lin.mean));
    }
  });
});

describe('post 04: x² and sin', () => {
  it('square defaults μ = σ = 0.5: exact 0.50 / 0.375, linearized 0.25 / 0.25, 88.9% inside', () => {
    expect(defaultParams('square')).toEqual({ mu: 0.5, sigma: 0.5 });
    const r = run('square');
    expect(f2(r.exactMean![0]!)).toBe('0.50');
    expect(r.exactVar).toBeCloseTo(0.375, 14);
    expect(r.lin.mean[0]).toBeCloseTo(0.25, 14);
    expect(r.lin.cov.data[0]).toBeCloseTo(0.25, 14);
    expect(pct(r.insideLin)).toBe('88.9');
  });
  it('square μ = 0: linearized variance 0; exact mean 0.25, variance 0.125', () => {
    const r = run('square', { mu: 0 });
    expect(r.lin.cov.data[0]).toBe(0);
    expect(squareMoments(0, 0.5)).toEqual({ mean: 0.25, variance: 0.125 });
    expect(Math.min(...Array.from(r.outPts))).toBeGreaterThanOrEqual(0);
  });
  it('square μ = 2, σ = 0.2: linearized 0.640 vs exact 0.643', () => {
    const r = run('square', { mu: 2, sigma: 0.2 });
    expect(r.lin.cov.data[0]!.toFixed(3)).toBe('0.640');
    expect(r.exactVar!.toFixed(3)).toBe('0.643');
  });
  it('sine μ = 1.55: almost no linearized spread; 28.7% inside', () => {
    const r = run('sine', { mu: 1.55 });
    expect(r.lin.cov.data[0]!).toBeLessThan(1e-3);
    expect(sineMoments(1.55, 0.5).variance).toBeGreaterThan(0.02);
    expect(pct(r.insideLin)).toBe('28.7');
  });
});
