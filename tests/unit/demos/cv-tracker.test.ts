import { describe, expect, it } from 'vitest';
import {
  CV,
  CV_DEFAULTS as D,
  T_MAX,
  makeScenario,
  priorState,
  runCv,
  sdOf,
  speedOf,
  stateAt,
  velocityCoverage,
  viewBox,
} from '../../../src/lib/demos/cv-tracker';

describe('cv-tracker model', () => {
  it('scenarios are deterministic and have one fix per step', () => {
    for (const preset of ['wander', 'turn'] as const) {
      const a = makeScenario(preset, D, 4);
      expect(a).toEqual(makeScenario(preset, D, 4));
      expect(a.truth).toHaveLength(CV.steps + 1);
      expect(a.zs).toHaveLength(CV.steps);
    }
  });
  it('the turn: constant 1.4 m/s, east before t = 20 s, north from t = 22 s, path continuous', () => {
    const s = makeScenario('turn', D);
    for (const x of s.truth) expect(speedOf(x)).toBeCloseTo(1.4, 12);
    expect(s.truth[20]![3]).toBeCloseTo(0, 12);
    expect(s.truth[22]![2]).toBeCloseTo(0, 12);
    for (let k = 1; k <= CV.steps; k++) {
      const d = Math.hypot(s.truth[k]![0]! - s.truth[k - 1]![0]!, s.truth[k]![1]! - s.truth[k - 1]![1]!);
      expect(d).toBeLessThanOrEqual(1.4 + 1e-9);
      expect(d).toBeGreaterThan(1.2);
    }
  });
  it('σ only rescales the fix errors (same draws)', () => {
    const a = makeScenario('turn', D, 9);
    const b = makeScenario('turn', { ...D, sigma: 2 * D.sigma }, 9);
    for (let k = 0; k < CV.steps; k++)
      expect(b.zs[k]![0]! - b.truth[k + 1]![0]!).toBeCloseTo(2 * (a.zs[k]![0]! - a.truth[k + 1]![0]!), 12);
  });
  it('half-steps, standard deviations, coverage and the view box', () => {
    const s = makeScenario('wander', D);
    const st = runCv(s, D);
    expect(stateAt(st, 0)).toEqual(priorState());
    expect(stateAt(st, 1)).toBe(st[0]!.prior);
    expect(stateAt(st, T_MAX)).toBe(st[CV.steps - 1]!.post);
    expect(sdOf(priorState(), 2)).toBe(2);
    expect(
      velocityCoverage(
        st,
        st.map((x) => x.post.x).reduce((a, x) => [...a, x], [s.truth[0]!]),
      ),
    ).toBe(1);
    const b = viewBox(s);
    for (const p of [...s.truth, ...s.zs]) {
      expect(p[0]).toBeGreaterThan(b.x[0]);
      expect(p[0]).toBeLessThan(b.x[1]);
      expect(p[1]).toBeGreaterThan(b.y[0]);
      expect(p[1]).toBeLessThan(b.y[1]);
    }
    expect(b.x[1] - b.x[0]).toBeGreaterThanOrEqual(20);
  });
});
