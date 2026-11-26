/** Every concrete claim in post 17, checked against the MCL widget's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import { MCL, MCL_DEFAULTS as D, lockStep, runMcl, simulateTruth, type MclParams } from '../../../src/lib/demos/mcl';
import { HALL } from '../../../src/lib/demos/ekf-localization';

const seed = MCL.seed;
const run = (p: Partial<MclParams> = {}, kidnap: number | null = null, s = seed) =>
  runMcl({ ...D, ...p, kidnapAt: kidnap }, 120, simulateTruth(kidnap, s), s).summaries;
const successes = (p: Partial<MclParams>) => {
  let ok = 0;
  for (let s = 1; s <= 30; s++) if (run(p, null, s)[119]!.err < 0.5) ok++;
  return ok;
};

describe('post 17: setup', () => {
  it('2,000 particles, systematic, 8 identical markers, lidar range 10 m; hall 20 m × 13 m = 260 m²; 1.9 million cells at 10 cm and 5°', () => {
    expect([D.np, D.scheme, HALL.landmarks.length, MCL.sensor.range]).toEqual([2000, 'systematic', 8, 10]);
    const [w, h] = [MCL.walls.x[1] - MCL.walls.x[0], MCL.walls.y[1] - MCL.walls.y[0]];
    expect(w * h).toBe(260);
    expect(((w / 0.1) * (h / 0.1) * (360 / 5)) / 1e6).toBeCloseTo(1.872, 3);
    expect(MCL.model).toEqual({ sigmaR: 0.5, sigmaPhiDeg: 10, sigmaV: 0.2, sigmaW: 0.15 });
    expect([MCL.sensor.sigmaR, MCL.sensor.sigmaPhiDeg]).toEqual([0.1, 2]);
  });
});

describe('post 17: the default run (seed 22)', () => {
  const s = run();
  it('first scan: N_eff 2,000 → 40; by step 3, 98% of the weight within 1 m', () => {
    expect(Math.round(s[0]!.ess)).toBe(40);
    expect(Math.round(100 * s[2]!.near)).toBe(98);
    expect(lockStep(s)).toBe(3);
  });
  it('500 particles: locks onto a wrong place, 11.2 m off at the end; 200 happen to succeed', () => {
    const f = run({ np: 500 });
    expect(lockStep(f)).toBeNull();
    expect(f[119]!.err.toFixed(1)).toBe('11.2');
    expect(run({ np: 200 })[119]!.err).toBeLessThan(0.5);
  });
});

describe('post 17: across 30 seeds', () => {
  it('500 particles succeed in 16 runs, 2,000 in 28; schemes at 500: 16, 17, 17', () => {
    expect(successes({ np: 500 })).toBe(16);
    expect(successes({ np: 2000 })).toBe(28);
    expect(successes({ np: 500, scheme: 'stratified' })).toBe(17);
    expect(successes({ np: 500, scheme: 'multinomial' })).toBe(17);
  }, 120_000);
  it('augmented MCL without kidnapping localizes in 29 runs', () => {
    let ok = 0;
    for (let s = 1; s <= 30; s++) if (lockStep(run({ inject: true }, null, s)) !== null) ok++;
    expect(ok).toBe(29);
  }, 60_000);
  it('with the true sensor and motion noise in the filter, only 8 runs succeed', () => {
    const saved = { ...MCL.model };
    Object.assign(MCL.model, { sigmaR: 0.1, sigmaPhiDeg: 2, sigmaV: 0.1, sigmaW: 0.05 });
    try {
      expect(successes({})).toBe(8);
    } finally {
      Object.assign(MCL.model, saved);
    }
  }, 60_000);
});

describe('post 17: kidnapping at step 60 (t = 30 s)', () => {
  it('plain MCL never recovers: 15.2 m off at the end', () => {
    const s = run({}, 60);
    expect(lockStep(s, 0.8, 60, 120)).toBeNull();
    expect(s[119]!.err.toFixed(1)).toBe('15.2');
    expect(lockStep(s, 0.8, 0, 59)).not.toBeNull(); // it was localized before
  });
  it('augmented MCL: injection starts 31 steps later; locked again by step 103 (51.5 s)', () => {
    const s = run({ inject: true }, 60);
    expect(s.findIndex((x) => x.injected > 0) + 1 - 60).toBe(31);
    expect(lockStep(s, 0.8, 60, 120)).toBe(103);
    expect(103 * HALL.dt).toBe(51.5);
  });
  it('the robot stays inside the hall, kidnapped or not, for seeds 1–100', () => {
    for (let s = 1; s <= 100; s++)
      for (const k of [null, 60])
        for (const x of simulateTruth(k, s).truths) {
          expect(x[0]).toBeGreaterThan(MCL.walls.x[0]);
          expect(x[0]).toBeLessThan(MCL.walls.x[1]);
          expect(x[1]).toBeGreaterThan(MCL.walls.y[0]);
          expect(x[1]).toBeLessThan(MCL.walls.y[1]);
        }
  });
});
