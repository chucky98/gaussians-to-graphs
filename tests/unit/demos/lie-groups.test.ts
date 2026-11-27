/** The model behind TangentSpace and SE2Exp (Post 21). */
import { describe, expect, it } from 'vitest';
import {
  TANGENT,
  arcPoints,
  arcRadius,
  expArc,
  expEnd,
  naiveSum,
  poseDistance,
  startPose,
  steps,
  tangentState,
  twistTo,
} from '../../../src/lib/demos/lie-groups';
import { angleDiff } from '../../../src/lib/geometry/so2';

describe('tangentState', () => {
  it('X ⊕ τ lies an arc of length τ from X; the tip is on the tangent line; the projection is atan(τ)', () => {
    for (const tau of [-5, -1, 0.3, 1.2, 3]) {
      const s = tangentState(40, tau);
      expect(angleDiff(s.exactAngle, (40 * Math.PI) / 180 + tau)).toBeCloseTo(0, 12);
      expect((s.tip[0] - s.x[0]) * s.x[0] + (s.tip[1] - s.x[1]) * s.x[1]).toBeCloseTo(0, 12);
      const tipAngle = Math.atan2(s.tip[1], s.tip[0]);
      expect(angleDiff(tipAngle, (40 * Math.PI) / 180)).toBeCloseTo(s.projectedTurn, 12);
      expect(Math.hypot(...s.tip) - 1).toBeCloseTo(s.offCircle, 12);
    }
    expect(TANGENT.defaults).toEqual({ xDeg: 30, tau: 1.2 });
  });
  it('arcPoints lie on the unit circle', () => {
    for (const p of arcPoints(0.3, 2)) expect(Math.hypot(...p)).toBeCloseTo(1, 14);
  });
});

describe('SE(2) constant-twist motion', () => {
  const t = { rho1: 2, rho2: 0.5, theta: 1.1 };
  it('the arc starts at X and ends at X ⊕ τ, at constant distance from the centre of turning', () => {
    const X = startPose(25);
    const arc = expArc(X, t);
    expect(poseDistance(arc[0]!, X)).toBeLessThan(1e-14);
    expect(poseDistance(arc.at(-1)!, expEnd(X, t))).toBeLessThan(1e-12);
    // centre of the circle: X's position plus R along the body-frame direction perpendicular to ρ
    const R = arcRadius(t);
    const dists = arc.map((p) => p);
    const c = (() => {
      const [a, b, m] = [dists[0]!, dists[32]!, dists[64]!];
      // circumcentre of three arc points
      const d = 2 * (a.x * (b.y - m.y) + b.x * (m.y - a.y) + m.x * (a.y - b.y));
      const ux =
        ((a.x ** 2 + a.y ** 2) * (b.y - m.y) +
          (b.x ** 2 + b.y ** 2) * (m.y - a.y) +
          (m.x ** 2 + m.y ** 2) * (a.y - b.y)) /
        d;
      const uy =
        ((a.x ** 2 + a.y ** 2) * (m.x - b.x) +
          (b.x ** 2 + b.y ** 2) * (a.x - m.x) +
          (m.x ** 2 + m.y ** 2) * (b.x - a.x)) /
        d;
      return [ux, uy];
    })();
    for (const p of arc) expect(Math.hypot(p.x - c[0]!, p.y - c[1]!)).toBeCloseTo(R, 10);
  });
  it('N straight-then-turn steps converge to Exp with error halving as N doubles', () => {
    const X = startPose(-40);
    const e = expEnd(X, t);
    let prev = Infinity;
    for (const N of [4, 8, 16, 32, 64]) {
      const err = poseDistance(steps(X, t, N)[N]!, e);
      expect(err).toBeLessThan(prev);
      if (Number.isFinite(prev)) expect(prev / err).toBeCloseTo(2, 1);
      prev = err;
      expect(angleDiff(steps(X, t, N)[N]!.theta, e.theta)).toBeCloseTo(0, 12);
    }
  });
  it('twistTo is the Log: it recovers ρ for the end position', () => {
    const X = startPose(70);
    const e = expEnd(X, t);
    const back = twistTo(X, [e.x, e.y], t.theta);
    expect(back.rho1).toBeCloseTo(t.rho1, 12);
    expect(back.rho2).toBeCloseTo(t.rho2, 12);
  });
  it('naive sum adds the three numbers; straight motion from heading 0 agrees with Exp', () => {
    expect(naiveSum(startPose(0), t)).toEqual({ x: 2, y: 0.5, theta: 1.1 });
    const s = { rho1: 2, rho2: 0, theta: 0 };
    expect(poseDistance(expEnd(startPose(0), s), naiveSum(startPose(0), s))).toBe(0);
    expect(arcRadius(s)).toBe(Infinity);
  });
});
