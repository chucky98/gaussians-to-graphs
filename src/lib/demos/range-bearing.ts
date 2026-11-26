/**
 * Pure model behind the RangeBearing widget (post 14): the delivery robot in a hospital lobby with
 * reflective markers on pillars and walls. Its lidar reports the range and bearing of every marker
 * within range.
 */
import { vec, type Mat, type Vec } from '../math/matrix';
import { createRng } from '../math/rng';
import { chi2Quantile } from '../math/stats';
import { inverseRangeBearing, rangeBearing, rangeBearingJacobians } from '../models/range-bearing';

export const LOBBY = {
  area: { x: [0, 12] as [number, number], y: [0, 8] as [number, number] },
  landmarks: [
    [2, 6.5],
    [5.5, 7],
    [9.5, 6],
    [10.5, 2],
    [3, 1.2],
  ] as [number, number][],
  robot: [4, 3.5, 0.4] as [number, number, number],
  seed: 14,
  samplesPerLandmark: 150,
};

export interface SensorParams {
  /** Range noise σ_r (m), bearing noise σ_φ (degrees), maximum range (m). */
  sigmaR: number;
  sigmaPhiDeg: number;
  maxRange: number;
}
export const SENSOR_DEFAULTS: SensorParams = { sigmaR: 0.1, sigmaPhiDeg: 2, maxRange: 8 };
export const SENSOR_LIMITS = {
  sigmaR: { min: 0.01, max: 0.5, step: 0.01 },
  sigmaPhiDeg: { min: 0.1, max: 10, step: 0.1 },
  maxRange: { min: 2, max: 14, step: 0.5 },
};

export const deg = Math.PI / 180;

export interface Sighting {
  index: number;
  m: Vec;
  /** Noise-free range and bearing. */
  z: Vec;
  Hx: Mat;
  Hm: Mat;
}

export function sightings(pose: Vec, p: SensorParams): Sighting[] {
  const out: Sighting[] = [];
  LOBBY.landmarks.forEach(([x, y], index) => {
    const m = vec([x, y]);
    const z = rangeBearing(pose, m);
    if (z[0]! <= p.maxRange && z[0]! > 1e-9) out.push({ index, m, z, ...rangeBearingJacobians(pose, m) });
  });
  return out;
}

/**
 * The 95% region of one reading, drawn on the floor: the 95% ellipse of the Gaussian (r, φ) in
 * measurement space, (r + c σ_r cos t, φ + c σ_φ sin t) with c² = χ²₂(0.95), mapped through the inverse
 * measurement. In measurement space it holds exactly 95% of the readings.
 */
export function wedge(pose: Vec, z: Vec, p: SensorParams, n = 48): [number, number][] {
  const c = Math.sqrt(chi2Quantile(0.95, 2));
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    const q = inverseRangeBearing(
      pose,
      vec([Math.max(0, z[0]! + c * p.sigmaR * Math.cos(t)), z[1]! + c * p.sigmaPhiDeg * deg * Math.sin(t)]),
    );
    pts.push([q[0]!, q[1]!]);
  }
  return pts;
}

/** Is a reading (r, φ) inside the 95% region around z? */
export function insideRegion(z: Vec, r: number, phi: number, p: SensorParams): boolean {
  const a = (r - z[0]!) / p.sigmaR;
  const b = Math.atan2(Math.sin(phi - z[1]!), Math.cos(phi - z[1]!)) / (p.sigmaPhiDeg * deg);
  return a * a + b * b <= chi2Quantile(0.95, 2);
}

/** Where noisy readings would put the landmark: samples of (r, φ) mapped back to the floor. */
export function readingSamples(pose: Vec, s: readonly Sighting[], p: SensorParams, seed = LOBBY.seed): Float64Array {
  const out = new Float64Array(2 * LOBBY.samplesPerLandmark * s.length);
  let j = 0;
  for (const sg of s) {
    const rng = createRng(seed * 31 + sg.index);
    for (let i = 0; i < LOBBY.samplesPerLandmark; i++) {
      const q = inverseRangeBearing(
        pose,
        vec([sg.z[0]! + p.sigmaR * rng.normal(), sg.z[1]! + p.sigmaPhiDeg * deg * rng.normal()]),
      );
      out[j++] = q[0]!;
      out[j++] = q[1]!;
    }
  }
  return out;
}

/** Half-widths of the 95% intervals along the ray (range noise) and across it (bearing noise × range). */
export function spread(z: Vec, p: SensorParams): { radial: number; lateral: number } {
  return { radial: 1.96 * p.sigmaR, lateral: 1.96 * z[0]! * p.sigmaPhiDeg * deg };
}
