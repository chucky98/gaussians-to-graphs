import { describe, expect, it } from 'vitest';
import { EKF_PRESETS as P, HALL, poseError, route, runEkf } from '../../../src/lib/demos/ekf-localization';
import { isSymmetricPSD, vec } from '../../../src/lib/math/matrix';
import { rangeBearing } from '../../../src/lib/models/range-bearing';

describe('ekf-localization model', () => {
  it('the route is one rounded-rectangle lap plus a straight; noise-free it closes the lap', () => {
    const r = runEkf({ ...P.default, sigmaV: 0, sigmaW: 0 }, 1);
    const lapEnd = r.steps[95]!.truth; // 96 steps = one lap
    expect(Math.hypot(lapEnd[0]! - HALL.start[0], lapEnd[1]! - HALL.start[1])).toBeLessThan(1e-9);
    expect(route().filter((u) => u.w !== 0)).toHaveLength(16);
  });
  it('deterministic; covariance symmetric PSD; sightings within range and consistent with the truth', () => {
    const a = runEkf(P.default, 4);
    const b = runEkf(P.default, 4);
    expect(a.steps.at(-1)!.post.x).toEqual(b.steps.at(-1)!.post.x);
    for (const s of a.steps) {
      expect(isSymmetricPSD(s.post.P)).toBe(true);
      for (const g of s.seen) {
        const z0 = rangeBearing(s.truth, vec(HALL.landmarks[g.index]!));
        expect(z0[0]).toBeLessThanOrEqual(P.default.range);
        expect(Math.abs(g.z[0]! - z0[0]!)).toBeLessThan(0.6);
      }
    }
  });
  it('the truth does not depend on the sensor settings (common random numbers)', () => {
    const a = runEkf(P.default, 9);
    const b = runEkf({ ...P.default, range: 9, sigmaPhiDeg: 7 }, 9);
    expect(a.steps.map((s) => s.truth)).toEqual(b.steps.map((s) => s.truth));
  });
  it('poseError wraps the heading', () => {
    expect(poseError(vec([0, 0, Math.PI - 0.1]), vec([0, 0, -Math.PI + 0.1]))[2]).toBeCloseTo(-0.2, 12);
  });
});
