/** Every concrete claim in post 31, checked against the widgets' defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import { BA, baProblem, reprojections, runBundle, sizes, trueCameras } from '../../../src/lib/demos/bundle';
import { projectCamera } from '../../../src/lib/models/pinhole';
import { linearizeGraph } from '../../../src/lib/graph/solver';
import { blockOrdering } from '../../../src/lib/graph/sparse';
import { ordering } from '../../../src/lib/graph/values';

const K = (f: number) => ({ fx: f, fy: f, cx: BA.K.cx, cy: BA.K.cy });

describe('post 31: pinhole', () => {
  it('(0.8, −0.5, 4) with f = 400 lands at (400, 190); depth 8 halves the offset; f = 800 doubles it', () => {
    expect(Array.from(projectCamera(K(400), Float64Array.of(0.8, -0.5, 4)))).toEqual([400, 190]);
    expect(projectCamera(K(400), Float64Array.of(0.8, -0.5, 8))[0]! - 320).toBe(40);
    expect(projectCamera(K(800), Float64Array.of(0.8, -0.5, 8))[0]! - 320).toBe(80);
  });
  it('points along the same ray (half and twice the distance) land on the same pixel', () => {
    const a = projectCamera(K(400), Float64Array.of(0.8, -0.5, 4));
    for (const s of [0.5, 2]) {
      const b = projectCamera(K(400), Float64Array.of(0.8 * s, -0.5 * s, 4 * s));
      expect(b[0]).toBeCloseTo(a[0]!, 12);
      expect(b[1]).toBeCloseTo(a[1]!, 12);
    }
  });
  it('the true cameras see every point inside the 640 × 480 image', () => {
    const cams = trueCameras();
    for (const T of cams)
      for (const p of BA.points) {
        const pc = Float64Array.from(
          [0, 1, 2].map((r) => [0, 1, 2].reduce((s, c) => s + T.C.data[c * 3 + r]! * (p[c]! - T.t[c]!), 0)),
        );
        expect(pc[2]).toBeGreaterThan(0);
        const uv = projectCamera(BA.K, pc);
        expect(uv[0]).toBeGreaterThan(0);
        expect(uv[0]).toBeLessThan(640);
        expect(uv[1]).toBeGreaterThan(0);
        expect(uv[1]).toBeLessThan(480);
      }
  });
});

describe('post 31: bundle adjustment', () => {
  const r = runBundle();
  it('reprojection error 52 → 4.4 → 1.11 → 1.06 px (settled after the third iteration); points 0.60 → 0.064 m', () => {
    const px = r.iterations.map((i) => i.rmsPixels);
    expect([px[0]!.toFixed(0), px[1]!.toFixed(1), px[2]!.toFixed(2), px[3]!.toFixed(2), px.at(-1)!.toFixed(2)]).toEqual(
      ['52', '4.4', '1.11', '1.06', '1.06'],
    );
    expect([r.iterations[0]!.rmsPoints.toFixed(2), r.iterations.at(-1)!.rmsPoints.toFixed(3)]).toEqual([
      '0.60',
      '0.064',
    ]);
  });
  it("camera 0's residuals shrink although its pose is fixed", () => {
    const obs = r.problem.observations;
    const rmsCam0 = (k: number) => {
      const pr = reprojections(r.values[k]!, obs);
      let s = 0;
      let n = 0;
      obs.forEach((o, i) => {
        if (o.cam !== 0) return;
        s += (pr[i]![0]! - o.z[0]!) ** 2 + (pr[i]![1]! - o.z[1]!) ** 2;
        n++;
      });
      return Math.sqrt(s / n);
    };
    expect(rmsCam0(r.values.length - 1)).toBeLessThan(rmsCam0(0) / 10);
  });
  it('54 unknowns; 24 after eliminating the points; minimum degree eliminates nine points, then the cameras, then the last point', () => {
    expect(sizes()).toEqual({ unknowns: 54, reduced: 24, observations: 40 });
    const p = baProblem();
    const ord = ordering(p.initial);
    const sys = linearizeGraph(p.factors, p.initial, ord);
    const { varPerm } = blockOrdering(sys.varAdj, ord.dims);
    expect([...varPerm].map((i) => ord.keys[i]!)).toEqual([
      'p0',
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
      'p6',
      'p7',
      'p8',
      'c0',
      'c1',
      'c2',
      'c3',
      'p9',
    ]);
  });
});
