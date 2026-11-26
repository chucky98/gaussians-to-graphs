/** Every concrete claim in post 10, checked against CorridorRobot's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  CORRIDOR,
  CORRIDOR_DEFAULTS as D,
  N_CELLS,
  autoActions,
  cellCenter,
  isDoorCell,
  modes,
  presetActions,
  run,
  summarize,
  type Action,
  type CorridorParams,
  type Frame,
} from '../../../src/lib/demos/corridor-robot';
import { massNear } from '../../../src/lib/filters/histogram';

const m1 = (v: number) => v.toFixed(1);
const pct = (v: number) => Math.round(100 * v);
/** The frame right after the reading that follows move k (autoplay order: sense, move, sense, …). */
const afterReading = (frames: Frame[], k: number) => frames.find((f) => f.action === 'sense' && f.moves === k)!;

describe('post 10: setup', () => {
  it('30 m loop of 120 cells of 25 cm; six doors, two pairs 3 m apart (1/4 and 10/13), one 1.5 m wide at 20', () => {
    expect([CORRIDOR.length, CORRIDOR.cell, N_CELLS]).toEqual([30, 0.25, 120]);
    expect(CORRIDOR.doors).toHaveLength(6);
    expect(CORRIDOR.doors.map(([a]) => a)).toEqual([1, 4, 10, 13, 20, 25]);
    expect(CORRIDOR.doors.find(([a]) => a === 20)).toEqual([20, 21.5]);
    const widths = CORRIDOR.doors.map(([a, b]) => b - a);
    expect(Math.min(...widths)).toBe(1);
    expect(Math.max(...widths)).toBe(1.5);
  });
  it('defaults: α = 0.1 m per 1 m move, hit 0.9, false alarm 0.05; ratios 18:1 and 9.5:1; ε = 0.001', () => {
    expect([D.alpha, D.hit, D.falseAlarm, D.allowKidnap, CORRIDOR.move]).toEqual([0.1, 0.9, 0.05, false, 1]);
    expect(D.hit / D.falseAlarm).toBeCloseTo(18, 12);
    expect((1 - D.falseAlarm) / (1 - D.hit)).toBeCloseTo(9.5, 12);
    expect(CORRIDOR.kidnapProb).toBe(0.001);
  });
  it('robot starts at 0.1 m, just before the first door; 50 m × 50 m at 10 cm and 5° is 18 million cells', () => {
    const f0 = run([], D)[0]!;
    expect(m1(cellCenter(f0.truth))).toBe('0.1');
    expect(isDoorCell(f0.truth)).toBe(false);
    expect((50 / 0.1) ** 2 * (360 / 5)).toBe(18_000_000);
  });
});

describe('post 10: the default run (seed 18)', () => {
  const fr = run(autoActions(30), D, CORRIDOR.seed);
  it('the first reading is "wall" and barely changes the flat belief', () => {
    const f = fr[1]!;
    expect(f.reading).toBe(false);
    expect(Math.max(...f.belief)).toBeLessThan(0.011);
    expect(Math.min(...f.belief)).toBeGreaterThan(0.001);
  });
  it('move 1: "door" → six bumps, one in front of each door', () => {
    const f = afterReading(fr, 1);
    expect(f.reading).toBe(true);
    const ms = modes(f.belief);
    expect(ms).toHaveLength(6);
    for (const i of ms) expect(isDoorCell(i)).toBe(true);
  });
  it('move 4: second door 3 m later → two bumps of equal height, at the two door pairs', () => {
    const f = afterReading(fr, 4);
    expect(f.reading).toBe(true);
    const ms = modes(f.belief);
    expect(ms.map((i) => m1(cellCenter(i)))).toEqual(['4.4', '13.4']);
    const [a, b] = ms.map((i) => massNear(f.belief, i, 4));
    expect(Math.abs(a! - b!)).toBeLessThan(1e-3);
    expect(f.belief[ms[0]!]).toBeCloseTo(f.belief[ms[1]!]!, 3);
  });
  it('move 10: the door at 10 m is missed; best guess 19.4 m while the robot is at 10.1 m; 17% near the truth', () => {
    const f = afterReading(fr, 10);
    expect(isDoorCell(f.truth)).toBe(true);
    expect(f.reading).toBe(false);
    const s = summarize(f);
    expect(m1(cellCenter(s.best))).toBe('19.4');
    expect(m1(cellCenter(f.truth))).toBe('10.1');
    expect(pct(s.nearTruth)).toBe(17);
    // The true bump is still there.
    expect(modes(f.belief)).toHaveLength(2);
  });
  it('move 19: one bump left, 84%; move 21 (wide door at 20 m): 97%', () => {
    const f19 = afterReading(fr, 19);
    expect(modes(f19.belief)).toHaveLength(1);
    expect(pct(summarize(f19).nearTruth)).toBe(84);
    const f21 = afterReading(fr, 21);
    expect(f21.reading).toBe(true);
    expect(cellCenter(f21.truth)).toBeGreaterThanOrEqual(20);
    expect(cellCenter(f21.truth)).toBeLessThan(21.5);
    expect(pct(summarize(f21).nearTruth)).toBe(97);
  });
  it('typical, not lucky: first above 90% at move 21; the median over seeds 1–100 is 19', () => {
    const first = (p: CorridorParams, seed: number) => {
      for (const f of run(autoActions(60), p, seed))
        if (f.action === 'sense' && summarize(f).nearTruth > 0.9) return f.moves;
      return Infinity;
    };
    expect(first(D, CORRIDOR.seed)).toBe(21);
    const t = Array.from({ length: 100 }, (_, i) => first(D, i + 1)).sort((a, b) => a - b);
    expect(t[50]).toBe(19);
  });
});

describe('post 10: Try this', () => {
  it('α = 0.5 m: after 30 moves only 28% within 1 m of the truth, against 98% with α = 0.1 m', () => {
    const near = (alpha: number) => summarize(run(autoActions(30), { ...D, alpha }, CORRIDOR.seed).at(-1)!).nearTruth;
    expect(pct(near(0.5))).toBe(28);
    expect(pct(near(0.1))).toBe(98);
  });
  it('hit = false alarm = 0.5: the belief stays exactly uniform', () => {
    const fr = run(autoActions(30), { ...D, hit: 0.5, falseAlarm: 0.5 }, CORRIDOR.seed);
    for (const f of fr) for (const v of f.belief) expect(v).toBeCloseTo(1 / N_CELLS, 15);
  });
});

describe('post 10: the kidnapped robot (tracking preset)', () => {
  const pre = presetActions('tracking');
  const after = (allowKidnap: boolean, moves: number) => {
    const acts: Action[] = [...pre, 'kidnap', ...autoActions(moves)];
    return run(acts, { ...D, allowKidnap }, CORRIDOR.seed);
  };
  const K = pre.length + 1; // index of the kidnap frame

  it('two laps (60 moves of 1 m); readout shows 100% within 1 m of the truth', () => {
    expect(pre.filter((a) => a === 'move').length * CORRIDOR.move).toBe(2 * CORRIDOR.length);
    const f = run(pre, D, CORRIDOR.seed).at(-1)!;
    expect(pct(summarize(f).nearTruth)).toBe(100);
  });
  it('kidnap: carried 20 m along the loop to 20.6 m; the belief does not change; true region ≈ 3 × 10⁻⁸', () => {
    const fr = after(false, 0);
    const before = fr[K - 1]!;
    const k = fr[K]!;
    expect(k.action).toBe('kidnap');
    expect(m1(cellCenter(k.truth))).toBe('20.6');
    expect(Math.round(cellCenter(k.truth) - cellCenter(before.truth))).toBe(20);
    expect(k.belief).toBe(before.belief);
    const near = summarize(k).nearTruth;
    expect(near).toBeGreaterThan(2e-8);
    expect(near).toBeLessThan(4e-8);
  });
  it('without ε: still lost 80 moves later (8% near the truth); the bump keeps marching 1 m per move', () => {
    const fr = after(false, 80);
    expect(pct(summarize(fr.at(-1)!).nearTruth)).toBe(8);
    for (let k = K + 2; k < fr.length; k++)
      if (fr[k]!.action === 'sense') expect(summarize(fr[k]!).nearTruth).toBeLessThan(0.1);
  });
  it('with ε = 0.001: true region ≈ 10⁻⁴ right after the kidnap; above 90% 32 moves later', () => {
    const fr = after(true, 80);
    const near = summarize(fr[K]!).nearTruth;
    expect(near).toBeGreaterThan(1e-4);
    expect(near).toBeLessThan(2e-4);
    const first = fr.slice(K).find((f) => f.action === 'sense' && summarize(f).nearTruth > 0.9)!;
    expect(first.moves - fr[K]!.moves).toBe(32);
  });
  it('after every prediction each cell holds at least ε/120', () => {
    const fr = after(true, 10);
    for (const f of fr) if (f.action === 'move') expect(Math.min(...f.belief)).toBeGreaterThanOrEqual(0.001 / 120);
  });
  it('cost of ε over seeds 1–100 (moves 30–60): 94.2% → 92.6% within 1 m of the truth', () => {
    const avg = (allowKidnap: boolean) => {
      let a = 0;
      let n = 0;
      for (let seed = 1; seed <= 100; seed++)
        for (const f of run(autoActions(60), { ...D, allowKidnap }, seed))
          if (f.action === 'sense' && f.moves >= 30) {
            a += summarize(f).nearTruth;
            n++;
          }
      return ((100 * a) / n).toFixed(1);
    };
    expect(avg(false)).toBe('94.2');
    expect(avg(true)).toBe('92.6');
  });
});
