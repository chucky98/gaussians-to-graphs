import { describe, expect, it } from 'vitest';
import { act, between, compose, identity, inverse, pose, type Pose2 } from '../../../src/lib/geometry/se2';
import { angleDiff, rotate, wrapAngle } from '../../../src/lib/geometry/so2';
import { createRng } from '../../../src/lib/math/rng';

const rng = createRng(77);
const randPose = (): Pose2 =>
  pose(rng.uniformRange(-5, 5), rng.uniformRange(-5, 5), rng.uniformRange(-Math.PI, Math.PI));
function expectPoseClose(a: Pose2, b: Pose2, tol = 1e-12) {
  expect(Math.abs(a.x - b.x)).toBeLessThan(tol);
  expect(Math.abs(a.y - b.y)).toBeLessThan(tol);
  expect(Math.abs(angleDiff(a.theta, b.theta))).toBeLessThan(tol);
}

describe('so2', () => {
  it('wrapAngle maps into (−π, π]', () => {
    expect(wrapAngle(Math.PI)).toBe(Math.PI);
    expect(wrapAngle(-Math.PI)).toBe(Math.PI);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(0.5 + 4 * Math.PI)).toBeCloseTo(0.5, 12);
    expect(wrapAngle(-0.5 - 6 * Math.PI)).toBeCloseTo(-0.5, 12);
    for (let i = 0; i < 1000; i++) {
      const a = rng.uniformRange(-50, 50);
      const w = wrapAngle(a);
      expect(w).toBeGreaterThan(-Math.PI);
      expect(w).toBeLessThanOrEqual(Math.PI);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a), 10);
      expect(Math.sin(w)).toBeCloseTo(Math.sin(a), 10);
    }
  });
  it('angleDiff takes the short way round', () => {
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(-0.2, 12);
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(0.2, 12);
  });
  it('rotate', () => {
    const [x, y] = rotate(Math.PI / 2, 1, 0);
    expect(x).toBeCloseTo(0, 15);
    expect(y).toBeCloseTo(1, 15);
  });
});

describe('se2 (DESIGN §8.1 geometry invariants, Phase 1 subset)', () => {
  it('compose is associative', () => {
    for (let i = 0; i < 200; i++) {
      const [a, b, c] = [randPose(), randPose(), randPose()];
      expectPoseClose(compose(compose(a, b), c), compose(a, compose(b, c)), 1e-11);
    }
  });
  it('T ∘ T⁻¹ = T⁻¹ ∘ T = identity, and identity is neutral', () => {
    for (let i = 0; i < 200; i++) {
      const t = randPose();
      expectPoseClose(compose(t, inverse(t)), identity);
      expectPoseClose(compose(inverse(t), t), identity);
      expectPoseClose(compose(t, identity), t);
      expectPoseClose(compose(identity, t), t);
    }
  });
  it('act agrees with composing a point-pose, and inverse undoes act', () => {
    for (let i = 0; i < 200; i++) {
      const t = randPose();
      const p: [number, number] = [rng.normal(), rng.normal()];
      const q = act(t, p);
      const viaCompose = compose(t, pose(p[0], p[1], 0));
      expect(q[0]).toBeCloseTo(viaCompose.x, 12);
      expect(q[1]).toBeCloseTo(viaCompose.y, 12);
      const back = act(inverse(t), q);
      expect(back[0]).toBeCloseTo(p[0], 11);
      expect(back[1]).toBeCloseTo(p[1], 11);
    }
  });
  it('between(a, b) satisfies a ∘ between(a, b) = b', () => {
    for (let i = 0; i < 200; i++) {
      const [a, b] = [randPose(), randPose()];
      expectPoseClose(compose(a, between(a, b)), b, 1e-11);
    }
  });
  it('a hand-computed case: drive 1 m forward facing +y', () => {
    const p = compose(pose(2, 3, Math.PI / 2), pose(1, 0, 0.3));
    expect(p.x).toBeCloseTo(2, 15);
    expect(p.y).toBeCloseTo(4, 15);
    expect(p.theta).toBeCloseTo(Math.PI / 2 + 0.3, 15);
  });
});
