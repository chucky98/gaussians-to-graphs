import { describe, expect, it } from 'vitest';
import { SAMPLER, linearized, sampleMotion, samplerStats, stepsOf } from '../../../src/lib/demos/motion-sampler';
import {
  LOBBY,
  SENSOR_DEFAULTS as SD,
  deg,
  insideRegion,
  readingSamples,
  sightings,
  wedge,
} from '../../../src/lib/demos/range-bearing';
import { maxAbsDiff, vec } from '../../../src/lib/math/matrix';
import { rangeBearing } from '../../../src/lib/models/range-bearing';
import { createRng } from '../../../src/lib/math/rng';

describe('motion-sampler model', () => {
  const p = { v: 1, w: 0.3, duration: 6, sigmaV: 0.1, sigmaW: 0.15 };
  it('deterministic; one endpoint per sample; paths start at the origin', () => {
    const a = sampleMotion(p, 3);
    expect(a.ends).toEqual(sampleMotion(p, 3).ends);
    expect(a.ends).toHaveLength(2 * SAMPLER.samples);
    expect(a.paths[0]).toHaveLength(stepsOf(p) + 1);
    expect(Array.from(a.paths[0]![0]!)).toEqual([0, 0, 0]);
  });
  it('for small noise the linearized covariance matches the samples', () => {
    const q = { ...p, sigmaV: 0.01, sigmaW: 0.005 };
    const s = samplerStats(q, sampleMotion(q));
    expect(maxAbsDiff(s.linCov, s.mcCov) / Math.max(...s.linCov.data)).toBeLessThan(0.12);
    expect(s.insideLin).toBeGreaterThan(0.93);
  });
  it('without noise, every sample follows the command and the covariance is zero', () => {
    const q = { ...p, sigmaV: 0, sigmaW: 0 };
    const s = sampleMotion(q);
    const l = linearized(q);
    expect(s.ends[0]).toBeCloseTo(l.mean[0]!, 12);
    expect(Math.max(...l.P.data.map(Math.abs))).toBe(0);
    expect(Number.isNaN(samplerStats(q, s).insideLin)).toBe(true);
  });
});

describe('range-bearing model', () => {
  const pose = vec(LOBBY.robot);
  it('sightings respect the maximum range and carry the true reading', () => {
    for (const s of sightings(pose, { ...SD, maxRange: 4 })) {
      expect(s.z[0]).toBeLessThanOrEqual(4);
      expect(Array.from(s.z)).toEqual(Array.from(rangeBearing(pose, s.m)));
    }
  });
  it('the drawn region holds 95% of readings in measurement space', () => {
    const s = sightings(pose, SD)[2]!;
    const rng = createRng(5);
    let inside = 0;
    const n = 20000;
    for (let i = 0; i < n; i++)
      if (insideRegion(s.z, s.z[0]! + SD.sigmaR * rng.normal(), s.z[1]! + SD.sigmaPhiDeg * deg * rng.normal(), SD))
        inside++;
    expect(inside / n).toBeCloseTo(0.95, 2);
    expect(wedge(pose, s.z, SD)).toHaveLength(48);
  });
  it('reading samples: one block per visible marker, centred on it', () => {
    const seen = sightings(pose, SD);
    const pts = readingSamples(pose, seen, SD);
    expect(pts).toHaveLength(2 * LOBBY.samplesPerLandmark * seen.length);
    let mx = 0;
    for (let i = 0; i < LOBBY.samplesPerLandmark; i++) mx += pts[2 * i]!;
    expect(mx / LOBBY.samplesPerLandmark).toBeCloseTo(seen[0]!.m[0]!, 1);
  });
});
