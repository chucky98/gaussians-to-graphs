import { describe, expect, it } from 'vitest';
import {
  MCL,
  MCL_DEFAULTS as D,
  createMclRunner,
  initialState,
  readingLogLik,
  runMcl,
  simulateTruth,
} from '../../../src/lib/demos/mcl';
import { rangeBearing } from '../../../src/lib/models/range-bearing';
import { HALL } from '../../../src/lib/demos/ekf-localization';
import { vec } from '../../../src/lib/math/matrix';

describe('mcl model', () => {
  it('initial particles are inside the walls with uniform weights', () => {
    const s = initialState({ ...D, np: 300 });
    for (let i = 0; i < 300; i++) {
      expect(s.particles[3 * i]).toBeGreaterThanOrEqual(MCL.walls.x[0]);
      expect(s.particles[3 * i + 1]).toBeLessThanOrEqual(MCL.walls.y[1]);
    }
    expect(s.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });
  it('a reading fits the true pose better than a wrong one', () => {
    const pose = vec([6, 3, 0.3]);
    const z = rangeBearing(pose, vec(HALL.landmarks[6]!));
    expect(readingLogLik(6, 3, 0.3, z)).toBeGreaterThan(readingLogLik(12, 9, 2, z) + 3);
  });
  it('the worker runner reproduces runMcl, advancing and rewinding', () => {
    const p = { ...D, np: 300 };
    const ref = runMcl(p, 12, simulateTruth(null, 5), 5);
    const r = createMclRunner();
    r.run(p, 5, 4);
    const a = r.run(p, 5, 12); // advance from the cached state
    expect(a.summaries.map((s) => s.err)).toEqual(ref.summaries.map((s) => s.err));
    const b = r.run(p, 5, 6); // rewind: restart from scratch
    expect(b.summaries.map((s) => s.err)).toEqual(ref.summaries.slice(0, 6).map((s) => s.err));
    expect(b.xy).toHaveLength(600);
  });
});
