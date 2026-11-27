/** The model behind PoseCompounding (Post 22). */
import { describe, expect, it } from 'vitest';
import {
  POSES,
  boxAround,
  cartesianPropagation,
  nominalPath,
  sampleFinalPoses,
  standardDraws,
  stepModel,
  tangentMarginalXY,
  tangentPropagation,
  tangentRegion95,
  coverage,
  headingSpreadDeg,
} from '../../../src/lib/demos/pose-compounding';
import { oplus } from '../../../src/lib/geometry/lie';
import * as se2 from '../../../src/lib/geometry/se2';
import { fromArrays, maxAbsDiff, mul, transpose } from '../../../src/lib/math/matrix';
import { createRng } from '../../../src/lib/math/rng';
import { sampleCov } from '../../../src/lib/math/stats';

const D = POSES.defaults;

describe('sampling', () => {
  it('the inlined sampler equals composing Δ̄ ⊕ w with the library', () => {
    const p = { ...D, turnDeg: 7, steps: 6 };
    const z = standardDraws(9, 20);
    const fast = sampleFinalPoses(p, z, 20);
    const { delta } = stepModel(p);
    for (let i = 0; i < 20; i++) {
      let T: se2.Pose2 = se2.identity;
      for (let k = 0; k < p.steps; k++) {
        const o = (i * POSES.maxSteps + k) * 3;
        const w = Float64Array.of(
          p.sigmaXY * z[o]!,
          p.sigmaXY * z[o + 1]!,
          ((p.sigmaThetaDeg * Math.PI) / 180) * z[o + 2]!,
        );
        T = se2.compose(T, oplus(se2.SE2, delta, w));
      }
      expect(Math.hypot(T.x - fast[i]!.x, T.y - fast[i]!.y)).toBeLessThan(1e-12);
      expect(Math.abs(se2.log(se2.between(T, fast[i]!))[2]!)).toBeLessThan(1e-12);
    }
  });
  it('nominal path ends at the propagated mean', () => {
    const p = { ...D, turnDeg: 12 };
    const end = nominalPath(p).at(-1)!;
    const m = tangentPropagation(p).mean;
    expect(Math.hypot(end.x - m.x, end.y - m.y, end.theta - m.theta)).toBeLessThan(1e-12);
  });
});

describe('propagation', () => {
  it('(2) matches the sample covariance of Log(T̄⁻¹ T) when the noise is small', () => {
    const p = { ...D, sigmaThetaDeg: 0.5, sigmaXY: 0.01, turnDeg: 15 };
    const poses = sampleFinalPoses(p, standardDraws(3));
    const tan = tangentPropagation(p);
    const { cov } = sampleCov(poses.map((T) => se2.log(se2.between(tan.mean, T))));
    for (let i = 0; i < 9; i++) expect(cov.data[i]!).toBeCloseTo(tan.P.data[i]!, 3);
    expect(maxAbsDiff(cov, tan.P) / Math.max(...tan.P.data)).toBeLessThan(0.08);
  });
  it('the Cartesian covariance equals J P Jᵀ exactly (same first-order information)', () => {
    for (const turnDeg of [0, 9, -17]) {
      const p = { ...D, turnDeg, steps: 13 };
      const tan = tangentPropagation(p);
      const cart = cartesianPropagation(p);
      const [c, s] = [Math.cos(tan.mean.theta), Math.sin(tan.mean.theta)];
      const J = fromArrays([
        [c, -s, 0],
        [s, c, 0],
        [0, 0, 1],
      ]);
      expect(maxAbsDiff(mul(mul(J, tan.P), transpose(J)), cart.P)).toBeLessThan(1e-12);
    }
  });
});

describe('the tangent model density', () => {
  it('integrates to 1 over the plane and matches a Monte Carlo histogram of the model itself', () => {
    const p = { ...D, sigmaThetaDeg: 6 };
    const tan = tangentPropagation(p);
    // Samples from the model (1): T̄ Exp(τ), τ ~ N(0, P).
    const rng = createRng(5);
    const L = (() => {
      const P = tan.P.data;
      const l00 = Math.sqrt(P[0]!);
      const l10 = P[3]! / l00;
      const l11 = Math.sqrt(P[4]! - l10 * l10);
      const l20 = P[6]! / l00;
      const l21 = (P[7]! - l20 * l10) / l11;
      const l22 = Math.sqrt(P[8]! - l20 * l20 - l21 * l21);
      return [l00, l10, l11, l20, l21, l22];
    })();
    const model: se2.Pose2[] = [];
    for (let i = 0; i < 20000; i++) {
      const [a, b, c] = [rng.normal(), rng.normal(), rng.normal()];
      const tau = Float64Array.of(L[0]! * a, L[1]! * a + L[2]! * b, L[3]! * a + L[4]! * b + L[5]! * c);
      model.push(oplus(se2.SE2, tan.mean, tau));
    }
    const reg = tangentRegion95(tan.mean, tan.P, boxAround(model), 80);
    expect(reg.gridMass).toBeGreaterThan(0.999);
    expect(reg.gridMass).toBeLessThan(1.001);
    // 95% of the model's own samples fall in its 95% region.
    const dens = tangentMarginalXY(tan.mean, tan.P, Float64Array.from(model.flatMap((t) => [t.x, t.y])));
    const frac = dens.filter((d) => d >= reg.level).length / model.length;
    expect(frac).toBeGreaterThan(0.94);
    expect(frac).toBeLessThan(0.96);
  });
  it('coverage of the defaults is reported in [0, 1] and the heading spread is √N σ_θ', () => {
    const poses = sampleFinalPoses(D, standardDraws());
    const tan = tangentPropagation(D);
    const c = coverage(poses, cartesianPropagation(D), tan, tangentRegion95(tan.mean, tan.P, boxAround(poses)).level);
    for (const v of Object.values(c)) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(headingSpreadDeg(tan.P)).toBeCloseTo(Math.sqrt(D.steps) * D.sigmaThetaDeg, 12);
  });
});
