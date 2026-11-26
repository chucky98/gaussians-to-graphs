/**
 * Seeded pseudo-random numbers (DESIGN §5.1). All randomness in the project goes through here.
 * Generator: sfc32 (Small Fast Counter), seeded from a 32-bit integer via splitmix32.
 */
import type { Mat, Vec } from './matrix';

export interface Rng {
  /** The seed this generator was created with. */
  readonly seed: number;
  /** Uniform on [0, 1). */
  uniform(): number;
  /** Uniform on [lo, hi). */
  uniformRange(lo: number, hi: number): number;
  /** Standard normal N(0, 1), Box–Muller. */
  normal(): number;
  /** Draw from N(mean, L Lᵀ) given the lower Cholesky factor L. */
  mvnormal(mean: Vec, chol: Mat): Vec;
  /** Uniformly chosen element of a non-empty array. */
  choice<T>(items: readonly T[]): T;
  /** A shuffled copy (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
}

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export function createRng(seed: number): Rng {
  if (!Number.isFinite(seed)) throw new RangeError('seed must be a finite number');
  const sm = splitmix32(Math.trunc(seed));
  let a = sm();
  let b = sm();
  let c = sm();
  let d = sm();
  const nextU32 = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    return t;
  };
  for (let i = 0; i < 12; i++) nextU32(); // warm-up

  let spare: number | null = null;

  const uniform = (): number => nextU32() / 4294967296;

  const normal = (): number => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u1 = uniform();
    while (u1 === 0) u1 = uniform();
    const u2 = uniform();
    const r = Math.sqrt(-2 * Math.log(u1));
    spare = r * Math.sin(2 * Math.PI * u2);
    return r * Math.cos(2 * Math.PI * u2);
  };

  return {
    seed,
    uniform,
    uniformRange: (lo, hi) => lo + (hi - lo) * uniform(),
    normal,
    mvnormal(mean, chol) {
      const n = mean.length;
      if (chol.rows !== n || chol.cols !== n) throw new RangeError('mvnormal: dimension mismatch');
      const z = new Float64Array(n);
      for (let i = 0; i < n; i++) z[i] = normal();
      const x = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let s = mean[i]!;
        for (let k = 0; k <= i; k++) s += chol.data[i * n + k]! * z[k]!;
        x[i] = s;
      }
      return x;
    },
    choice(items) {
      if (items.length === 0) throw new RangeError('choice from empty array');
      return items[Math.floor(uniform() * items.length)]!;
    },
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(uniform() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}

/**
 * A fresh, human-readable seed (1..999 999) derived deterministically from the current one.
 * Widgets use this for "New seed", so even reseeding is reproducible.
 */
export function nextSeed(seed: number): number {
  return 1 + Math.floor(createRng((Math.trunc(seed) ^ 0x5bd1e995) >>> 0).uniform() * 999_999);
}
