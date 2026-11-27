/**
 * The models behind Post 31's widgets.
 *
 * Bundle adjustment: four cameras on a circle look at ten points of a small house-shaped structure. Every point
 * is seen by every camera with 1-pixel noise. Starting from perturbed cameras and points, Levenberg–Marquardt
 * minimizes the reprojection error. The gauge (seven numbers: position, orientation and scale) is fixed by a
 * prior on the first camera's pose and on the second camera's position.
 */
import * as se3 from '../geometry/se3';
import { oplus } from '../geometry/lie';
import { pointPriorFactor, priorFactor, reprojectionFactor, type Factor } from '../graph/factors';
import { optimizeGraph } from '../graph/solver';
import { getPoint, getPose3, point3, pose3, values, type Values } from '../graph/values';
import { diag, fromArrays, identity, type Mat } from '../math/matrix';
import { createRng } from '../math/rng';
import { project, type Intrinsics } from '../models/pinhole';

export const BA = {
  K: { fx: 400, fy: 400, cx: 320, cy: 240 } satisfies Intrinsics,
  width: 640,
  height: 480,
  /** A house: the eight corners of a box and two ridge points, metres, z up. */
  points: [
    [-1, -0.8, 0],
    [1, -0.8, 0],
    [1, 0.8, 0],
    [-1, 0.8, 0],
    [-1, -0.8, 1],
    [1, -0.8, 1],
    [1, 0.8, 1],
    [-1, 0.8, 1],
    [-0.6, 0, 1.6],
    [0.6, 0, 1.6],
  ] as [number, number, number][],
  /** Cameras on a circle of radius 5 at height 1.5, at these angles (degrees), looking at (0, 0, 0.7). */
  cameraAngles: [-80, -20, 40, 120],
  target: [0, 0, 0.7] as [number, number, number],
  pixelSigma: 1,
  initialError: { position: 0.3, rotationDeg: 3, point: 0.3 },
  seed: 31,
} as const;

/** Camera-to-world pose of a camera at `pos` looking at `target`: z forward, x right, y down. */
export function lookAt(pos: readonly number[], target: readonly number[]): se3.Pose3 {
  const f = [target[0]! - pos[0]!, target[1]! - pos[1]!, target[2]! - pos[2]!];
  const nf = Math.hypot(...f);
  const z = f.map((v) => v / nf);
  const r = [z[1]! * 1 - z[2]! * 0, z[2]! * 0 - z[0]! * 1, 0]; // z × (0, 0, 1)
  const nr = Math.hypot(...r);
  const x = r.map((v) => v / nr);
  const y = [z[1]! * x[2]! - z[2]! * x[1]!, z[2]! * x[0]! - z[0]! * x[2]!, z[0]! * x[1]! - z[1]! * x[0]!];
  const C = fromArrays([
    [x[0]!, y[0]!, z[0]!],
    [x[1]!, y[1]!, z[1]!],
    [x[2]!, y[2]!, z[2]!],
  ]);
  return { C, t: Float64Array.from(pos) };
}

export function trueCameras(): se3.Pose3[] {
  return BA.cameraAngles.map((a) => {
    const r = (a * Math.PI) / 180;
    return lookAt([5 * Math.cos(r), 5 * Math.sin(r), 1.5], BA.target);
  });
}

export interface Observation {
  cam: number;
  point: number;
  z: Float64Array;
}

export interface BaProblem {
  factors: Factor[];
  initial: Values;
  observations: Observation[];
}

const ck = (i: number) => `c${i}`;
const pk = (j: number) => `p${j}`;

export function baProblem(seed: number = BA.seed): BaProblem {
  const rng = createRng(seed);
  const cams = trueCameras();
  const observations: Observation[] = [];
  cams.forEach((T, i) =>
    BA.points.forEach((p, j) => {
      const uv = project(BA.K, T, p);
      const [a, b] = [rng.normal(), rng.normal()];
      observations.push({
        cam: i,
        point: j,
        z: Float64Array.of(uv[0]! + BA.pixelSigma * a, uv[1]! + BA.pixelSigma * b),
      });
    }),
  );
  const info = diag([1 / BA.pixelSigma ** 2, 1 / BA.pixelSigma ** 2]);
  const factors: Factor[] = observations.map((o) => reprojectionFactor(ck(o.cam), pk(o.point), o.z, BA.K, info));
  // Gauge: the first camera's pose and the second camera's position are given.
  factors.push(priorFactor(se3.SE3, ck(0), cams[0]!, diag([1e8, 1e8, 1e8, 1e8, 1e8, 1e8])));
  factors.push({
    ...pointPriorFactor(ck(1) + '#t', cams[1]!.t, identity(3)),
    keys: [ck(1)],
    type: 'position-prior',
    information: diag([1e8, 1e8, 1e8]),
    residual: (v) => getPose3(v, ck(1)).t.map((x, i) => x - cams[1]!.t[i]!),
    linearize: (v) => {
      const T = getPose3(v, ck(1));
      // Right perturbation moves the position by C ρ: ∂t/∂δ = [C, 0].
      const J: Mat = { rows: 3, cols: 6, data: new Float64Array(18) };
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) J.data[r * 6 + c] = T.C.data[r * 3 + c]!;
      return { r: T.t.map((x, i) => x - cams[1]!.t[i]!), J: [J] };
    },
  });
  const e = BA.initialError;
  const initial = values([
    ...cams.map((T, i) => {
      if (i === 0) return [ck(i), pose3(T)] as const;
      const d = Float64Array.of(
        e.position * rng.normal(),
        e.position * rng.normal(),
        e.position * rng.normal(),
        ((e.rotationDeg * Math.PI) / 180) * rng.normal(),
        ((e.rotationDeg * Math.PI) / 180) * rng.normal(),
        ((e.rotationDeg * Math.PI) / 180) * rng.normal(),
      );
      return [ck(i), pose3(oplus(se3.SE3, T, d))] as const;
    }),
    ...BA.points.map(
      (p, j) =>
        [
          pk(j),
          point3(p[0] + e.point * rng.normal(), p[1] + e.point * rng.normal(), p[2] + e.point * rng.normal()),
        ] as const,
    ),
  ]);
  return { factors, initial, observations };
}

export interface BaIterate {
  cameras: se3.Pose3[];
  points: Float64Array[];
  cost: number;
  /** RMS reprojection error over all observations (pixels). */
  rmsPixels: number;
  /** RMS 3D error of the points against the truth (m). */
  rmsPoints: number;
}

export function reprojections(v: Values, obs: readonly Observation[]): Float64Array[] {
  return obs.map((o) => project(BA.K, getPose3(v, ck(o.cam)), getPoint(v, pk(o.point))));
}

function summarize(v: Values, obs: readonly Observation[], cost: number): BaIterate {
  const pr = reprojections(v, obs);
  let s = 0;
  pr.forEach((uv, i) => (s += (uv[0]! - obs[i]!.z[0]!) ** 2 + (uv[1]! - obs[i]!.z[1]!) ** 2));
  const points = BA.points.map((_, j) => Float64Array.from(getPoint(v, pk(j))));
  let e = 0;
  points.forEach(
    (p, j) =>
      (e += (p[0]! - BA.points[j]![0]) ** 2 + (p[1]! - BA.points[j]![1]) ** 2 + (p[2]! - BA.points[j]![2]) ** 2),
  );
  return {
    cameras: BA.cameraAngles.map((_, i) => getPose3(v, ck(i))),
    points,
    cost,
    rmsPixels: Math.sqrt(s / obs.length),
    rmsPoints: Math.sqrt(e / points.length),
  };
}

export function runBundle(seed: number = BA.seed): { problem: BaProblem; iterations: BaIterate[]; values: Values[] } {
  const problem = baProblem(seed);
  const its = optimizeGraph(problem.factors, problem.initial, {
    method: 'lm',
    maxIterations: 30,
    costTolerance: 1e-10,
  });
  return {
    problem,
    iterations: its.map((it) => summarize(it.values, problem.observations, it.cost)),
    values: its.map((it) => it.values),
  };
}

/** Unknowns and the size of the reduced camera system after eliminating the points (Schur complement). */
export const sizes = () => ({
  unknowns: 6 * BA.cameraAngles.length + 3 * BA.points.length,
  reduced: 6 * BA.cameraAngles.length,
  observations: BA.cameraAngles.length * BA.points.length,
});
