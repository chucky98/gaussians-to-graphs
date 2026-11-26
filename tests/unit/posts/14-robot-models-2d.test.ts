/** Every concrete claim in post 14, checked against the widgets' defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  SAMPLER,
  SAMPLER_PRESETS as P,
  nominalPath,
  sampleMotion,
  samplerStats,
  type SamplerParams,
} from '../../../src/lib/demos/motion-sampler';
import { LOBBY, SENSOR_DEFAULTS as SD, sightings, spread } from '../../../src/lib/demos/range-bearing';
import { eigSym2, vec } from '../../../src/lib/math/matrix';

const stats = (p: SamplerParams) => samplerStats(p, sampleMotion(p));
const maxSd = (p: SamplerParams) => Math.sqrt(Math.max(...eigSym2(stats(p).mcCov).values));
const degOf = (r: number) => (r * 180) / Math.PI;

describe('post 14: intuition', () => {
  it('1° of heading error is 1.7 cm sideways per metre', () => {
    expect((100 * Math.tan(Math.PI / 180)).toFixed(1)).toBe('1.7');
  });
});

describe('post 14: MotionModelSampler', () => {
  it('defaults: 1 m/s, 0.3 rad/s for 6 s; heading spread 14°; 89.8% inside the linearized ellipse', () => {
    expect(P.gentle).toEqual({ v: 1, w: 0.3, duration: 6, sigmaV: 0.1, sigmaW: 0.15 });
    expect(SAMPLER.dt).toBe(0.5);
    const s = stats(P.gentle);
    expect(degOf(s.headingSd).toFixed(0)).toBe('14');
    expect((100 * s.insideLin).toFixed(1)).toBe('89.8');
  });
  it('σω = 0: largest σ 0.77 m → 0.16 m, 93.2% inside', () => {
    expect(maxSd(P.gentle).toFixed(2)).toBe('0.77');
    const p = { ...P.gentle, sigmaW: 0 };
    expect(maxSd(p).toFixed(2)).toBe('0.16');
    expect((100 * stats(p).insideLin).toFixed(1)).toBe('93.2');
  });
  it('σv = 0, σω = 0.3: largest σ 1.42 m, 79.2% inside', () => {
    const p = { ...P.gentle, sigmaV: 0, sigmaW: 0.3 };
    expect(maxSd(p).toFixed(2)).toBe('1.42');
    expect((100 * stats(p).insideLin).toFixed(1)).toBe('79.2');
  });
  it('banana: 8 s, σω = 0.5; heading spread 55°; 75.8% inside; centres 1.34 m apart; the mean lies inside the curve', () => {
    expect(P.banana).toEqual({ v: 1, w: 0.3, duration: 8, sigmaV: 0.1, sigmaW: 0.5 });
    const s = stats(P.banana);
    expect(degOf(s.headingSd).toFixed(0)).toBe('55');
    expect((100 * s.insideLin).toFixed(1)).toBe('75.8');
    expect(Math.hypot(s.linMean[0] - s.mcMean[0], s.linMean[1] - s.mcMean[1]).toFixed(2)).toBe('1.34');
    // The arc curves around (0, v/ω); the samples' mean is closer to that centre than the arc's end.
    const c = [0, P.banana.v / P.banana.w];
    const end = nominalPath(P.banana).at(-1)!;
    expect(Math.hypot(s.mcMean[0] - c[0]!, s.mcMean[1] - c[1]!)).toBeLessThan(
      Math.hypot(end[0]! - c[0]!, end[1]! - c[1]!),
    );
  });
});

describe('post 14: RangeBearing', () => {
  const pose = vec(LOBBY.robot);
  const seen = sightings(pose, SD);
  const m = (i: number) => seen.find((s) => s.index === i)!;
  it('defaults: σr = 0.1 m, σφ = 2°, range 8 m; all five markers in view', () => {
    expect(SD).toEqual({ sigmaR: 0.1, sigmaPhiDeg: 2, maxRange: 8 });
    expect(seen).toHaveLength(5);
  });
  it('marker 3: 6.04 m, ± 0.20 m along, ± 0.41 m across; marker 5: 2.51 m, ± 0.17 m across', () => {
    expect(m(2).z[0]!.toFixed(2)).toBe('6.04');
    expect(spread(m(2).z, SD).radial.toFixed(2)).toBe('0.20');
    expect(spread(m(2).z, SD).lateral.toFixed(2)).toBe('0.41');
    expect(m(4).z[0]!.toFixed(2)).toBe('2.51');
    expect(spread(m(4).z, SD).lateral.toFixed(2)).toBe('0.17');
  });
  it('marker 3 bearing row (0.068, −0.151, −1); its position part has length 1/r = 0.17', () => {
    const H = m(2).Hx.data;
    expect([H[3]!.toFixed(3), H[4]!.toFixed(3), H[5]]).toEqual(['0.068', '-0.151', -1]);
    expect(Math.hypot(H[3]!, H[4]!)).toBeCloseTo(1 / m(2).z[0]!, 12);
    expect((1 / m(2).z[0]!).toFixed(2)).toBe('0.17');
  });
  it('maximum range 6 m: markers 3 and 4 drop out', () => {
    expect(sightings(pose, { ...SD, maxRange: 6 }).map((s) => s.index + 1)).toEqual([1, 2, 5]);
  });
});
