/** DESIGN §8.1 robust invariants: kernels' ρ, weights and derivatives match their definitions; GNC recovers the inlier solution. */
import { describe, expect, it } from 'vitest';
import { kernel, robustHooks } from '../../../src/lib/graph/robust';
import { ROBUST, runRobust } from '../../../src/lib/demos/robust-demo';

describe('kernels', () => {
  it('ρ matches its definition and the IRLS weight is ρ′ (central differences)', () => {
    const k = 2;
    const defs: Record<string, (s: number) => number> = {
      l2: (s) => s,
      huber: (s) => (Math.sqrt(s) <= k ? s : 2 * k * Math.sqrt(s) - k * k),
      cauchy: (s) => k * k * Math.log(1 + s / (k * k)),
      gm: (s) => (k * k * s) / (k * k + s),
    };
    for (const name of ['l2', 'huber', 'cauchy', 'gm'] as const) {
      const ker = kernel(name, k);
      for (const s of [0.01, 0.5, 3, 3.99, 4.01, 10, 100, 1e4]) {
        expect(ker.rho(s)).toBeCloseTo(defs[name]!(s), 9);
        const h = 1e-6 * Math.max(1, s);
        expect(ker.weight(s)).toBeCloseTo((ker.rho(s + h) - ker.rho(s - h)) / (2 * h), 5);
      }
      // All kernels agree with the squared error for small errors.
      expect(ker.rho(1e-6) / 1e-6).toBeCloseTo(1, 5);
      expect(ker.weight(0)).toBe(1);
    }
  });
  it('robustHooks applies the kernel only to the chosen factors and halves ρ', () => {
    const h = robustHooks(kernel('cauchy', 1), (f) => f.type === 'loop');
    const loop = { type: 'loop' } as never;
    const odo = { type: 'odometry' } as never;
    expect(h.rho(loop, 3)).toBeCloseTo(0.5 * Math.log(4), 12);
    expect(h.rho(odo, 3)).toBe(1.5);
    expect(h.weight(odo, 1e6)).toBe(1);
    expect(h.weight(loop, 3)).toBeCloseTo(0.25, 12);
  });
});

describe('GNC', () => {
  it('recovers the inlier solution with injected false loop closures (seeded city), rejecting every outlier', () => {
    const clean = runRobust({ outliers: 0, method: 'l2', k: 3 });
    const r = runRobust({ outliers: 30, method: 'gnc', k: 3 });
    expect(r.falseRejected).toBe(30);
    expect(r.iterations.at(-1)!.rms).toBeLessThan(clean.iterations.at(-1)!.rms + 0.05);
    expect(ROBUST.poses).toBe(500);
  }, 60_000);
});
