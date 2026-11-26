/** Every concrete claim in post 08, checked against RLSStream's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import { MOTOR, batchAt, makeStream, runRls } from '../../../src/lib/demos/rls-stream';

const f3 = (v: number) => v.toFixed(3);
const pm = (st: { x: Float64Array; P: { data: Float64Array } }) => [f3(st.x[1]!), f3(1.96 * Math.sqrt(st.P.data[3]!))];
const steady = makeStream('steady', MOTOR.seed);
const sag = makeStream('sag', MOTOR.seed);
const errLast40 = (preset: 'steady' | 'sag', beta: number) => {
  const s = preset === 'steady' ? steady : sag;
  const st = runRls(s, beta);
  const e = st.map((x, k) => Math.abs(x.x[1]! / s.trueGain[k]! - 1)).slice(MOTOR.steps - 40);
  return (100 * e.reduce((a, b) => a + b, 0)) / 40;
};

describe('post 08: setup', () => {
  it('120 measurements, noise 0.8 rad/s, true gain 0.25 → 0.20 (−20%) at measurement 60, offset −1', () => {
    expect([MOTOR.steps, MOTOR.sigma, MOTOR.gain, MOTOR.sagGain, MOTOR.sagAt, MOTOR.offset]).toEqual([
      120, 0.8, 0.25, 0.2, 60, -1,
    ]);
    expect(MOTOR.sagGain / MOTOR.gain).toBeCloseTo(0.8, 12);
    expect(Math.min(...steady.duty)).toBeGreaterThanOrEqual(20);
  });
  it('RLS equals batch at every step (difference < 1e-9), β = 1 and β = 0.95', () => {
    for (const beta of [1, 0.95]) {
      const st = runRls(steady, beta);
      for (let k = 1; k <= MOTOR.steps; k += 7) {
        const b = batchAt(steady, k, beta);
        expect(Math.abs(b.x[0]! - st[k - 1]!.x[0]!)).toBeLessThan(1e-9);
        expect(Math.abs(b.x[1]! - st[k - 1]!.x[1]!)).toBeLessThan(1e-9);
      }
    }
  });
  it('β = 0.95 remembers about 20 measurements; 0.85 about 7', () => {
    expect(Math.round(1 / (1 - 0.95))).toBe(20);
    expect(Math.round(1 / (1 - 0.85))).toBe(7);
  });
});

describe('post 08: steady battery', () => {
  it('gain 0.228 ± 0.098 after 1, 0.247 ± 0.031 after 10, 0.248 ± 0.006 after 120', () => {
    const st = runRls(steady, 1);
    expect(pm(st[0]!)).toEqual(['0.228', '0.098']);
    expect(pm(st[9]!)).toEqual(['0.247', '0.031']);
    expect(pm(st[119]!)).toEqual(['0.248', '0.006']);
  });
  it('β = 0.95: 0.236 ± 0.017, about three times less precise', () => {
    const a = runRls(steady, 0.95).at(-1)!;
    expect(pm(a)).toEqual(['0.236', '0.017']);
    const r = Math.sqrt(a.P.data[3]!) / Math.sqrt(runRls(steady, 1).at(-1)!.P.data[3]!);
    expect(Math.round(r)).toBe(3);
  });
  it('β = 0.95: offset ends at −0.08 but speeds stay within 0.63 rad/s over 20–100% (< noise)', () => {
    const a = runRls(steady, 0.95).at(-1)!;
    expect(a.x[0]!.toFixed(2)).toBe('-0.08');
    let m = 0;
    for (let u = 20; u <= 100; u += 0.5)
      m = Math.max(m, Math.abs(a.x[0]! + a.x[1]! * u - (MOTOR.offset + MOTOR.gain * u)));
    expect(m.toFixed(2)).toBe('0.63');
    expect(m).toBeLessThan(MOTOR.sigma);
  });
});

describe('post 08: battery sag', () => {
  it('β = 1: ends at 0.223 ± 0.006; the 95% band excludes the true 0.200', () => {
    const a = runRls(sag, 1).at(-1)!;
    expect(pm(a)).toEqual(['0.223', '0.006']);
    expect(a.x[1]! - 1.96 * Math.sqrt(a.P.data[3]!)).toBeGreaterThan(0.2);
  });
  it('β = 0.95: ends at 0.189 ± 0.017, band contains 0.200; last-40 error 14.5% → 3.8%', () => {
    const a = runRls(sag, 0.95).at(-1)!;
    expect(pm(a)).toEqual(['0.189', '0.017']);
    expect(a.x[1]! + 1.96 * Math.sqrt(a.P.data[3]!)).toBeGreaterThan(0.2);
    expect(errLast40('sag', 1).toFixed(1)).toBe('14.5');
    expect(errLast40('sag', 0.95).toFixed(1)).toBe('3.8');
  });
  it('β = 0.85: last-40 error rises again to 6.7% (sweet spot in between)', () => {
    expect(errLast40('sag', 0.85).toFixed(1)).toBe('6.7');
    expect(errLast40('sag', 0.95)).toBeLessThan(errLast40('sag', 0.9));
    expect(errLast40('sag', 0.95)).toBeLessThan(errLast40('sag', 0.98));
  });
});
