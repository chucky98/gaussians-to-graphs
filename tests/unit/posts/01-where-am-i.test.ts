/** Every concrete claim in post 01, checked against DriftFan's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  DRIFT_DEFAULTS as D,
  DRIFT_LIMITS,
  positionErrors,
  rmsCurve,
  rmsError,
  rmsHeadingError,
  simulate,
  spreadAt,
} from '../../../src/lib/demos/drift-fan';
import { applyOdometryNoise, deadReckon, odometryNoiseDraws, runSeed } from '../../../src/lib/sim/odometry';
import { pose } from '../../../src/lib/geometry/se2';
import { variance } from '../../../src/lib/math/stats';

const deg = (r: number) => (r * 180) / Math.PI;
const sim = simulate(D);
const [lap1, lap2] = sim.lapEnds as [number, number];

describe('post 01: setup', () => {
  it('defaults: 3% noise, 30 runs, truth shown; 280 readings of about 25 cm; laps of 34.8 m', () => {
    expect(D).toMatchObject({ noisePct: 3, runs: 30, showTruth: true });
    expect(sim.steps).toBe(280);
    expect(sim.distance[lap1]!.toFixed(1)).toBe('34.8'); // 2·8 + 6π = 34.85 m
    expect(sim.distance[lap2]!.toFixed(1)).toBe('69.7');
    for (let k = 1; k <= sim.steps; k++) {
      const d = sim.distance[k]! - sim.distance[k - 1]!;
      expect(d).toBeGreaterThan(0.24);
      expect(d).toBeLessThanOrEqual(0.25 + 1e-12);
    }
  });
  it('the robot passes its starting point after one lap', () => {
    expect(Math.hypot(sim.truth[lap1]!.x - sim.truth[0]!.x, sim.truth[lap1]!.y - sim.truth[0]!.y)).toBeLessThan(1e-9);
  });
});

describe('post 01: widget claims (defaults)', () => {
  it('RMS error 1.19 m after one lap, 1.98 m after two; worst run 4.67 m', () => {
    expect(rmsError(sim, lap1).toFixed(2)).toBe('1.19');
    expect(rmsError(sim, lap2).toFixed(2)).toBe('1.98');
    expect(Math.max(...positionErrors(sim, lap2)).toFixed(2)).toBe('4.67');
  });

  it('the error rises in waves: 1.4 (after ~31 m), dip 1.05, 1.9, dip 1.4, 2.3; each crest and dip higher', () => {
    const c = rmsCurve(sim);
    // Alternating crests and dips with 0.1 m hysteresis (ignores wiggles smaller than that).
    const ext: { kind: 'crest' | 'dip'; k: number; v: number }[] = [];
    let rising = true;
    let best = 0;
    let bestK = 0;
    for (let k = 1; k <= sim.steps; k++) {
      const v = c[k]!;
      if (rising ? v > best : v < best) {
        best = v;
        bestK = k;
      } else if (Math.abs(v - best) > 0.1) {
        ext.push({ kind: rising ? 'crest' : 'dip', k: bestK, v: best });
        rising = !rising;
        best = v;
        bestK = k;
      }
    }
    expect(ext.map((e) => e.kind)).toEqual(['crest', 'dip', 'crest', 'dip', 'crest']);
    expect(ext.map((e) => e.v.toFixed(e.kind === 'dip' && e.v < 1.2 ? 2 : 1))).toEqual([
      '1.4',
      '1.05',
      '1.9',
      '1.4',
      '2.3',
    ]);
    expect(Math.round(sim.distance[ext[0]!.k]!)).toBe(31);
    const crests = ext.filter((e) => e.kind === 'crest').map((e) => e.v);
    const dips = ext.filter((e) => e.kind === 'dip').map((e) => e.v);
    for (let i = 1; i < crests.length; i++) expect(crests[i]!).toBeGreaterThan(crests[i - 1]!);
    for (let i = 1; i < dips.length; i++) expect(dips[i]!).toBeGreaterThan(dips[i - 1]!);
  });

  it('Try 2: zero noise puts every run on the truth; 6% gives 2.38 m and 3.91 m', () => {
    const zero = simulate({ ...D, noisePct: 0 });
    expect(zero.runs.every((r) => r.every((q, k) => q.x === zero.truth[k]!.x && q.y === zero.truth[k]!.y))).toBe(true);
    expect(rmsError(zero, lap2)).toBe(0);
    const six = simulate({ ...D, noisePct: 6 });
    expect(rmsError(six, lap1).toFixed(2)).toBe('2.38');
    expect(rmsError(six, lap2).toFixed(2)).toBe('3.91');
    expect(6).toBeLessThanOrEqual(DRIFT_LIMITS.noisePct.max);
  });

  it('Try 3: heading error after two laps: theory 14.4°, 30 runs 13.8°, 100 runs 14.2°', () => {
    expect(deg(0.03 * Math.sqrt(sim.distance[lap2]!)).toFixed(1)).toBe('14.4');
    expect(deg(rmsHeadingError(sim, lap2)).toFixed(1)).toBe('13.8');
    expect(deg(rmsHeadingError(simulate({ ...D, runs: 100 }), lap2)).toFixed(1)).toBe('14.2');
    expect(100).toBeLessThanOrEqual(DRIFT_LIMITS.runs.max);
  });

  it('the 95% ellipse needs at least three runs', () => {
    expect(spreadAt(simulate({ ...D, runs: 2 }), lap2)).toBeNull();
    expect(spreadAt(sim, lap2)).not.toBeNull();
  });
});

describe('post 01: error-growth claims', () => {
  it('a one-degree heading error costs 1.7 cm per metre', () => {
    expect((100 * Math.tan(Math.PI / 180)).toFixed(1)).toBe('1.7');
  });

  it('straight 20 m at α = 3%: heading 0.13 rad (7.7°), sideways ≈ 1.55 m, distance-only 0.13 m', () => {
    const a = 0.03;
    const L = 20;
    expect((a * Math.sqrt(L)).toFixed(2)).toBe('0.13');
    expect(deg(a * Math.sqrt(L)).toFixed(1)).toBe('7.7');
    const formula = (a * L ** 1.5) / Math.sqrt(3);
    expect(formula.toFixed(2)).toBe('1.55');
    expect(formula / (a * Math.sqrt(L))).toBeGreaterThan(10);
    // Monte Carlo with the same motion and noise model as the widget.
    const n = 80;
    const truth = Array.from({ length: n }, () => ({ d: L / n, dtheta: 0 }));
    const lat: number[] = [];
    for (let r = 0; r < 4000; r++) {
      const end = deadReckon(pose(0, 0, 0), applyOdometryNoise(truth, a, odometryNoiseDraws(runSeed(42, r), n))).at(
        -1,
      )!;
      lat.push(end.y);
    }
    const mc = Math.sqrt(variance(lat));
    expect(Math.abs(mc / formula - 1)).toBeLessThan(0.05);
  });
});
