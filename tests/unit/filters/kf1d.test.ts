import { describe, expect, it } from 'vitest';
import { batchMap1, predict1, run1, steadyState1, update1 } from '../../../src/lib/filters/kf1d';
import { condition, product1 } from '../../../src/lib/math/gaussian';
import { fromArrays, vec } from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';
import { gaussianKernel, normalize, predict, update } from '../../../src/lib/filters/histogram';

const rng = createRng(1111);
const Q = 0.04;
const R = 0.25;
const N = 30;
const us = Array.from({ length: N }, () => 1);
const zs: (number | null)[] = [];
{
  let x = 0.3;
  for (let k = 0; k < N; k++) {
    x += 1 + Math.sqrt(Q) * rng.normal();
    zs.push(k >= 10 && k < 15 ? null : x + Math.sqrt(R) * rng.normal());
  }
}
const init = { x: 0, P: 1 };

describe('scalar Kalman filter (post 11 invariants)', () => {
  it('prediction adds the move to the mean and Q to the variance', () => {
    expect(predict1({ x: 2, P: 0.5 }, 1, 0.1)).toEqual({ x: 3, P: 0.6 });
    expect(() => predict1(init, 0, -1)).toThrow();
  });

  it('the update is the normalized product of the prediction and the likelihood N(z, R)', () => {
    for (const [x, P, z, r] of [
      [0, 1, 2, 0.5],
      [12, 0.25, 12.8, 0.09],
      [-3, 4, 1, 4],
    ] as const) {
      const u = update1({ x, P }, z, r);
      const p = product1(x, P, z, r);
      expect(u.state.x).toBeCloseTo(p.mean, 13);
      expect(u.state.P).toBeCloseTo(p.variance, 13);
      expect(u.K).toBeCloseTo(P / (P + r), 15);
      expect(u.state.P).toBeCloseTo((1 - u.K) * P, 13); // Joseph form = short form at the optimal gain
      expect(u.state.P).toBeLessThan(Math.min(P, r));
    }
    expect(() => update1(init, 0, 0)).toThrow();
  });

  it('the update equals conditioning the joint Gaussian of (x, z) on the reading (post 3)', () => {
    const P = 0.7;
    const r = 0.3;
    const joint = {
      mean: vec([1.5, 1.5]),
      cov: fromArrays([
        [P, P],
        [P, P + r],
      ]),
    }; // z = x + v
    const c = condition(joint, [1], vec([2.4]));
    const u = update1({ x: 1.5, P }, 2.4, r);
    expect(c.mean[0]).toBeCloseTo(u.state.x, 13);
    expect(c.cov.data[0]).toBeCloseTo(u.state.P, 13);
  });

  it('after every step the filter estimate equals the batch MAP estimate of the latest state (DESIGN §8.1)', () => {
    const steps = run1(init, us, zs, Q, R);
    for (const k of [1, 2, 5, 10, 12, 15, 22, N]) {
      const b = batchMap1(init, us.slice(0, k), zs.slice(0, k), Q, R);
      expect(steps[k - 1]!.post.x).toBeCloseTo(b.x[k]!, 10);
      expect(steps[k - 1]!.post.P).toBeCloseTo(b.P[k]!, 10);
    }
  });

  it('without a reading the belief is just the prediction; the variance grows by Q per step', () => {
    const steps = run1(init, us, zs, Q, R);
    for (let k = 11; k < 15; k++) {
      expect(steps[k]!.post).toEqual(steps[k]!.prior);
      expect(steps[k]!.post.P - steps[k - 1]!.post.P).toBeCloseTo(Q, 14);
      expect(steps[k]!.K).toBe(0);
    }
    expect(() => run1(init, [1], [], Q, R)).toThrow();
  });

  it('steady state: a fixed point of predict + update, reached from any start', () => {
    const ss = steadyState1(Q, R);
    const after = update1(predict1({ x: 0, P: ss.Ppost }, 0, Q), 0, R);
    expect(after.state.P).toBeCloseTo(ss.Ppost, 14);
    expect(after.K).toBeCloseTo(ss.K, 14);
    expect(ss.Ppred).toBeCloseTo(ss.Ppost + Q, 14);
    for (const P0 of [0.001, 1, 100]) {
      const st = run1({ x: 0, P: P0 }, new Array(60).fill(0), new Array(60).fill(0), Q, R);
      expect(st.at(-1)!.post.P).toBeCloseTo(ss.Ppost, 10);
      expect(st.at(-1)!.K).toBeCloseTo(ss.K, 10);
    }
    expect(steadyState1(0, R)).toEqual({ Ppred: 0, Ppost: 0, K: 0 });
    expect(() => steadyState1(Q, 0)).toThrow();
  });

  it('is the Bayes filter of post 10 for Gaussian beliefs: a fine histogram filter gives the same answer', () => {
    // Grid on [−5, 45] m with 1 cm cells; Gaussian moves and Gaussian likelihoods.
    const lo = -5;
    const h = 0.01;
    const n = 5000;
    const xs = Float64Array.from({ length: n }, (_, i) => lo + (i + 0.5) * h);
    let bel = normalize(Array.from(xs, (x) => Math.exp((-0.5 * (x - init.x) ** 2) / init.P))).belief;
    const kernel = gaussianKernel(1 / h, Math.sqrt(Q) / h);
    const steps = run1(init, us.slice(0, 12), zs.slice(0, 12), Q, R);
    for (let k = 0; k < 12; k++) {
      bel = predict(bel, kernel, { cyclic: false });
      const z = zs[k]!;
      if (z !== null)
        bel = update(
          bel,
          Array.from(xs, (x) => Math.exp((-0.5 * (x - z) ** 2) / R)),
        ).belief;
      let m = 0;
      for (let i = 0; i < n; i++) m += bel[i]! * xs[i]!;
      let v = 0;
      for (let i = 0; i < n; i++) v += bel[i]! * (xs[i]! - m) ** 2;
      expect(m).toBeCloseTo(steps[k]!.post.x, 3);
      expect(v).toBeCloseTo(steps[k]!.post.P, 3);
    }
  });
});
