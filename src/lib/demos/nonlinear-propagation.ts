/** Pure model behind the NonlinearPropagation widget (post 04). */
import { cov2, mahalanobis2, type Gaussian } from '../math/gaussian';
import { fromArrays, vec } from '../math/matrix';
import { linearize, monteCarlo } from '../math/propagate';
import { createRng } from '../math/rng';
import { chi2Quantile, histogram } from '../math/stats';
import {
  linearMap,
  polarMean,
  polarToCartesian,
  sine,
  sineMoments,
  square,
  squareMoments,
  type VectorFunction,
} from '../models/nonlinear';

export type FnId = 'polar' | 'square' | 'sine' | 'linear';

export interface SliderDef {
  key: string;
  label: string;
  tex: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
}

export interface FnConfig {
  id: FnId;
  label: string;
  dim: 1 | 2;
  fn: VectorFunction;
  sliders: SliderDef[];
  /** Input plot domain (2D: [x-axis, y-axis]; 1D: x range and y range of the function plot). */
  inX: [number, number];
  inY: [number, number];
  outX: [number, number];
  outY: [number, number];
  inLabels: [string, string];
  outLabels: [string, string];
}

const DEG = Math.PI / 180;

export const FUNCTIONS: Record<FnId, FnConfig> = {
  polar: {
    id: 'polar',
    label: 'Polar to Cartesian: (r, θ) ↦ (r cos θ, r sin θ)',
    dim: 2,
    fn: polarToCartesian,
    sliders: [
      { key: 'muR', label: 'mean range', tex: '\\mu_r', min: 0.5, max: 2.5, step: 0.1, default: 2, unit: 'm' },
      {
        key: 'sigmaR',
        label: 'range standard deviation',
        tex: '\\sigma_r',
        min: 0.02,
        max: 0.6,
        step: 0.02,
        default: 0.1,
        unit: 'm',
      },
      { key: 'muT', label: 'mean bearing', tex: '\\mu_\\theta', min: 0, max: 180, step: 5, default: 90, unit: '°' },
      {
        key: 'sigmaT',
        label: 'bearing standard deviation',
        tex: '\\sigma_\\theta',
        min: 1,
        max: 60,
        step: 1,
        default: 25,
        unit: '°',
      },
    ],
    inX: [-80, 260],
    inY: [0, 3.5],
    outX: [-3.2, 3.2],
    outY: [-1.8, 3.4],
    inLabels: ['θ (deg)', 'r (m)'],
    outLabels: ['x (m)', 'y (m)'],
  },
  linear: {
    id: 'linear',
    label: 'Linear: rotate by 30° and stretch',
    dim: 2,
    fn: linearMap,
    sliders: [
      { key: 's1', label: 'standard deviation of x1', tex: '\\sigma_1', min: 0.1, max: 1.2, step: 0.05, default: 0.6 },
      { key: 's2', label: 'standard deviation of x2', tex: '\\sigma_2', min: 0.1, max: 1.2, step: 0.05, default: 0.4 },
    ],
    inX: [-3, 4],
    inY: [-3, 4],
    outX: [-3, 4],
    outY: [-3, 4],
    inLabels: ['x₁', 'x₂'],
    outLabels: ['y₁', 'y₂'],
  },
  square: {
    id: 'square',
    label: 'Square: x ↦ x²',
    dim: 1,
    fn: square,
    sliders: [
      { key: 'mu', label: 'mean', tex: '\\mu', min: -2, max: 2, step: 0.05, default: 0.5 },
      { key: 'sigma', label: 'standard deviation', tex: '\\sigma', min: 0.05, max: 1.2, step: 0.05, default: 0.5 },
    ],
    inX: [-3, 3],
    inY: [-1, 6],
    outX: [-1, 6],
    outY: [0, 2.5],
    inLabels: ['x', 'f(x)'],
    outLabels: ['y = x²', 'density'],
  },
  sine: {
    id: 'sine',
    label: 'Sine: x ↦ sin x',
    dim: 1,
    fn: sine,
    sliders: [
      { key: 'mu', label: 'mean', tex: '\\mu', min: -3, max: 3, step: 0.05, default: 0.5 },
      { key: 'sigma', label: 'standard deviation', tex: '\\sigma', min: 0.05, max: 2, step: 0.05, default: 0.5 },
    ],
    inX: [-4, 4],
    inY: [-1.5, 1.5],
    outX: [-1.5, 1.5],
    outY: [0, 4],
    inLabels: ['x', 'f(x)'],
    outLabels: ['y = sin x', 'density'],
  },
};

export const FN_ORDER: FnId[] = ['polar', 'square', 'sine', 'linear'];
export const PROP_DEFAULTS = { fn: 'polar' as FnId, n: 2000, seed: 4 };
export const SAMPLE_COUNTS = [500, 2000, 5000] as const;
export const LINEAR_MEAN: [number, number] = [1, 0.5];

export type Params = Record<string, number>;

export function defaultParams(id: FnId): Params {
  return Object.fromEntries(FUNCTIONS[id].sliders.map((s) => [s.key, s.default]));
}

/** The input Gaussian for a function and its slider values (angles converted to radians). */
export function inputGaussian(id: FnId, p: Params): Gaussian {
  switch (id) {
    case 'polar':
      return {
        mean: vec([p.muR!, p.muT! * DEG]),
        cov: fromArrays([
          [p.sigmaR! ** 2, 0],
          [0, (p.sigmaT! * DEG) ** 2],
        ]),
      };
    case 'linear':
      return { mean: vec(LINEAR_MEAN), cov: cov2(p.s1!, p.s2!, 0) };
    default:
      return { mean: vec([p.mu!]), cov: fromArrays([[p.sigma! ** 2]]) };
  }
}

export function standardDraws(seed: number, n: number, dim: number): Float64Array {
  const rng = createRng(seed);
  return Float64Array.from({ length: n * dim }, () => rng.normal());
}

export interface PropResult {
  input: Gaussian;
  /** Interleaved input samples (2D: x-axis then y-axis of the input plot; polar uses θ in degrees). */
  inPts: Float64Array;
  /** Interleaved output samples (2D) or output values (1D). */
  outPts: Float64Array;
  mc: Gaussian;
  lin: Gaussian;
  /** Exact output mean when known in closed form. */
  exactMean: number[];
  exactVar: number | null;
  /** Fraction of output samples inside the linearized 95% region. */
  insideLin: number;
  /** Fraction of output samples inside the 95% region of the Gaussian fitted to them. */
  insideMc: number;
}

/** Fraction of 1D values within mean ± 1.96 sd (2D: d_M² ≤ χ²₂(0.95)); 0 if the region is degenerate. */
function fractionInside(g: Gaussian, outs: Float64Array, dim: number): number {
  const n = outs.length / dim;
  let k = 0;
  if (dim === 1) {
    const sd = Math.sqrt(Math.max(0, g.cov.data[0]!));
    if (sd === 0) return 0;
    for (let i = 0; i < n; i++) if (Math.abs(outs[i]! - g.mean[0]!) <= 1.959963984540054 * sd) k++;
  } else {
    const det = g.cov.data[0]! * g.cov.data[3]! - g.cov.data[1]! * g.cov.data[2]!;
    if (!(det > 1e-14)) return 0;
    const c = chi2Quantile(0.95, 2);
    for (let i = 0; i < n; i++) if (mahalanobis2(g, vec([outs[2 * i]!, outs[2 * i + 1]!])) <= c) k++;
  }
  return k / n;
}

export function propagate(id: FnId, p: Params, z: Float64Array): PropResult {
  const cfg = FUNCTIONS[id];
  const input = inputGaussian(id, p);
  const { inputs, outputs, fit } = monteCarlo(input, cfg.fn, z);
  const lin = linearize(input, cfg.fn);
  const dim = cfg.dim;
  const inPts = new Float64Array(inputs.length * 2);
  const outPts = new Float64Array(outputs.length * dim);
  inputs.forEach((x, i) => {
    if (id === 'polar') {
      inPts[2 * i] = x[1]! / DEG;
      inPts[2 * i + 1] = x[0]!;
    } else if (dim === 2) {
      inPts[2 * i] = x[0]!;
      inPts[2 * i + 1] = x[1]!;
    } else {
      inPts[2 * i] = x[0]!;
      inPts[2 * i + 1] = 0;
    }
  });
  outputs.forEach((y, i) => {
    for (let d = 0; d < dim; d++) outPts[i * dim + d] = y[d]!;
  });
  let exactMean: number[];
  let exactVar: number | null = null;
  if (id === 'square' || id === 'sine') {
    const m = (id === 'square' ? squareMoments : sineMoments)(p.mu!, p.sigma!);
    exactMean = [m.mean];
    exactVar = m.variance;
  } else if (id === 'polar') {
    exactMean = polarMean(p.muR!, p.muT! * DEG, p.sigmaT! * DEG);
  } else {
    exactMean = Array.from(lin.mean);
  }
  return {
    input,
    inPts,
    outPts,
    mc: fit,
    lin,
    exactMean,
    exactVar,
    insideLin: fractionInside(lin, outPts, dim),
    insideMc: fractionInside(fit, outPts, dim),
  };
}

/** Histogram of 1D outputs over the plot's x-range, scaled to a density (area 1 over all samples). */
export function outputHistogram(
  id: FnId,
  outPts: Float64Array,
  bins = 48,
): { edges: Float64Array; density: Float64Array } {
  const [lo, hi] = FUNCTIONS[id].outX;
  const h = histogram(outPts, bins, lo, hi);
  const w = (hi - lo) / bins;
  return { edges: h.edges, density: h.counts.map((c) => c / (outPts.length * w)) };
}
