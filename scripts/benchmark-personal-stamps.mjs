/** Disposable evaluated masters and destinations; never opens the user's library. */
import "./compile-core.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { IDBFactory } from "fake-indexeddb";
import { Triangle, Vector3 } from "three";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import {
  compressPersonalShape,
  encodePersonalShape,
  PersonalShapeLibrary,
} from "../work/test-build/personal-shapes.mjs";
import { createPersonalStamp, personalStampSource } from "../work/test-build/personal-stamp.mjs";
import { openSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { exportShapeBackup, previewShapeBackup } from "../work/test-build/shape-backup.mjs";
import { defineShape } from "../work/test-build/shapes.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";
import { FIXTURE_VERSION, FIXTURES, POSES } from "./fixtures/personal-stamp-baseline.mjs";

const output = resolve(
  process.argv[2] ?? "work/personal-stamps",
  new Date().toISOString().replaceAll(":", "-"),
);
mkdirSync(output, { recursive: true });
const fixtureDir =
  process.env.PERSONAL_FIXTURES ?? "work/personal-stamp-baseline/2026-11-10T12-23-20.143Z";
const fixtures = process.env.PERSONAL_FIXTURE
  ? FIXTURES.filter((f) => f.id === process.env.PERSONAL_FIXTURE)
  : FIXTURES;
const resolutions = (process.env.PERSONAL_RESOLUTIONS ?? "64,128,192").split(",").map(Number);
const settings = {
  mode: "add",
  radius: 0.22,
  strength: 0.35,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const hash = (a) =>
  createHash("sha256")
    .update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))
    .digest("hex");
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=";
globalThis.createImageBitmap = async () => ({ width: 128, height: 128, close() {} });
const report = {
  date: new Date().toISOString(),
  runtime: process.version,
  cpu: cpus()[0]?.model,
  fixtureVersion: FIXTURE_VERSION,
  method:
    "Actual restored SDF masters, fixed 100 mm cube, Add into empty destination and Subtract from a bounded box. 3 independently prepared source observations and up to 20 fixed-pose warm samples per fixture/resolution/operation; refusals are recorded. Timings include CPU and scheduling, not GPU/headset latency. Geometric deviations are sampled master-mesh vertices to closest destination triangle and reverse, not a certified Hausdorff bound. Topology uses welded triangle edges; feature probes additionally test void connectivity. Memory snapshots are whole-process observations, not isolated peaks.",
  rows: [],
};
// Exact nearest-triangle distance inside the stated search radius, spatially indexed.
function surfaceIndex(a, cell) {
  const bins = new Map(),
    tri = new Triangle(),
    p = new Vector3(),
    q = new Vector3();
  for (let i = 0; i < a.length; i += 9) {
    const lo = [0, 1, 2].map((k) =>
        Math.floor(Math.min(a[i + k], a[i + 3 + k], a[i + 6 + k]) / cell),
      ),
      hi = [0, 1, 2].map((k) => Math.floor(Math.max(a[i + k], a[i + 3 + k], a[i + 6 + k]) / cell));
    for (let z = lo[2]; z <= hi[2]; z++)
      for (let y = lo[1]; y <= hi[1]; y++)
        for (let x = lo[0]; x <= hi[0]; x++) {
          const key = `${x},${y},${z}`;
          if (!bins.has(key)) bins.set(key, []);
          bins.get(key).push(i);
        }
  }
  return (point) => {
    p.fromArray(point);
    const g = point.map((v) => Math.floor(v / cell));
    let best = Infinity;
    for (let r = 0; r <= 4; r++) {
      const seen = new Set();
      for (let z = g[2] - r; z <= g[2] + r; z++)
        for (let y = g[1] - r; y <= g[1] + r; y++)
          for (let x = g[0] - r; x <= g[0] + r; x++)
            for (const i of bins.get(`${x},${y},${z}`) ?? []) {
              if (seen.has(i)) continue;
              seen.add(i);
              tri.a.fromArray(a, i);
              tri.b.fromArray(a, i + 3);
              tri.c.fromArray(a, i + 6);
              tri.closestPointToPoint(p, q);
              best = Math.min(best, p.distanceTo(q));
            }
      const boundary = Math.min(
        ...point.map((v, k) => Math.min(v - (g[k] - r) * cell, (g[k] + r + 1) * cell - v)),
      );
      if (best <= boundary) return best;
    }
    return best;
  };
}
function deviation(points, target, step) {
  if (!target.length) return { count: 0, missingSurface: true };
  const nearest = surfaceIndex(target, step * 2),
    errors = [];
  let missed = 0;
  const stride = Math.max(1, Math.floor(points.length / 3 / 600));
  for (let i = 0; i < points.length; i += 3 * stride) {
    const d = nearest(Array.from(points.subarray(i, i + 3)));
    if (Number.isFinite(d)) errors.push(d * 50);
    else missed++;
  }
  errors.sort((a, b) => a - b);
  return {
    count: errors.length,
    missed,
    meanMM: errors.reduce((s, v) => s + v, 0) / Math.max(1, errors.length),
    p95MM: errors[Math.floor((errors.length - 1) * 0.95)] ?? null,
    maxMM: errors.at(-1) ?? null,
  };
}
function topology(a) {
  const vertices = new Map(),
    edges = new Map(),
    parent = [];
  let degenerate = 0;
  function id(i) {
    const k = Array.from(a.subarray(i, i + 3), (v) => Math.round(v * 1e6)).join(",");
    if (!vertices.has(k)) {
      vertices.set(k, parent.length);
      parent.push(parent.length);
    }
    return vertices.get(k);
  }
  function root(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  for (let i = 0; i < a.length; i += 9) {
    const ids = [id(i), id(i + 3), id(i + 6)];
    if (new Set(ids).size < 3) {
      degenerate++;
      continue;
    }
    for (let j = 0; j < 3; j++) {
      const x = ids[j],
        y = ids[(j + 1) % 3];
      parent[root(x)] = root(y);
      const k = x < y ? `${x},${y}` : `${y},${x}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  return {
    triangles: a.length / 9,
    vertices: vertices.size,
    components: new Set(parent.map((_, i) => root(i))).size,
    boundaryEdges: [...edges.values()].filter((n) => n === 1).length,
    nonmanifoldEdges: [...edges.values()].filter((n) => n > 2).length,
    degenerateWeldedTriangles: degenerate,
    euler: vertices.size - edges.size + a.length / 9 - degenerate,
  };
}
function meshPositions(c) {
  const meshes = c.active.surface.group.children.filter((o) => o.isMesh);
  const a = new Float32Array(
    meshes.reduce((n, m) => n + m.geometry.getAttribute("position").array.length, 0),
  );
  let at = 0;
  for (const m of meshes) {
    const p = m.geometry.getAttribute("position").array;
    a.set(p, at);
    at += p.length;
  }
  return a;
}
const flush = () => writeFileSync(resolve(output, "results.json"), JSON.stringify(report, null, 2));
for (const fixture of fixtures) {
  const bytes = readFileSync(resolve(fixtureDir, `${fixture.id}.form`)),
    p = openSculptProject(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    ),
    masterHash = hash(p.activeLayer.volume.values),
    library = new PersonalShapeLibrary(new IDBFactory(), "benchmark-source"),
    restoredLibrary = new PersonalShapeLibrary(new IDBFactory(), "benchmark-restored");
  const encoded = encodePersonalShape(
      p,
      p.activeLayer,
      fixture.id,
      png,
      [80, 80, 80],
      50,
      "centre",
    ),
    packed = await compressPersonalShape(encoded.record, encoded.data);
  await library.put(packed.record, packed.data, null);
  await restoredLibrary.restore(await previewShapeBackup(await exportShapeBackup(library)));
  const restored = await restoredLibrary.master(encoded.record.id);
  assert.equal(hash(restored.layer.volume.values), masterHash);
  const preparations = [];
  let token;
  for (let i = 0; i < 3; i++) {
    globalThis.gc?.();
    const memoryBefore = process.memoryUsage(),
      t = performance.now();
    token = createPersonalStamp(restored.layer, 1);
    preparations.push({
      ms: performance.now() - t,
      memoryBefore,
      memoryAfter: process.memoryUsage(),
    });
  }
  const source = personalStampSource(token),
    reference = Float32Array.from(source.positions, (v) => v * source.size);
  for (const n of resolutions)
    for (const operation of ["add", "subtract"]) {
      globalThis.gc?.();
      const v = new SDFVolume(n, 1, false);
      v.values.fill(4);
      if (operation === "subtract")
        for (let z = 0; z < n; z++)
          for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++)
              v.values[v.index(x, y, z)] =
                Math.max(
                  Math.abs(v.coordinate(x)),
                  Math.abs(v.coordinate(y)),
                  Math.abs(v.coordinate(z)),
                ) - 0.9;
      const initialHash = hash(v.values);
      const c = new IndependentLayers(createBaseProject(v, settings));
      c.display.precision.millimetresPerUnit = 50;
      const d = defineShape({
        kind: "box",
        personal: token,
        targetLayerId: c.project.activeLayerId,
        operation,
        dimensions: [source.size, source.size, source.size],
        transform: identityTransform(),
      });
      const memoryBefore = process.memoryUsage(),
        trackedBefore = c.trackedBytes,
        t = performance.now();
      try {
        assert(c.stampShape(d));
      } catch (error) {
        assert.equal(hash(v.values), initialHash);
        assert.equal(c.undoCount, 0);
        assert.equal(hash(restored.layer.volume.values), masterHash);
        report.rows.push({
          id: fixture.id,
          n,
          operation,
          rejected: String(error.message),
          masterHash,
          masterUnchanged: true,
          destinationUnchanged: true,
          sourceAccountedBytes: source.bytes,
          trackedBefore,
        });
        flush();
        console.log(`${fixture.id} ${n} ${operation}: safely refused: ${error.message}`);
        c.dispose();
        continue;
      }
      const firstMs = performance.now() - t,
        first = { ...c.lastStampStats },
        destinationHash = hash(c.active.volume.values),
        allResult = meshPositions(c),
        result =
          operation === "add"
            ? allResult
            : Float32Array.from(
                Array.from({ length: allResult.length / 9 }, (_, i) => i * 9)
                  .filter((i) =>
                    [0, 1, 2].every(
                      (k) =>
                        Math.abs(
                          (allResult[i + k] + allResult[i + 3 + k] + allResult[i + 6 + k]) / 3,
                        ) < 0.85,
                    ),
                  )
                  .flatMap((i) => Array.from(allResult.subarray(i, i + 9))),
              );
      const row = {
        id: fixture.id,
        n,
        operation,
        masterHash,
        restoredHash: hash(restored.layer.volume.values),
        preparations,
        sourceStepMM: restored.layer.volume.step * 50,
        destinationStepMM: v.step * 50,
        dimensions: c.active.volume.dimensions,
        featureWidthsInDestinationVoxels: fixture.featuresMM.map((w) => w / (v.step * 50)),
        sourceAccountedBytes: source.bytes,
        denseValuesScratchBytes: v.values.byteLength * 2,
        trackedBefore,
        trackedAfter: c.trackedBytes,
        memoryBefore,
        memoryAfter: process.memoryUsage(),
        firstMs,
        first,
        sourceToResult: deviation(reference, result, v.step),
        resultToSource: deviation(result, reference, v.step),
        topology: topology(result),
        wholeDestinationTopology: topology(allResult),
        probes: fixture.probes.map(([x, y, z, sign]) => ({
          positionMM: [x, y, z],
          referenceSign: sign,
          resultSign:
            Math.sign(v.sampleLocal({ x: x / 50, y: y / 50, z: z / 50 })) *
            (operation === "subtract" ? -1 : 1),
        })),
        warm: [],
      };
      if (fixture.id.startsWith("slot") || fixture.id === "hollow-part")
        row.zAperture = {
          samples: 201,
          allPositive: Array.from({ length: 201 }, (_, i) =>
            v.sampleLocal({ x: 0, y: 0, z: (i - 100) * 0.003 }),
          ).every((v) => (operation === "add" ? v > 0 : v < 0)),
        };
      c.undo();
      assert.equal(hash(v.values), initialHash);
      c.undo(true);
      assert.equal(hash(v.values), destinationHash);
      // Fixed trace through real packed continuous history; cancel restores the initial stamp.
      c.beginStroke();
      try {
        for (const pose of POSES) {
          const started = performance.now();
          c.stampShape(
            {
              ...d,
              transform: {
                position: pose.positionMM.map((v) => v / 50),
                rotation: pose.rotationXYZ,
                scale: [pose.uniformScale, pose.uniformScale, pose.uniformScale],
              },
            },
            true,
          );
          row.warm.push({ wallMs: performance.now() - started, ...c.lastStampStats });
        }
      } catch (error) {
        row.continuousRejection = error.message;
      }
      c.cancelStroke();
      assert.equal(hash(v.values), destinationHash);
      assert.equal(hash(restored.layer.volume.values), masterHash);
      row.masterUnchanged = true;
      row.exactUndoRedo = true;
      // First-application repeat observations include real Undo/application work separately.
      row.reapplied = [];
      for (let repeat = 0; repeat < 2; repeat++) {
        c.undo();
        const t = performance.now();
        try {
          c.stampShape(d);
        } catch (error) {
          row.reapplyRejection = error.message;
          c.undo(true);
          break;
        }
        row.reapplied.push({ wallMs: performance.now() - t, ...c.lastStampStats });
        assert.equal(hash(v.values), destinationHash);
      }
      report.rows.push(row);
      flush();
      console.log(
        `${fixture.id} ${n} ${operation}: first ${firstMs.toFixed(1)} ms; warm mean ${(row.warm.reduce((s, v) => s + v.wallMs, 0) / 20).toFixed(1)} ms; deviation ${row.sourceToResult.maxMM?.toFixed(3)} mm; topology ${JSON.stringify(row.topology)}`,
      );
      c.dispose();
    }
  library.close();
  restoredLibrary.close();
}
flush();
console.log(output);
