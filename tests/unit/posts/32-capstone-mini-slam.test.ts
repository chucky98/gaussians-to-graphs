/** Every concrete claim in post 32, checked against DriveYourOwnSLAM's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  MINI,
  autopilot,
  createPipeline,
  deadReckoningError,
  landmarks,
  runDrive,
  snapshot,
  type SlamConfig,
} from '../../../src/lib/demos/mini-slam';

const route = autopilot();
const run = (c: Partial<SlamConfig> = {}) => snapshot(runDrive({ ...MINI.defaults, ...c }, route));
const f2 = (v: number) => v.toFixed(2);

describe('post 32: the system', () => {
  it('36 landmarks at least 2.5 m apart; range 5 m; gate 1.2 m; window 30; noise 0.03 m/s, 0.03 rad/s, 8 cm, 2°', () => {
    const L = landmarks();
    expect(L).toHaveLength(36);
    for (let i = 0; i < L.length; i++)
      for (let j = i + 1; j < L.length; j++)
        expect(Math.hypot(L[i]![0] - L[j]![0], L[i]![1] - L[j]![1])).toBeGreaterThanOrEqual(2.5);
    expect([MINI.range, MINI.gate, MINI.window, MINI.confirmSteps]).toEqual([5, 1.2, 30, 3]);
    expect(MINI.sigma).toEqual({ v: 0.03, w: 0.03, range: 0.08, bearingDeg: 2 });
    expect([
      MINI.defaults.clutter,
      MINI.defaults.seed,
      MINI.robustScale,
      MINI.iterationsPerStep,
      MINI.iterationsOnClosure,
    ]).toEqual([0.8, 34, 2, 3, 10]);
    expect(route).toHaveLength(232);
  });
  it('the pipeline is deterministic: the same drive replayed gives the same result', () => {
    const a = createPipeline(MINI.defaults);
    const b = createPipeline(MINI.defaults);
    for (const u of route.slice(0, 40)) {
      a.step(u);
      b.step(u);
    }
    expect(snapshot(a.state).estimate).toEqual(snapshot(b.state).estimate);
  });
});

describe('post 32: try this', () => {
  it('whole route: 0.22 m average, 0.03 m at the end, 36 landmarks once each, 41 loop closures; odometry alone 1.45 m', () => {
    const s = run();
    expect([f2(s.rms), f2(s.latestError), s.map.length, s.map.filter((m) => m.duplicate).length, s.closures]).toEqual([
      '0.22',
      '0.03',
      36,
      0,
      41,
    ]);
    expect(f2(deadReckoningError(MINI.defaults, route))).toBe('1.45');
  }, 60_000);
  it('no loop closure: 77 landmarks, 41 duplicates, 0.74 m average, 1.69 m at the end', () => {
    const s = run({ loopClosure: false });
    expect([s.map.length, s.map.filter((m) => m.duplicate).length, f2(s.rms), f2(s.latestError)]).toEqual([
      77,
      41,
      '0.74',
      '1.69',
    ]);
  }, 60_000);
  it('no robust kernel: 176 of 1,440 pairings are ghosts; 0.49 m; without ghosts 0.16 m (0.18 m without the kernel)', () => {
    const s = run({ robust: false });
    expect([s.pairings, s.wrongPairings, f2(s.rms)]).toEqual([1440, 176, '0.49']);
    // All wrong pairings are ghosts: without ghosts there are none.
    expect(run({ clutter: 0 }).wrongPairings).toBe(0);
    expect([f2(run({ clutter: 0 }).rms), f2(run({ clutter: 0, robust: false }).rms)]).toEqual(['0.16', '0.18']);
  }, 120_000);
});
