/**
 * g2o text format for planar pose graphs (DESIGN §5.1): `VERTEX_SE2 id x y θ` and
 * `EDGE_SE2 i j dx dy dθ I11 I12 I13 I22 I23 I33` (the upper triangle of the information matrix).
 */
import * as se2 from '../geometry/se2';
import { fromArrays, type Mat } from '../math/matrix';

export interface G2oGraph {
  vertices: Map<number, se2.Pose2>;
  edges: { i: number; j: number; z: se2.Pose2; information: Mat }[];
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toPrecision(17).replace(/\.?0+$/, ''));

export function writeG2o(g: G2oGraph): string {
  const lines: string[] = [];
  for (const [id, p] of [...g.vertices.entries()].sort((a, b) => a[0] - b[0]))
    lines.push(`VERTEX_SE2 ${id} ${num(p.x)} ${num(p.y)} ${num(p.theta)}`);
  for (const e of g.edges) {
    const I = e.information.data;
    lines.push(
      `EDGE_SE2 ${e.i} ${e.j} ${num(e.z.x)} ${num(e.z.y)} ${num(e.z.theta)} ` +
        [I[0]!, I[1]!, I[2]!, I[4]!, I[5]!, I[8]!].map(num).join(' '),
    );
  }
  return lines.join('\n') + '\n';
}

export function readG2o(text: string): G2oGraph {
  const vertices = new Map<number, se2.Pose2>();
  const edges: G2oGraph['edges'] = [];
  for (const raw of text.split('\n')) {
    const t = raw.trim().split(/\s+/);
    if (t[0] === 'VERTEX_SE2') vertices.set(Number(t[1]), se2.pose(Number(t[2]), Number(t[3]), Number(t[4])));
    else if (t[0] === 'EDGE_SE2') {
      const [a, b, c, d, e, f] = t.slice(6, 12).map(Number) as [number, number, number, number, number, number];
      edges.push({
        i: Number(t[1]),
        j: Number(t[2]),
        z: se2.pose(Number(t[3]), Number(t[4]), Number(t[5])),
        information: fromArrays([
          [a, b, c],
          [b, d, e],
          [c, e, f],
        ]),
      });
    }
  }
  return { vertices, edges };
}
