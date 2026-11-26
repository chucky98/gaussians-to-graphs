/**
 * Contour lines of a scalar field sampled on a regular grid (marching squares). Returns line segments;
 * for drawing, unjoined segments are enough.
 */

export interface GridField {
  /** Values at grid nodes, row-major, row 0 at y = y0. */
  values: Float64Array;
  nx: number;
  ny: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export type Segment = [number, number, number, number];

/** Sample f on an nx × ny grid of nodes spanning [x0, x1] × [y0, y1]. */
export function sampleField(
  f: (x: number, y: number) => number,
  nx: number,
  ny: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): GridField {
  const values = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const y = y0 + ((y1 - y0) * j) / (ny - 1);
    for (let i = 0; i < nx; i++) values[j * nx + i] = f(x0 + ((x1 - x0) * i) / (nx - 1), y);
  }
  return { values, nx, ny, x0, x1, y0, y1 };
}

export function contourSegments(g: GridField, level: number): Segment[] {
  const { values: v, nx, ny, x0, x1, y0, y1 } = g;
  const dx = (x1 - x0) / (nx - 1);
  const dy = (y1 - y0) / (ny - 1);
  const segs: Segment[] = [];
  const lerp = (a: number, b: number) => (level - a) / (b - a);
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = v[j * nx + i]!; // bottom-left
      const b = v[j * nx + i + 1]!; // bottom-right
      const c = v[(j + 1) * nx + i + 1]!; // top-right
      const d = v[(j + 1) * nx + i]!; // top-left
      const xl = x0 + i * dx;
      const yb = y0 + j * dy;
      // Crossing points on each edge, if the level lies between its end values.
      const pts: [number, number][] = [];
      if (a < level !== b < level) pts.push([xl + lerp(a, b) * dx, yb]);
      if (b < level !== c < level) pts.push([xl + dx, yb + lerp(b, c) * dy]);
      if (d < level !== c < level) pts.push([xl + lerp(d, c) * dx, yb + dy]);
      if (a < level !== d < level) pts.push([xl, yb + lerp(a, d) * dy]);
      if (pts.length === 2) segs.push([pts[0]![0], pts[0]![1], pts[1]![0], pts[1]![1]]);
      else if (pts.length === 4) {
        // Saddle: resolve with the centre value.
        const centre = (a + b + c + d) / 4;
        if (centre < level === a < level) {
          segs.push([pts[0]![0], pts[0]![1], pts[1]![0], pts[1]![1]]);
          segs.push([pts[2]![0], pts[2]![1], pts[3]![0], pts[3]![1]]);
        } else {
          segs.push([pts[0]![0], pts[0]![1], pts[3]![0], pts[3]![1]]);
          segs.push([pts[1]![0], pts[1]![1], pts[2]![0], pts[2]![1]]);
        }
      }
    }
  }
  return segs;
}
