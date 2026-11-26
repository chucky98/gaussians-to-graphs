/** Every concrete claim in post 06, checked against BayesGrid1D's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  BAYES_DEFAULTS as D,
  farDoorwayProbability,
  infer,
  priorSpec,
  readingSequence,
} from '../../../src/lib/demos/bayes-grid';
import { gaussianPosterior } from '../../../src/lib/math/bayes1d';

const f2 = (v: number | null) => (v === null ? 'null' : v.toFixed(2));
const z = readingSequence('odometry');

describe('post 06: odometry prior', () => {
  it('prior N(2, 0.3²); readings σ = 0.2; true distance 2.60 (odometry 60 cm short); first readings 2.56, 2.79', () => {
    expect(D.sigma).toBe(0.2);
    expect(priorSpec('odometry').truth).toBe(2.6);
    expect(z.slice(0, 2).map(f2)).toEqual(['2.56', '2.79']);
    expect(D.initialReadings).toBe(2);
  });
  it('default: MLE 2.67, MAP 2.55, posterior 2.55 ± 0.13; matches the closed form', () => {
    const r = infer('odometry', 0, z.slice(0, 2), 1);
    expect(f2(r.mle)).toBe('2.67');
    expect(f2(r.map)).toBe('2.55');
    expect(f2(r.postMean)).toBe('2.55');
    expect(f2(r.postStd)).toBe('0.13');
    const cf = gaussianPosterior(2, 0.3, 1, z.slice(0, 2), 0.2);
    expect(Math.abs(cf.mean - r.postMean)).toBeLessThan(2e-3);
    expect(r.postStd).toBeLessThan(Math.min(0.3, 0.2)); // narrower than either source
  });
  it('precisions: prior ≈ 11, each reading 25; two readings 50 vs 11', () => {
    expect(Math.round(1 / 0.3 ** 2)).toBe(11);
    expect(1 / 0.2 ** 2).toBeCloseTo(25, 12);
  });
  it('Try 1: 10 readings → MAP 2.69, MLE 2.72; 30 → 2.62, 2.63, ±0.04', () => {
    const r10 = infer('odometry', 0, z.slice(0, 10), 1);
    expect([f2(r10.map), f2(r10.mle)]).toEqual(['2.69', '2.72']);
    const r30 = infer('odometry', 0, z.slice(0, 30), 1);
    expect([f2(r30.map), f2(r30.mle), f2(r30.postStd)]).toEqual(['2.62', '2.63', '0.04']);
  });
  it('Try 2: κ = 0 → MAP = MLE; κ = 4 (like ±15 cm) → MAP 2.36', () => {
    const k0 = infer('odometry', 0, z.slice(0, 2), 0);
    expect(k0.map).toBeCloseTo(k0.mle!, 12);
    expect(f2(infer('odometry', 0, z.slice(0, 2), 4).map)).toBe('2.36');
    expect(0.3 / Math.sqrt(4)).toBeCloseTo(0.15, 12);
  });
  it('Try 3: no-idea prior: no MAP before readings, MAP = MLE after', () => {
    expect(infer('none', 0, [], 1).map).toBeNull();
    const r = infer('none', 0, z.slice(0, 3), 1);
    expect(r.map).toBeCloseTo(r.mle!, 12);
  });
});

describe('post 06: two doorways', () => {
  it('no readings: MAP tie 1.20 or 3.00; mean 2.10; P(far) 50%', () => {
    const r = infer('doorways', 0, [], 1);
    expect(r.map).toBeNull();
    expect(r.mapCandidates.map(f2)).toEqual(['1.20', '3.00']);
    expect(f2(r.postMean)).toBe('2.10');
    expect(farDoorwayProbability(r.post)).toBeCloseTo(0.5, 6);
  });
  it('one reading at 2.96 → P(far) > 99.9%', () => {
    const zd = readingSequence('doorways');
    expect(f2(zd[0]!)).toBe('2.96');
    expect(farDoorwayProbability(infer('doorways', 0, [zd[0]!], 1).post)).toBeGreaterThan(0.999);
  });
  it('a reading at 2.10 keeps 50:50; at 2.15 the odds are about 4:1 (81%)', () => {
    expect(farDoorwayProbability(infer('doorways', 0, [2.1], 1).post)).toBeCloseTo(0.5, 6);
    const p = farDoorwayProbability(infer('doorways', 0, [2.15], 1).post);
    expect(Math.round(100 * p)).toBe(81);
    expect(Math.round(p / (1 - p))).toBe(4);
  });
});
