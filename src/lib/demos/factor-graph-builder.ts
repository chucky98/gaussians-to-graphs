/**
 * The model behind Post 26's FactorGraphBuilder widget: a small planar SLAM problem (five poses, three
 * landmarks) whose factors (a prior, odometry, landmark readings) can be switched on and off. For any set of
 * factors it reports the stacked Jacobian J, the information matrix Λ = Jᵀ Ω J, how many directions are left
 * unconstrained (near-zero eigenvalues of Λ), and the Gauss–Newton solution.
 */
import { oplus } from '../geometry/lie';
import * as se2 from '../geometry/se2';
import { betweenFactorSE2, priorFactorSE2, rangeBearingFactor, type Factor } from '../graph/factors';
import { graphCost, optimizeGraph, type GraphIterate } from '../graph/solver';
import { getPoint, getPose2, ordering, point2, pose2, values, type Values } from '../graph/values';
import { diag, eigSym, type Mat } from '../math/matrix';
import { createRng } from '../math/rng';
import { rangeBearing } from '../models/range-bearing';
import { wrapAngle } from '../geometry/so2';

const DEG = Math.PI / 180;

export const FGB = {
  poses: [
    [0, 0, 0],
    [1.5, 0.1, 10],
    [3, 0.4, 15],
    [4.5, 0.9, 25],
    [5.8, 1.7, 40],
  ] as [number, number, number][],
  landmarks: [
    [1.2, 2.2],
    [3.6, -1.6],
    [5, 3.6],
  ] as [number, number][],
  range: 3.2,
  sigma: { prior: 0.05, odomXY: 0.1, odomTheta: 2, range: 0.1, bearing: 3 },
  /** How far the initial guess is from the truth (std of a random offset per variable). */
  initialError: { xy: 0.4, theta: 8 },
  seed: 26,
} as const;

export type CandidateKind = 'prior' | 'odometry' | 'landmark';

export interface Candidate {
  id: string;
  kind: CandidateKind;
  label: string;
  factor: Factor;
}

export const truthPose = (i: number) => {
  const p = FGB.poses[i]!;
  return se2.pose(p[0], p[1], p[2] * DEG);
};

/** All candidate factors with their (seeded) measurements. */
export function candidates(seed: number = FGB.seed): Candidate[] {
  const rng = createRng(seed);
  const s = FGB.sigma;
  const out: Candidate[] = [
    {
      id: 'prior',
      kind: 'prior',
      label: 'prior on x0',
      factor: priorFactorSE2('x0', truthPose(0), diag([1 / s.prior ** 2, 1 / s.prior ** 2, 1 / (s.prior * 0.2) ** 2])),
    },
  ];
  const Qinv = diag([1 / s.odomXY ** 2, 1 / s.odomXY ** 2, 1 / (s.odomTheta * DEG) ** 2]);
  for (let i = 1; i < FGB.poses.length; i++) {
    const w = Float64Array.of(s.odomXY * rng.normal(), s.odomXY * rng.normal(), s.odomTheta * DEG * rng.normal());
    const z = oplus(se2.SE2, se2.between(truthPose(i - 1), truthPose(i)), w);
    out.push({
      id: `odo${i}`,
      kind: 'odometry',
      label: `odometry x${i - 1}–x${i}`,
      factor: betweenFactorSE2(`x${i - 1}`, `x${i}`, z, Qinv, 'odometry'),
    });
  }
  const Rinv = diag([1 / s.range ** 2, 1 / (s.bearing * DEG) ** 2]);
  FGB.poses.forEach((_, i) => {
    const T = truthPose(i);
    FGB.landmarks.forEach((m, j) => {
      const [a, b] = [rng.normal(), rng.normal()];
      const z0 = rangeBearing(Float64Array.of(T.x, T.y, T.theta), Float64Array.of(m[0], m[1]));
      if (z0[0]! > FGB.range) return;
      const z = Float64Array.of(z0[0]! + s.range * a, wrapAngle(z0[1]! + s.bearing * DEG * b));
      out.push({
        id: `x${i}l${j}`,
        kind: 'landmark',
        label: `l${j} seen from x${i}`,
        factor: rangeBearingFactor(`x${i}`, `l${j}`, z, Rinv),
      });
    });
  });
  return out;
}

export const variableKeys = (): string[] => [
  ...FGB.poses.map((_, i) => `x${i}`),
  ...FGB.landmarks.map((_, j) => `l${j}`),
];

/** The initial guess: every variable offset from the truth by a seeded random amount. */
export function initialGuess(seed: number = FGB.seed): Values {
  const rng = createRng(seed + 1000);
  const e = FGB.initialError;
  return values([
    ...FGB.poses.map((_, i) => {
      const T = truthPose(i);
      return [
        `x${i}`,
        pose2(se2.pose(T.x + e.xy * rng.normal(), T.y + e.xy * rng.normal(), T.theta + e.theta * DEG * rng.normal())),
      ] as const;
    }),
    ...FGB.landmarks.map((m, j) => [`l${j}`, point2(m[0] + e.xy * rng.normal(), m[1] + e.xy * rng.normal())] as const),
  ]);
}

export interface Structure {
  /** Rows (residual entries) and columns (unknowns). */
  rows: number;
  cols: number;
  /** Nonzero entries of J as (row, col), and of Λ. */
  jNonzeros: [number, number][];
  lambda: Mat;
  lambdaNonzeros: number;
  /** Row ranges of the factors and column ranges of the variables (for labels). */
  rowBlocks: { id: string; start: number; dim: number }[];
  colBlocks: { key: string; start: number; dim: number }[];
  /** Directions left unconstrained: eigenvalues of Λ below 1e-9 × the largest. */
  freeDirections: number;
}

/** Stacked Jacobian and Λ of the chosen factors, linearized at v. */
export function structure(factors: readonly Factor[], v: Values): Structure {
  const ord = ordering(v, variableKeys());
  const n = ord.dim;
  const jNonzeros: [number, number][] = [];
  const rowBlocks: Structure['rowBlocks'] = [];
  const L = new Float64Array(n * n);
  let row = 0;
  for (const f of factors) {
    const { J } = f.linearize(v);
    rowBlocks.push({ id: f.type + ':' + f.keys.join(','), start: row, dim: f.dim });
    const W = f.information.data;
    f.keys.forEach((k, a) => {
      const Ja = J[a]!;
      const oa = ord.offset[ord.index.get(k)!]!;
      for (let r = 0; r < f.dim; r++)
        for (let c = 0; c < Ja.cols; c++) if (Ja.data[r * Ja.cols + c] !== 0) jNonzeros.push([row + r, oa + c]);
      f.keys.forEach((k2, b) => {
        const Jb = J[b]!;
        const ob = ord.offset[ord.index.get(k2)!]!;
        for (let ra = 0; ra < Ja.cols; ra++)
          for (let cb = 0; cb < Jb.cols; cb++) {
            let s = 0;
            for (let i = 0; i < f.dim; i++)
              for (let j = 0; j < f.dim; j++)
                s += Ja.data[i * Ja.cols + ra]! * W[i * f.dim + j]! * Jb.data[j * Jb.cols + cb]!;
            L[(oa + ra) * n + ob + cb]! += s;
          }
      });
    });
    row += f.dim;
  }
  const lambda: Mat = { rows: n, cols: n, data: L };
  let nz = 0;
  for (const x of L) if (Math.abs(x) > 1e-12) nz++;
  const ev = eigSym(lambda).values;
  const top = Math.max(...ev);
  const freeDirections = top > 0 ? ev.filter((e) => e < 1e-9 * top).length : n;
  return {
    rows: row,
    cols: n,
    jNonzeros,
    lambda,
    lambdaNonzeros: nz,
    rowBlocks,
    colBlocks: ord.keys.map((key, i) => ({ key, start: ord.offset[i]!, dim: ord.dims[i]! })),
    freeDirections,
  };
}

export interface Solution {
  iterations: GraphIterate[];
  /** RMS position error of poses and landmarks, before and after. */
  errorBefore: number;
  errorAfter: number;
}

export function rmsError(v: Values): number {
  let s = 0;
  FGB.poses.forEach((_, i) => {
    const p = getPose2(v, `x${i}`);
    const t = truthPose(i);
    s += (p.x - t.x) ** 2 + (p.y - t.y) ** 2;
  });
  FGB.landmarks.forEach((m, j) => {
    const p = getPoint(v, `l${j}`);
    s += (p[0]! - m[0]) ** 2 + (p[1]! - m[1]) ** 2;
  });
  return Math.sqrt(s / (FGB.poses.length + FGB.landmarks.length));
}

/** Gauss–Newton from the initial guess; only call when no direction is free. */
export function solve(factors: readonly Factor[], v: Values): Solution {
  const iterations = optimizeGraph(factors, v, { method: 'gn', maxIterations: 10, costTolerance: 1e-12 });
  return { iterations, errorBefore: rmsError(v), errorAfter: rmsError(iterations.at(-1)!.values) };
}

export const cost = (factors: readonly Factor[], v: Values) => graphCost(factors, v);
