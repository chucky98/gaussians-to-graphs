import { describe, expect, it } from 'vitest';
import {
  DRIFT_DEFAULTS as D,
  DRIFT_STEPS,
  positionErrors,
  rmsCurve,
  rmsError,
  rmsHeadingError,
  simulate,
  spreadAt,
  toXY,
} from '../../../src/lib/demos/drift-fan';

describe('drift-fan model', () => {
  const sim = simulate(D);
  it('has one trajectory per run, each with steps + 1 poses, all starting at the truth', () => {
    expect(sim.runs).toHaveLength(D.runs);
    expect(sim.steps).toBe(DRIFT_STEPS);
    for (const r of sim.runs) {
      expect(r).toHaveLength(sim.steps + 1);
      expect(r[0]).toEqual(sim.truth[0]);
    }
    expect(rmsError(sim, 0)).toBe(0);
  });
  it('is deterministic and run r does not depend on how many runs there are', () => {
    expect(simulate(D)).toEqual(sim);
    const more = simulate({ ...D, runs: 50 });
    expect(more.runs.slice(0, D.runs)).toEqual(sim.runs);
  });
  it('helpers: curve, errors, spread, XY', () => {
    const c = rmsCurve(sim);
    expect(c).toHaveLength(sim.steps + 1);
    expect(c[100]).toBeCloseTo(rmsError(sim, 100), 14);
    expect(Math.max(...positionErrors(sim, 100))).toBeGreaterThanOrEqual(c[100]!);
    expect(spreadAt(sim, 0)).toBeNull(); // no spread at the start
    expect(spreadAt(simulate({ ...D, runs: 2 }), 100)).toBeNull();
    expect(spreadAt(sim, 100)!.mean).toHaveLength(2);
    const xy = toXY(sim.truth);
    expect(xy[2]).toBe(sim.truth[1]!.x);
    expect(rmsHeadingError(sim, 0)).toBe(0);
  });
});
