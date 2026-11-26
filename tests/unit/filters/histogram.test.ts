import { describe, expect, it } from 'vitest';
import {
  argmax,
  entropyBits,
  gaussianKernel,
  massNear,
  normalize,
  pointBelief,
  predict,
  sampleOffset,
  sum,
  uniformBelief,
  update,
  type MotionKernel,
} from '../../../src/lib/filters/histogram';
import { createRng } from '../../../src/lib/math/rng';

const rng = createRng(1010);
const randomBelief = (n: number) => normalize(Array.from({ length: n }, () => rng.uniform() + 0.01)).belief;
const randomLik = (n: number) => Array.from({ length: n }, () => rng.uniform());

describe('histogram filter (DESIGN §8.1 invariants)', () => {
  it('belief sums to 1 after predict and update', () => {
    let b = randomBelief(25);
    const k = gaussianKernel(2, 0.7);
    for (let t = 0; t < 20; t++) {
      b = predict(b, k, { cyclic: t % 2 === 0, kidnapProb: t % 3 === 0 ? 0.05 : 0 });
      expect(sum(b)).toBeCloseTo(1, 12);
      b = update(b, randomLik(25)).belief;
      expect(sum(b)).toBeCloseTo(1, 12);
    }
  });

  it('moving with no noise is an exact shift (cyclic wraps, bounded piles up at the end)', () => {
    const b = randomBelief(10);
    const s = predict(b, gaussianKernel(3, 0));
    for (let i = 0; i < 10; i++) expect(s[(i + 3) % 10]).toBe(b[i]);
    const c = predict(b, gaussianKernel(3, 0), { cyclic: false });
    for (let i = 3; i < 9; i++) expect(c[i]).toBe(b[i - 3]);
    expect(c[9]).toBeCloseTo(b[6]! + b[7]! + b[8]! + b[9]!, 15);
    expect(c[0]).toBe(0);
  });

  it('a constant likelihood changes nothing; two updates equal one update with the product', () => {
    const b = randomBelief(12);
    const same = update(b, new Float64Array(12).fill(0.3)).belief;
    for (let i = 0; i < 12; i++) expect(same[i]).toBeCloseTo(b[i]!, 15);
    const l1 = randomLik(12);
    const l2 = randomLik(12);
    const twice = update(update(b, l1).belief, l2).belief;
    const once = update(
      b,
      l1.map((v, i) => v * l2[i]!),
    ).belief;
    for (let i = 0; i < 12; i++) expect(twice[i]).toBeCloseTo(once[i]!, 14);
  });

  it('the recursive filter equals Bayes rule applied to the whole history (brute-force enumeration)', () => {
    // Small corridor, 4 steps: enumerate every path x0 … x4 with its joint probability.
    const n = 6;
    const kernel: MotionKernel = { offsets: [0, 1, 2], probs: [0.2, 0.5, 0.3] };
    const prior = randomBelief(n);
    const liks = Array.from({ length: 4 }, () => randomLik(n));
    const eps = 0.1;
    const trans = (i: number, j: number) => {
      // p(x_k = i | x_{k−1} = j)
      let p = 0;
      kernel.offsets.forEach((o, k) => {
        if ((j + o) % n === i) p += kernel.probs[k]!;
      });
      return (1 - eps) * p + eps / n;
    };
    const joint = new Float64Array(n);
    const rec = (k: number, x: number, p: number) => {
      if (k === liks.length) {
        joint[x]! += p;
        return;
      }
      for (let y = 0; y < n; y++) rec(k + 1, y, p * trans(y, x) * liks[k]![y]!);
    };
    for (let x0 = 0; x0 < n; x0++) rec(0, x0, prior[x0]!);
    const brute = normalize(joint).belief;

    let b: Float64Array = prior;
    let evidence = 1;
    for (const l of liks) {
      const u = update(predict(b, kernel, { kidnapProb: eps }), l);
      b = u.belief;
      evidence *= u.evidence;
    }
    for (let i = 0; i < n; i++) expect(b[i]).toBeCloseTo(brute[i]!, 14);
    // The product of the normalizers is the probability of all the data, p(z_1:4).
    expect(evidence).toBeCloseTo(sum(joint), 14);
  });

  it('prediction is the convolution sum Σⱼ p(i | j) bel(j)', () => {
    const b = randomBelief(9);
    const k = gaussianKernel(1, 1.2);
    const p = predict(b, k);
    for (let i = 0; i < 9; i++) {
      let s = 0;
      for (let j = 0; j < 9; j++)
        k.offsets.forEach((o, q) => {
          if ((((j + o) % 9) + 9) % 9 === i) s += k.probs[q]! * b[j]!;
        });
      expect(p[i]).toBeCloseTo(s, 15);
    }
  });

  it('kidnapping mixes in a uniform: every cell keeps at least ε/n', () => {
    const p = predict(pointBelief(20, 4), gaussianKernel(2, 0), { kidnapProb: 0.01 });
    expect(Math.min(...p)).toBeCloseTo(0.01 / 20, 15);
    expect(p[6]).toBeCloseTo(0.99 + 0.01 / 20, 15);
    expect(() => predict(p, gaussianKernel(0, 0), { kidnapProb: 2 })).toThrow();
  });
});

describe('histogram helpers', () => {
  it('gaussianKernel: cell masses sum to 1, mean is the move, spread grows with the std', () => {
    for (const s of [0.2, 0.5, 1, 2]) {
      const k = gaussianKernel(2, s);
      expect(sum(k.probs)).toBeCloseTo(1, 12);
      const m = k.offsets.reduce((a, o, i) => a + o * k.probs[i]!, 0);
      expect(m).toBeCloseTo(2, 9);
      const v = k.offsets.reduce((a, o, i) => a + (o - 2) ** 2 * k.probs[i]!, 0);
      // Rounding to cells adds about 1/12 cell² (Sheppard's correction), less for tiny std.
      expect(v).toBeLessThan(s * s + 1 / 12 + 1e-6);
      if (s >= 1) expect(v).toBeCloseTo(s * s + 1 / 12, 3);
    }
    expect(gaussianKernel(1, 0)).toEqual({ offsets: [1], probs: [1] });
    expect(() => gaussianKernel(0, -1)).toThrow();
  });

  it('sampleOffset follows the kernel', () => {
    const k: MotionKernel = { offsets: [-1, 0, 1], probs: [0.25, 0.5, 0.25] };
    expect(sampleOffset(k, 0)).toBe(-1);
    expect(sampleOffset(k, 0.3)).toBe(0);
    expect(sampleOffset(k, 0.76)).toBe(1);
    expect(sampleOffset(k, 0.999999999)).toBe(1);
    const r = createRng(3);
    const counts = [0, 0, 0];
    for (let i = 0; i < 20000; i++) counts[sampleOffset(k, r.uniform()) + 1]! += 1;
    expect(counts[1]! / 20000).toBeCloseTo(0.5, 1);
  });

  it('uniform, point, argmax, massNear, entropy, normalize', () => {
    expect(sum(uniformBelief(8))).toBeCloseTo(1, 15);
    expect(entropyBits(uniformBelief(8))).toBeCloseTo(3, 12);
    expect(entropyBits(pointBelief(8, 2))).toBe(0);
    expect(argmax([0.1, 0.4, 0.4, 0.1])).toBe(1);
    expect(massNear([0.5, 0.1, 0.1, 0.1, 0.2], 0, 1)).toBeCloseTo(0.8, 15);
    expect(massNear([0.5, 0.1, 0.1, 0.1, 0.2], 0, 1, false)).toBeCloseTo(0.6, 15);
    expect(() => normalize([0, 0])).toThrow();
    expect(() => uniformBelief(0)).toThrow();
    expect(() => update([1], [1, 2])).toThrow();
  });
});
