/**
 * Pure model behind the CostLandscape widget (post 09): UWB indoor positioning by trilateration.
 * A tag in a 10 m × 8 m room measures its range to fixed anchors (UWB, ≈10 cm noise) and solves
 * for its position with Gauss–Newton or Levenberg–Marquardt.
 */
import { cost, gaussNewton, levenbergMarquardt, type Iterate, type LsqProblem } from '../graph/solver';
import { contourSegments, sampleField, type Segment } from '../math/contour';
import { vec } from '../math/matrix';
import { createRng } from '../math/rng';
import { rangeProblem } from '../models/ranging';

export type LandscapePreset = 'corners' | 'wall' | 'wall-diverge';

export const ROOM = { w: 10, h: 8 };
export const TAG = [6.5, 3] as [number, number];

export const LANDSCAPE = {
  sigma: 0.1,
  seed: 9,
  maxIterations: 15,
  xDomain: [-6, 16] as [number, number],
  yDomain: [-6, 12] as [number, number],
  /** Initial LM damping as log10 λ₀. */
  logLambda: { min: -4, max: 2, step: 0.5, default: -2 },
  costLevels: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4, 2e4, 5e4],
};

export interface PresetSpec {
  label: string;
  anchors: [number, number][];
  start: [number, number];
}

export const PRESETS: Record<LandscapePreset, PresetSpec> = {
  corners: {
    label: 'Four anchors in the corners',
    anchors: [
      [0, 0],
      [10, 0],
      [10, 8],
      [0, 8],
    ],
    start: [1.5, 6.5],
  },
  wall: {
    label: 'Three anchors on the south wall',
    anchors: [
      [1, 0],
      [5, 0],
      [9, 0],
    ],
    start: [3, -2],
  },
  'wall-diverge': {
    label: 'Wall anchors, start in line with them',
    anchors: [
      [1, 0],
      [5, 0],
      [9, 0],
    ],
    start: [-4, -0.5],
  },
};

/** UWB ranges from the tag to each anchor, with seeded noise. */
export function ranges(anchors: readonly [number, number][]): number[] {
  const rng = createRng(LANDSCAPE.seed);
  return anchors.map(([ax, ay]) => Math.hypot(TAG[0] - ax, TAG[1] - ay) + LANDSCAPE.sigma * rng.normal());
}

export function problemFor(preset: LandscapePreset): LsqProblem {
  const a = PRESETS[preset].anchors;
  return rangeProblem(a, ranges(a), LANDSCAPE.sigma);
}

export interface Runs {
  gn: Iterate[];
  lm: Iterate[];
}

export function runBoth(preset: LandscapePreset, start: [number, number], logLambda: number): Runs {
  const p = problemFor(preset);
  return {
    gn: gaussNewton(p, vec(start), { maxIterations: LANDSCAPE.maxIterations }),
    lm: levenbergMarquardt(p, vec(start), { maxIterations: LANDSCAPE.maxIterations, lambda0: 10 ** logLambda }),
  };
}

/** The best (lowest-cost) solution reachable, found by LM from many starts. */
export function bestSolution(preset: LandscapePreset): Iterate {
  const p = problemFor(preset);
  let best: Iterate | null = null;
  for (const s of [TAG, [2, 6], [8, 6], [5, -3], [5, 9]] as [number, number][]) {
    const it = levenbergMarquardt(p, vec(s), { maxIterations: 60 }).at(-1)!;
    if (!best || it.cost < best.cost - 1e-12) best = it;
  }
  return best!;
}

export interface Landscape {
  /** log10 cost on an nx × ny grid, row 0 at the top (for Heatmap). */
  heat: Float64Array;
  nx: number;
  ny: number;
  contours: { level: number; segments: Segment[] }[];
}

export function landscape(preset: LandscapePreset, nx = 110, ny = 90): Landscape {
  const p = problemFor(preset);
  const [x0, x1] = LANDSCAPE.xDomain;
  const [y0, y1] = LANDSCAPE.yDomain;
  const f = (x: number, y: number) => Math.log10(Math.max(cost(p, vec([x, y])), 1e-3));
  const field = sampleField(f, nx, ny, x0, x1, y0, y1);
  const heat = new Float64Array(nx * ny);
  let min = Infinity;
  let max = -Infinity;
  for (const v of field.values) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) heat[j * nx + i] = (max - field.values[(ny - 1 - j) * nx + i]!) / (max - min);
  return {
    heat,
    nx,
    ny,
    contours: LANDSCAPE.costLevels.map((c) => ({ level: c, segments: contourSegments(field, Math.log10(c)) })),
  };
}

/** Accepted iterates only (LM's rejected trials do not move the estimate). */
export function path(its: readonly Iterate[]): Iterate[] {
  return its.filter((it, k) => k === 0 || it.accepted);
}

/** Number of iterations until the iterate is within `tol` metres of `target` and stays there. */
export function iterationsTo(its: readonly Iterate[], target: Float64Array, tol = 0.01): number | null {
  for (let k = 0; k < its.length; k++) {
    if (its.slice(k).every((it) => Math.hypot(it.x[0]! - target[0]!, it.x[1]! - target[1]!) < tol)) return k;
  }
  return null;
}
