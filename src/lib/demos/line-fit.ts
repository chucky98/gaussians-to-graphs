/**
 * Pure model behind the LineFit widget (post 05): recovering a straight road from a phone's GPS fixes.
 * Coordinates are metres in a local east (x) / north (y) frame.
 */
import { fitLine, fitLineLAD, type Line } from '../math/leastsquares';
import { createRng } from '../math/rng';

export type Preset = 'clean' | 'multipath';

export const ROAD: Line = { intercept: 20, slope: 0.15 };

export const LINEFIT_DEFAULTS = {
  preset: 'clean' as Preset,
  seed: 11,
  n: 10,
  /** Typical horizontal accuracy (1σ) a phone reports outdoors, metres. */
  sigma: 3,
  /** Index and size of the multipath jump in the "multipath" preset. */
  outlierIndex: 6,
  outlierJump: 22,
};

export const LINEFIT_LIMITS = {
  xDomain: [0, 100] as [number, number],
  yDomain: [0, 60] as [number, number],
  sigma: { min: 1, max: 20, step: 0.5 },
};

export interface Fix {
  x: number;
  y: number;
  /** Reported accuracy (1σ), metres. */
  sigma: number;
}

/** Ten fixes, one every 10 m along the road, with seeded Gaussian error of 3 m. */
export function initialFixes(preset: Preset): Fix[] {
  const { seed, n, sigma, outlierIndex, outlierJump } = LINEFIT_DEFAULTS;
  const rng = createRng(seed);
  const fixes = Array.from({ length: n }, (_, i) => {
    const x = 5 + 10 * i;
    return { x, y: ROAD.intercept + ROAD.slope * x + sigma * rng.normal(), sigma };
  });
  if (preset === 'multipath') fixes[outlierIndex]!.y += outlierJump;
  return fixes;
}

/** Relative weight of a fix: (σ₀/σᵢ)², so the default accuracy has weight 1 and the cost stays in m². */
export function weightOf(f: Fix): number {
  return (LINEFIT_DEFAULTS.sigma / f.sigma) ** 2;
}

export interface FitSummary {
  ls: Line & { cost: number; residuals: Float64Array };
  lad: Line & { cost: number };
  weights: number[];
}

export function fitAll(fixes: readonly Fix[]): FitSummary {
  const xs = fixes.map((f) => f.x);
  const ys = fixes.map((f) => f.y);
  const weights = fixes.map(weightOf);
  return { ls: fitLine(xs, ys, weights), lad: fitLineLAD(xs, ys, weights), weights };
}

export function lineAt(l: Line, x: number): number {
  return l.intercept + l.slope * x;
}

export interface Square {
  x: number;
  y: number;
  side: number;
}

/**
 * The square drawn for fix i: its area is that fix's contribution wᵢ rᵢ² to the cost. It hangs from
 * the fix towards the line, on the side of the fix with more room in the plot.
 */
export function residualSquare(f: Fix, r: number, w: number): Square {
  const side = Math.abs(r) * Math.sqrt(w);
  const [x0, x1] = LINEFIT_LIMITS.xDomain;
  const left = f.x + side > x1 && f.x - side >= x0;
  const yLow = r > 0 ? f.y - side : f.y; // r = y − ŷ > 0: the fix is above the line, so the square hangs down
  return { x: left ? f.x - side : f.x, y: yLow, side };
}

export function clampFix(f: Fix): Fix {
  const [x0, x1] = LINEFIT_LIMITS.xDomain;
  const [y0, y1] = LINEFIT_LIMITS.yDomain;
  return { ...f, x: Math.min(x1 - 1, Math.max(x0 + 1, f.x)), y: Math.min(y1 - 1, Math.max(y0 + 1, f.y)) };
}

/** Perpendicular distance from the fitted line to the true road at a given x (metres). */
export function offsetFromRoad(l: Line, x: number): number {
  return (lineAt(l, x) - lineAt(ROAD, x)) / Math.sqrt(1 + ROAD.slope ** 2);
}
