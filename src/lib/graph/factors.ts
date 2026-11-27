/**
 * Factors of a factor graph (DESIGN §5.1, Posts 26–32). A factor φᵢ connects a few variables and has a
 * residual rᵢ(X) with information matrix Ωᵢ; its cost is ½ rᵢᵀ Ωᵢ rᵢ. Jacobians are taken with respect to
 * right perturbations of each variable (X ⊕ δ), as in Post 21, so they are exactly the blocks the solver needs.
 */
import * as se2 from '../geometry/se2';
import * as se3 from '../geometry/se3';
import { ominus, type LieGroup } from '../geometry/lie';
import { wrapAngle } from '../geometry/so2';
import { fromArrays, mul, scale, type Mat, type Vec } from '../math/matrix';
import { getPoint, getPose2, getPose3, type Key, type Values } from './values';
import { rangeBearing, rangeBearingJacobians } from '../models/range-bearing';

export interface Factor {
  /** Short type name, for drawing and I/O. */
  type: string;
  keys: Key[];
  /** Residual dimension. */
  dim: number;
  information: Mat;
  residual(v: Values): Vec;
  /** Residual and one Jacobian per key (dim × dof of that variable). */
  linearize(v: Values): { r: Vec; J: Mat[] };
}

/** ½ rᵀ Ω r of one factor. */
export function factorCost(f: Factor, v: Values): number {
  const r = f.residual(v);
  let c = 0;
  for (let i = 0; i < f.dim; i++)
    for (let j = 0; j < f.dim; j++) c += r[i]! * f.information.data[i * f.dim + j]! * r[j]!;
  return 0.5 * c;
}

// ---------------------------------------------------------------- poses (any group)

function getGroupValue<G>(v: Values, k: Key, group: LieGroup<G>): G {
  return (group.name === 'SE(2)' ? getPose2(v, k) : getPose3(v, k)) as G;
}

/** Prior on a pose: r = Log(Z⁻¹ X), ∂r/∂X = J_r⁻¹(r). */
export function priorFactor<G>(group: LieGroup<G>, key: Key, prior: G, information: Mat): Factor {
  return {
    type: 'prior',
    keys: [key],
    dim: group.dof,
    information,
    residual: (v) => ominus(group, getGroupValue(v, key, group), prior),
    linearize(v) {
      const r = ominus(group, getGroupValue(v, key, group), prior);
      return { r, J: [group.jrInv(r)] };
    },
  };
}

/**
 * Relative-pose (odometry or loop-closure) factor between poses i and j with measurement Z of Xᵢ⁻¹ Xⱼ:
 * r = Log(Z⁻¹ Xᵢ⁻¹ Xⱼ). With E = Z⁻¹ Xᵢ⁻¹ Xⱼ: ∂r/∂Xⱼ = J_r⁻¹(r) and ∂r/∂Xᵢ = −J_r⁻¹(r) Ad_{Xⱼ⁻¹ Xᵢ}.
 */
export function betweenFactor<G>(
  group: LieGroup<G>,
  ki: Key,
  kj: Key,
  Z: G,
  information: Mat,
  type = 'between',
): Factor {
  const res = (v: Values) => {
    const Xi = getGroupValue(v, ki, group);
    const Xj = getGroupValue(v, kj, group);
    return group.log(group.compose(group.inverse(Z), group.compose(group.inverse(Xi), Xj)));
  };
  return {
    type,
    keys: [ki, kj],
    dim: group.dof,
    information,
    residual: res,
    linearize(v) {
      const Xi = getGroupValue(v, ki, group);
      const Xj = getGroupValue(v, kj, group);
      const r = res(v);
      const Jinv = group.jrInv(r);
      return { r, J: [scale(mul(Jinv, group.adjoint(group.compose(group.inverse(Xj), Xi))), -1), Jinv] };
    },
  };
}

export const priorFactorSE2 = (k: Key, p: se2.Pose2, info: Mat) => priorFactor(se2.SE2, k, p, info);
export const betweenFactorSE2 = (ki: Key, kj: Key, z: se2.Pose2, info: Mat, type?: string) =>
  betweenFactor(se2.SE2, ki, kj, z, info, type);
export const betweenFactorSE3 = (ki: Key, kj: Key, z: se3.Pose3, info: Mat, type?: string) =>
  betweenFactor(se3.SE3, ki, kj, z, info, type);

// ---------------------------------------------------------------- points

/** Prior on a point: r = p − p₀. */
export function pointPriorFactor(key: Key, p0: Vec, information: Mat): Factor {
  const d = p0.length;
  const I = fromArrays(Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j ? 1 : 0))));
  return {
    type: 'point-prior',
    keys: [key],
    dim: d,
    information,
    residual: (v) => getPoint(v, key).map((x, i) => x - p0[i]!),
    linearize: (v) => ({ r: getPoint(v, key).map((x, i) => x - p0[i]!), J: [I] }),
  };
}

/**
 * Range–bearing reading z = (r, φ) of landmark l (a 2D point) from pose x (SE(2)): r = h(x, l) ⊟ z.
 * The model's Jacobian is with respect to (x, y, θ); a right perturbation δ moves (x, y) by C(θ) δ_ρ and θ by
 * δ_θ, so ∂r/∂δ = H_x diag(C(θ), 1).
 */
export function rangeBearingFactor(kx: Key, kl: Key, z: Vec, information: Mat): Factor {
  const res = (v: Values) => {
    const p = getPose2(v, kx);
    const h = rangeBearing(Float64Array.of(p.x, p.y, p.theta), getPoint(v, kl));
    return Float64Array.of(h[0]! - z[0]!, wrapAngle(h[1]! - z[1]!));
  };
  return {
    type: 'range-bearing',
    keys: [kx, kl],
    dim: 2,
    information,
    residual: res,
    linearize(v) {
      const p = getPose2(v, kx);
      const { Hx, Hm } = rangeBearingJacobians(Float64Array.of(p.x, p.y, p.theta), getPoint(v, kl));
      const [c, s] = [Math.cos(p.theta), Math.sin(p.theta)];
      const R = fromArrays([
        [c, -s, 0],
        [s, c, 0],
        [0, 0, 1],
      ]);
      return { r: res(v), J: [mul(Hx, R), Hm] };
    },
  };
}
