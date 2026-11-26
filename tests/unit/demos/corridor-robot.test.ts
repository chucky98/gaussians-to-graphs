import { describe, expect, it } from 'vitest';
import {
  CORRIDOR,
  CORRIDOR_DEFAULTS as D,
  CORRIDOR_LIMITS as L,
  DOOR_MASK,
  N_CELLS,
  autoActions,
  cellCenter,
  isDoorCell,
  likelihood,
  loopDistance,
  modes,
  motionKernel,
  nextAuto,
  presetActions,
  run,
  summarize,
} from '../../../src/lib/demos/corridor-robot';
import { pointBelief, sum, uniformBelief } from '../../../src/lib/filters/histogram';

describe('corridor-robot model', () => {
  it('door mask matches the door intervals (cell centres)', () => {
    expect(DOOR_MASK).toHaveLength(N_CELLS);
    expect(DOOR_MASK.filter(Boolean).length).toBe(4 * 5 + 6); // five 1 m doors and one 1.5 m door
    expect(isDoorCell(4)).toBe(true); // centre 1.125 m
    expect(isDoorCell(3)).toBe(false); // centre 0.875 m
    expect(isDoorCell(0, [[0, 0.25]])).toBe(true);
  });

  it('likelihood: door / wall readings give the hit and false-alarm rates and their complements', () => {
    const ld = likelihood(true, D);
    const lw = likelihood(false, D);
    for (let i = 0; i < N_CELLS; i++) {
      expect(ld[i]).toBeCloseTo(DOOR_MASK[i] ? D.hit : D.falseAlarm, 15);
      expect(lw[i]! + ld[i]!).toBeCloseTo(1, 15);
    }
  });

  it('slider limits keep every reading possible (no zero likelihood)', () => {
    for (const z of [true, false]) {
      const l = likelihood(z, { ...D, hit: L.hit.max, falseAlarm: L.falseAlarm.min });
      expect(Math.min(...l)).toBeGreaterThan(0);
    }
  });

  it('motion kernel: 1 m = 4 cells; α = 0 is an exact move', () => {
    expect(motionKernel({ ...D, alpha: 0 })).toEqual({ offsets: [4], probs: [1] });
    const k = motionKernel(D);
    expect(sum(k.probs)).toBeCloseTo(1, 12);
    expect(k.offsets[k.probs.indexOf(Math.max(...k.probs))]).toBe(4);
  });

  it('run: deterministic; one frame per action; counts; before = previous belief', () => {
    const acts = autoActions(5);
    const a = run(acts, D, 3);
    const b = run(acts, D, 3);
    expect(a).toHaveLength(acts.length + 1);
    expect(a.map((f) => f.truth)).toEqual(b.map((f) => f.truth));
    expect(a.at(-1)!.belief).toEqual(b.at(-1)!.belief);
    expect([a.at(-1)!.moves, a.at(-1)!.senses]).toEqual([5, 6]);
    for (let k = 1; k < a.length; k++) expect(a[k]!.before).toBe(a[k - 1]!.belief);
    expect(a[0]!.belief).toEqual(uniformBelief(N_CELLS));
  });

  it('sense frames carry the reading, likelihood and evidence = Σ likelihood × predicted belief', () => {
    for (const f of run(autoActions(8), D, 5)) {
      if (f.action !== 'sense') {
        expect(f.lik).toBeNull();
        expect(f.evidence).toBeNull();
        continue;
      }
      let e = 0;
      for (let i = 0; i < N_CELLS; i++) e += f.lik![i]! * f.before[i]!;
      expect(f.evidence).toBeCloseTo(e, 15);
      expect(sum(f.belief)).toBeCloseTo(1, 12);
    }
  });

  it('common random numbers: the true path does not depend on the sensor rates or ε', () => {
    const acts = autoActions(20);
    const t = (p: typeof D) => run(acts, p, 7).map((f) => f.truth);
    expect(t({ ...D, hit: 0.6, falseAlarm: 0.3 })).toEqual(t(D));
    expect(t({ ...D, allowKidnap: true })).toEqual(t(D));
  });

  it('kidnapping teleports between a quarter and three quarters of the loop, and leaves the belief alone', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const fr = run(['kidnap'], D, seed);
      const jump = (((fr[1]!.truth - fr[0]!.truth) % N_CELLS) + N_CELLS) % N_CELLS;
      expect(jump).toBeGreaterThanOrEqual(N_CELLS / 4);
      expect(jump).toBeLessThan((3 * N_CELLS) / 4);
      expect(fr[1]!.belief).toBe(fr[0]!.belief);
    }
  });

  it('autoplay alternates, starting with a reading; presets', () => {
    expect(nextAuto([])).toBe('sense');
    expect(nextAuto(['sense'])).toBe('move');
    expect(nextAuto(['sense', 'move'])).toBe('sense');
    expect(nextAuto(['sense', 'kidnap'])).toBe('sense');
    expect(autoActions(2)).toEqual(['sense', 'move', 'sense', 'move', 'sense']);
    expect(presetActions('fresh')).toEqual([]);
    expect(presetActions('tracking')).toHaveLength(2 * CORRIDOR.trackingPairs + 1);
  });

  it('loopDistance wraps; summarize; modes', () => {
    expect(loopDistance(0, N_CELLS - 1)).toBeCloseTo(CORRIDOR.cell, 15);
    expect(loopDistance(0, N_CELLS / 2)).toBeCloseTo(CORRIDOR.length / 2, 15);
    const b = pointBelief(N_CELLS, 10);
    const f = { ...run([], D)[0]!, belief: b, truth: 12 };
    const s = summarize(f);
    expect([s.best, s.bestProb, s.nearTruth, s.bestError]).toEqual([10, 1, 1, 0.5]);
    expect(cellCenter(10)).toBeCloseTo(2.625, 15);
    expect(modes(uniformBelief(N_CELLS))).toEqual([]);
    expect(modes(b)).toEqual([10]);
    const two = new Float64Array(N_CELLS);
    two[5] = 0.5;
    two[60] = 0.5;
    expect(modes(two)).toEqual([5, 60]);
  });
});
