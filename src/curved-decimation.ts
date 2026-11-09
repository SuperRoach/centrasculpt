import { Box3, Triangle, Vector3 } from "three";
import type { CurvedReductionOptions, CurvedReductionReport } from "./export-decimation";
import { validateCurvedReduction } from "./export-decimation";
import type { ExportWork } from "./export-mesh";
import type { PrintReport } from "./stl-export";

type Validator = (p: Float32Array, work: ExportWork) => Promise<PrintReport>;
type Tree = { box: Box3 } & ({ ids: Uint32Array } | { left: Tree; right: Tree });
class Rejected extends Error {}
/** A separate bounded diagnostic allowance; never changes SDF/export admission. */
class Checks {
  private count = 0;
  spend() {
    if (++this.count > 64_000_000) throw new Rejected("Geometry-check work limit reached.");
  }
}
function closed(report: PrintReport): boolean {
  return (
    !report.blocking.length &&
    report.components === 1 &&
    report.invertedComponents === 0 &&
    report.boundaryEdges === 0 &&
    report.nonManifoldEdges === 0 &&
    report.inconsistentEdges === 0 &&
    report.degenerateTriangles === 0
  );
}

async function distance(from: Float32Array, to: Float32Array, work: ExportWork, checks: Checks) {
  const point = new Vector3(),
    closest = new Vector3(),
    triangle = new Triangle();
  async function build(ids: Uint32Array): Promise<Tree> {
    const box = new Box3();
    for (let i = 0; i < ids.length; i++) {
      checks.spend();
      if (i % 8192 === 0) await work.pause("Checking curved surface distance", i, ids.length);
      for (let k = 0; k < 9; k += 3) box.expandByPoint(point.fromArray(to, ids[i] + k));
    }
    if (ids.length <= 16) return { box, ids };
    const dims = box.getSize(point).toArray(),
      axis = dims.indexOf(Math.max(...dims));
    ids.sort((a, b) => to[a + axis] - to[b + axis]);
    const middle = Math.floor(ids.length / 2);
    const left = await build(ids.subarray(0, middle));
    const right = await build(ids.subarray(middle));
    return { box, left, right };
  }
  const root = await build(Uint32Array.from({ length: to.length / 9 }, (_, i) => i * 9));
  function nearest(node: Tree, best: number): number {
    checks.spend();
    if (node.box.distanceToPoint(point) >= best) return best;
    if ("ids" in node) {
      for (const id of node.ids) {
        checks.spend();
        triangle.a.fromArray(to, id);
        triangle.b.fromArray(to, id + 3);
        triangle.c.fromArray(to, id + 6);
        best = Math.min(best, triangle.closestPointToPoint(point, closest).distanceTo(point));
      }
      return best;
    }
    const first =
      node.left.box.distanceToPoint(point) < node.right.box.distanceToPoint(point)
        ? node.left
        : node.right;
    return nearest(first === node.left ? node.right : node.left, nearest(first, best));
  }
  let max = 0;
  const stride = 9 * Math.max(1, Math.ceil(from.length / 9 / 2048));
  for (let i = 0; i < from.length; i += stride) {
    await work.pause("Checking curved surface distance", i, from.length);
    point.fromArray(from, i);
    max = Math.max(max, nearest(root, Infinity));
    point.set(
      (from[i] + from[i + 3] + from[i + 6]) / 3,
      (from[i + 1] + from[i + 4] + from[i + 7]) / 3,
      (from[i + 2] + from[i + 5] + from[i + 8]) / 3,
    );
    max = Math.max(max, nearest(root, Infinity));
  }
  return max;
}

async function masks(p: Float32Array, extent: number, work: ExportWork, checks: Checks) {
  const size = 300,
    result: Uint8Array[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const mask = new Uint8Array(size * size),
      a = (axis + 1) % 3,
      b = (axis + 2) % 3;
    for (let i = 0; i < p.length; i += 9) {
      if (i % 4608 === 0) await work.pause("Checking curved silhouettes", i, p.length);
      const x = [0, 1, 2].map((k) => 150 + (p[i + k * 3 + a] / extent) * 260);
      const y = [0, 1, 2].map((k) => 150 - (p[i + k * 3 + b] / extent) * 260);
      const edge = (a: number, b: number, px: number, py: number) =>
        (x[b] - x[a]) * (py - y[a]) - (y[b] - y[a]) * (px - x[a]);
      if (Math.abs(edge(0, 1, x[2], y[2])) < 1e-12) continue;
      for (
        let py = Math.max(0, Math.floor(Math.min(...y)));
        py <= Math.min(size - 1, Math.ceil(Math.max(...y)));
        py++
      )
        for (
          let px = Math.max(0, Math.floor(Math.min(...x)));
          px <= Math.min(size - 1, Math.ceil(Math.max(...x)));
          px++
        ) {
          checks.spend();
          const e0 = edge(0, 1, px + 0.5, py + 0.5),
            e1 = edge(1, 2, px + 0.5, py + 0.5),
            e2 = edge(2, 0, px + 0.5, py + 0.5);
          if ((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0))
            mask[py * size + px] = 1;
        }
    }
    result.push(mask);
  }
  return result;
}

async function sections(p: Float32Array, extent: number, work: ExportWork, checks: Checks) {
  const size = 96,
    result: number[][] = [];
  let stored = 0;
  for (let axis = 0; axis < 3; axis++) {
    const a = (axis + 1) % 3,
      b = (axis + 2) % 3,
      cells: number[][] = Array.from({ length: size * size }, () => []);
    for (let i = 0; i < p.length; i += 9) {
      if (i % 4608 === 0) await work.pause("Checking curved cavities and gaps", i, p.length);
      const grid = (v: number) => (v / extent + 0.5) * size;
      const x = grid(p[i + a]),
        y = grid(p[i + b]),
        ux = grid(p[i + 3 + a]) - x,
        uy = grid(p[i + 3 + b]) - y,
        vx = grid(p[i + 6 + a]) - x,
        vy = grid(p[i + 6 + b]) - y;
      const det = ux * vy - uy * vx;
      if (Math.abs(det) < 1e-12) continue;
      for (
        let j = Math.max(0, Math.floor(Math.min(y, y + uy, y + vy)));
        j <= Math.min(size - 1, Math.ceil(Math.max(y, y + uy, y + vy)));
        j++
      )
        for (
          let k = Math.max(0, Math.floor(Math.min(x, x + ux, x + vx)));
          k <= Math.min(size - 1, Math.ceil(Math.max(x, x + ux, x + vx)));
          k++
        ) {
          checks.spend();
          const dx = k + 0.371 - x,
            dy = j + 0.617 - y,
            u = (dx * vy - dy * vx) / det,
            v = (ux * dy - uy * dx) / det;
          if (u >= 0 && v >= 0 && u + v <= 1) {
            if (++stored > 1_000_000) throw new Rejected("Section-check storage limit reached.");
            cells[j * size + k].push(
              p[i + axis] +
                u * (p[i + 3 + axis] - p[i + axis]) +
                v * (p[i + 6 + axis] - p[i + axis]),
            );
          }
        }
    }
    for (let i = 0; i < cells.length; i++) {
      if (i % 2048 === 0) await work.pause("Checking curved section intervals", i, cells.length);
      cells[i].sort((a, b) => a - b);
      result.push(cells[i]);
    }
  }
  return result;
}

/** Disposable candidate in already-sized Float32 millimetres. The input is never mutated. */
export async function reduceCurvedSTL(
  original: Float32Array,
  before: PrintReport,
  options: CurvedReductionOptions,
  workspaceBytes: number,
  work: ExportWork,
  validate: Validator,
): Promise<{ positions: Float32Array; topology: PrintReport; report: CurvedReductionReport }> {
  validateCurvedReduction(options);
  work.check();
  const faces = original.length / 9,
    toleranceMM = options.toleranceMM;
  const report: CurvedReductionReport = {
    status: "kept-original",
    reason: "No eligible reduction.",
    toleranceMM,
    inputTriangles: faces,
    outputTriangles: faces,
  };
  const keep = (reason: string) => ({
    positions: original,
    topology: before,
    report: { ...report, reason },
  });
  if (!closed(before)) return keep("Requires one closed, outward surface.");
  if (faces > 300_000) return keep("Experimental input limit is 300,000 triangles.");
  const estimate = faces * 1024 + 16 * 1024 ** 2;
  if (estimate > workspaceBytes) return keep("Not enough workspace in the selected memory budget.");
  report.workspaceBytes = estimate;
  try {
    work.check();
    const { MeshoptSimplifier: simplifier } = await import(
      "meshoptimizer/meshopt_simplifier.module.js"
    );
    await simplifier.ready;
    work.check();
    if (!simplifier.supported) return keep("Simplification is unavailable in this browser.");
    simplifier.useExperimentalFeatures = true;
    const ids = new Map<string, number>(),
      indices = new Uint32Array(original.length / 3),
      coords = new Float32Array(original.length),
      normals = new Float64Array(original.length),
      locks = new Uint8Array(original.length / 3);
    const bounds = new Box3(),
      a = new Vector3(),
      b = new Vector3(),
      c = new Vector3();
    for (let i = 0; i < original.length; i += 3) {
      if (i % 12288 === 0) await work.pause("Indexing curved surface", i, original.length);
      bounds.expandByPoint(a.fromArray(original, i));
    }
    const min = bounds.min,
      max = bounds.max,
      crease = Math.cos(Math.PI / 12);
    for (let i = 0; i < original.length; i += 9) {
      if (i % 4608 === 0) await work.pause("Indexing curved surface", i, original.length);
      a.fromArray(original, i);
      b.fromArray(original, i + 3);
      c.fromArray(original, i + 6);
      const normal = b.sub(a).cross(c.sub(a)).normalize();
      for (let k = i; k < i + 9; k += 3) {
        const x = original[k],
          y = original[k + 1],
          z = original[k + 2],
          key = `${x},${y},${z}`;
        let id = ids.get(key);
        if (id === undefined) {
          id = ids.size;
          ids.set(key, id);
          coords.set([x, y, z], id * 3);
          normal.toArray(normals, id * 3);
          locks[id] = Number(
            x === min.x || x === max.x || y === min.y || y === max.y || z === min.z || z === max.z,
          );
        } else if (
          normals[id * 3] * normal.x +
            normals[id * 3 + 1] * normal.y +
            normals[id * 3 + 2] * normal.z <
          crease
        )
          locks[id] = 1;
        indices[k / 3] = id;
      }
    }
    const vertexCount = ids.size;
    ids.clear();
    const ratio = toleranceMM <= 0.05 ? 0.99 : 0.9;
    work.progress({ stage: "Reducing curved surface", completed: 0, total: 1 });
    work.check();
    const [out, error] = simplifier.simplifyWithAttributes(
      indices,
      coords.subarray(0, vertexCount * 3),
      3,
      new Float32Array(vertexCount),
      1,
      [0],
      locks.subarray(0, vertexCount),
      Math.floor(faces * ratio) * 3,
      toleranceMM <= 0.05 ? toleranceMM / 50 : toleranceMM / 10,
      ["LockBorder", "ErrorAbsolute"],
    );
    work.check();
    if (out.length >= indices.length) return keep("No reduction within the selected tolerance.");
    if (error > toleranceMM) throw new Rejected("Solver error exceeds the selected tolerance.");
    const candidate = new Float32Array(out.length * 3);
    for (let i = 0; i < out.length; i++) {
      if (i % 4096 === 0) await work.pause("Preparing curved candidate", i, out.length);
      for (let k = 0; k < 3; k++) candidate[i * 3 + k] = coords[out[i] * 3 + k];
    }
    const after = await validate(candidate, work);
    if (!closed(after) || !before.dimensions.every((n, i) => n === after.dimensions[i]))
      throw new Rejected("Candidate failed topology or exact dimension checks.");
    if (vertexCount - faces / 2 !== new Set(out).size - out.length / 6)
      throw new Rejected("Candidate changed surface topology.");
    const checks = new Checks();
    const forward = await distance(original, candidate, work, checks),
      reverse = await distance(candidate, original, work, checks);
    report.sampledMaxMM = Math.max(forward, reverse);
    if (report.sampledMaxMM > toleranceMM)
      throw new Rejected("Sampled surface change exceeds the selected tolerance.");
    const extent = Math.max(...before.dimensions) * 1.005;
    const oldMasks = await masks(original, extent, work, checks),
      newMasks = await masks(candidate, extent, work, checks);
    if (oldMasks.some((mask, a) => mask.some((v, i) => v !== newMasks[a][i])))
      throw new Rejected("Candidate changed a checked silhouette.");
    const oldSections = await sections(original, extent, work, checks),
      newSections = await sections(candidate, extent, work, checks);
    let sectionMax = 0;
    for (let i = 0; i < oldSections.length; i++) {
      if (i % 1024 === 0)
        await work.pause("Checking curved section intervals", i, oldSections.length);
      const a = oldSections[i],
        b = newSections[i];
      if (a.length !== b.length) throw new Rejected("Candidate changed a checked cavity or gap.");
      for (let j = 0; j < a.length; j++) {
        sectionMax = Math.max(sectionMax, Math.abs(a[j] - b[j]));
        if (j) sectionMax = Math.max(sectionMax, Math.abs(a[j] - a[j - 1] - (b[j] - b[j - 1])));
      }
    }
    report.sectionMaxMM = sectionMax;
    if (sectionMax > toleranceMM)
      throw new Rejected("Candidate changed a checked thickness or clearance.");
    work.check();
    return {
      positions: candidate,
      topology: after,
      report: {
        ...report,
        status: "applied",
        reason: "Passed sampled geometry and topology checks.",
        outputTriangles: out.length / 3,
      },
    };
  } catch (error) {
    work.check(); // Cancellation and stale sources must never turn into a successful fallback.
    return keep(
      error instanceof Rejected
        ? error.message
        : "Reduction unavailable; the candidate was discarded.",
    );
  }
}
