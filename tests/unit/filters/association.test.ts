/** Data association (Post 25): gating, nearest neighbour, joint compatibility and JCBB. */
import { describe, expect, it } from 'vitest';
import { compatibility, gate, jcbb, jointDistance, nearestNeighbour } from '../../../src/lib/filters/association';
import { makeScene, sceneR, SCENE } from '../../../src/lib/demos/association';
import { chi2Quantile } from '../../../src/lib/math/stats';

describe('association', () => {
  it('the joint distance of a single pairing equals its individual d²', () => {
    const sc = makeScene({ ...SCENE.defaults, offset: 0.7 });
    const d2 = compatibility(sc.state, sc.readings, sceneR());
    for (let i = 0; i < sc.readings.length; i++)
      for (let j = 0; j < SCENE.landmarks.length; j++) {
        const h = sc.readings.map(() => -1);
        h[i] = j;
        expect(jointDistance(sc.state, sc.readings, h, sceneR())).toBeCloseTo(d2[i]![j]!, 9);
      }
    expect(gate(0.99)).toBeCloseTo(chi2Quantile(0.99, 2), 12);
    expect(gate(0.99, 3)).toBeCloseTo(chi2Quantile(0.99, 6), 12);
  });
  it('JCBB returns jointly compatible hypotheses that use each landmark at most once', () => {
    for (const offset of [0, 0.3, 0.6, 1, 1.5])
      for (const clutter of [0, 4, 8])
        for (const p of [0.9, 0.99, 0.999]) {
          const sc = makeScene({ offset, clutter, gateProb: p });
          const h = jcbb(sc.state, sc.readings, sceneR(), p);
          const used = h.filter((j) => j >= 0);
          expect(new Set(used).size).toBe(used.length);
          if (used.length)
            expect(jointDistance(sc.state, sc.readings, h, sceneR())).toBeLessThanOrEqual(gate(p, used.length));
        }
  });
  it('JCBB finds the true pairing when it is jointly compatible and pairs every reading', () => {
    for (const offset of [0, 0.4, 0.6, 0.9, 1.2]) {
      const sc = makeScene({ offset, clutter: 0, gateProb: 0.99 });
      const truth = sc.source;
      if (jointDistance(sc.state, sc.readings, truth, sceneR()) <= gate(0.99, truth.length)) {
        expect(jcbb(sc.state, sc.readings, sceneR(), 0.99)).toEqual(truth);
      }
    }
  });
  it('nearest neighbour takes the closest compatible landmark and never reuses one', () => {
    const sc = makeScene({ ...SCENE.defaults, offset: 0, clutter: 3 });
    const h = nearestNeighbour(sc.state, sc.readings, sceneR(), 0.99);
    const used = h.filter((j) => j >= 0);
    expect(new Set(used).size).toBe(used.length);
    expect(h.slice(0, 6)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
