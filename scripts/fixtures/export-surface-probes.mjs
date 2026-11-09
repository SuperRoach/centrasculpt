// Deterministic point-to-triangle distances in STL millimetres. Each direction
// samples up to 2048 evenly spaced faces at one vertex and the centroid.
import { Box3, Triangle, Vector3 } from "three";

export function sampledDistance(from, to) {
  const face = new Triangle(),
    p = new Vector3(),
    closest = new Vector3();
  const indices = Uint32Array.from({ length: to.length / 9 }, (_, i) => i * 9);
  function build(ids) {
    const box = new Box3();
    for (const id of ids) for (let k = 0; k < 9; k += 3) box.expandByPoint(p.fromArray(to, id + k));
    if (ids.length <= 16) return { box, ids };
    const dims = box.getSize(p).toArray();
    const a = dims.indexOf(Math.max(...dims));
    ids.sort((i, j) => to[i + a] - to[j + a]);
    const mid = Math.floor(ids.length / 2);
    return { box, left: build(ids.subarray(0, mid)), right: build(ids.subarray(mid)) };
  }
  const root = build(indices);
  function nearest(node, best) {
    if (node.box.distanceToPoint(p) >= best) return best;
    if (node.ids) {
      for (const id of node.ids) {
        face.a.fromArray(to, id);
        face.b.fromArray(to, id + 3);
        face.c.fromArray(to, id + 6);
        best = Math.min(best, face.closestPointToPoint(p, closest).distanceTo(p));
      }
      return best;
    }
    const first =
      node.left.box.distanceToPoint(p) < node.right.box.distanceToPoint(p) ? node.left : node.right;
    return nearest(first === node.left ? node.right : node.left, nearest(first, best));
  }
  const errors = [];
  for (let i = 0; i < from.length; i += 9 * Math.ceil(from.length / 9 / 2048)) {
    p.fromArray(from, i);
    errors.push(nearest(root, Infinity));
    p.set(...[0, 1, 2].map((k) => (from[i + k] + from[i + 3 + k] + from[i + 6 + k]) / 3));
    errors.push(nearest(root, Infinity));
  }
  errors.sort((a, b) => a - b);
  return {
    samples: errors.length,
    p95MM: errors[Math.floor(errors.length * 0.95)],
    maxMM: errors.at(-1),
  };
}
