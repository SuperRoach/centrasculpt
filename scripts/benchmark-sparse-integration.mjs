import "./compile-core.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { SculptHistory } from "../work/test-build/history.mjs";
import { IncrementalMesher } from "../work/test-build/mesh.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { SparseSDFVolume } from "../work/test-build/sparse-sdf.mjs";
import { strokeTrace } from "./research/compact-sculpt/trace.mjs";

const [tracePath, outputPath, option] = process.argv.slice(2);
assert(tracePath && outputPath, "Pass the existing metre-scale trace JSON and a result path.");
const compactTools = option === "--compact-tools";
const metre = compactTools ? null : JSON.parse(readFileSync(tracePath, "utf8"));
assert(compactTools || metre.complete);
const compact = strokeTrace();
const toolModes = ["inflate", "flatten", "scrape", "pinch", "crease"];
if (compactTools) {
  const features = compact.filter(({ phase }) => phase === "detail");
  for (const mode of toolModes)
    for (let pass = 0; pass < 4; pass++)
      for (const { b, radius } of features) compact.push({ phase: mode, mode, a: b, b, radius });
}
const workloads = [
  { kind: "compact", resolution: 129, extent: 0.064, strokes: compact },
  ...(metre?.cases ?? []).map(({ kind, strokes }) => ({
    kind,
    resolution: 192,
    extent: 0.54,
    strokes: strokes.map((stroke) => ({ ...stroke, phase: kind, radius: 6 })),
  })),
];

const point = ([x, y, z]) => ({ x: x / 1000, y: y / 1000, z: z / 1000 });
const percentiles = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return [0.5, 0.95, 0.99].map((p) => sorted[Math.ceil(p * sorted.length) - 1]);
};

function replay({ kind, resolution, extent, strokes }, sparse) {
  const volume = sparse
    ? new SparseSDFVolume(resolution, extent)
    : new SDFVolume(resolution, extent, false);
  if (!sparse) volume.values.fill(extent * 4);
  const mesher = new IncrementalMesher(volume),
    history = new SculptHistory(volume, 32 * 1024 ** 2, 4),
    checkpoints = [],
    trials = [];
  const tolerance = -volume.step * Number.EPSILON * 32;
  function checkpoint(kind) {
    const hash = createHash("sha256"),
      surface = createHash("sha256");
    const row = new Float32Array(resolution);
    for (let z = 0; z < resolution; z++)
      for (let y = 0; y < resolution; y++) {
        const begin = volume.index(0, y, z);
        if (sparse) volume.gather({ min: [0, y, z], max: [resolution - 1, y, z] }, row);
        else row.set(volume.values.subarray(begin, begin + resolution));
        hash.update(new Uint8Array(row.buffer));
      }
    for (const { id, geometry } of mesher.snapshotUpdates()) {
      if (!geometry.getAttribute("position").count) continue;
      surface.update(mesher.chunkKey(id));
      for (const name of ["position", "normal"])
        surface.update(new Uint8Array(geometry.getAttribute(name).array.buffer));
    }
    checkpoints.push({
      kind,
      field: hash.digest("hex"),
      mesh: surface.digest("hex"),
      triangles: mesher.triangles,
      voxelBytes: sparse ? volume.residentBytes + volume.scratchBytes : resolution ** 3 * 8,
      haloBytes: mesher.haloBytes,
      meshBytes: mesher.ownedGeometryBytes,
      historyBytes: history.memoryBytes,
    });
  }
  function action(mode, edit) {
    const invalidate = mesher.stampInvalidator();
    const start = performance.now();
    const result = edit((index, before, after) => {
      if (sparse) invalidate(index, before < tolerance !== after < tolerance);
    });
    if (!sparse) mesher.invalidate(result);
    const brushMs = performance.now() - start,
      queue = mesher.pendingChunks,
      slices = [];
    for (let update = mesher.rebuildChunks(4, 2); update; update = mesher.rebuildChunks(4, 2))
      slices.push(update.stats.milliseconds);
    trials.push({ mode, brushMs, totalMs: performance.now() - start, queue, slices });
  }
  try {
    while (mesher.rebuildChunks(4, 2)) {}
    checkpoint("empty");
    const toolCenters = new Map();
    strokes.forEach(({ mode, a, b, radius, phase }, index) => {
      const local = toolModes.includes(mode);
      if (local && !toolCenters.has(b)) {
        const target = point(b);
        let closest = Infinity,
          center;
        for (const { geometry } of mesher.snapshotUpdates()) {
          const positions = geometry.getAttribute("position").array;
          for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i],
              y = positions[i + 1],
              z = positions[i + 2];
            const distance = (x - target.x) ** 2 + (y - target.y) ** 2 + (z - target.z) ** 2;
            if (distance < closest) {
              closest = distance;
              center = { x, y, z };
            }
          }
        }
        assert(center);
        toolCenters.set(b, center);
      }
      const center = local ? toolCenters.get(b) : point(b);
      action(mode, (invalidate) => {
        history.begin();
        const construct = mode === "construct";
        const record = (id, before, after) => {
          history.record(id, before, after);
          invalidate(id, before, after);
        };
        if (sparse && compactTools) {
          record.hasPendingSample = (id) => history.hasPendingSample(id);
          record.reservePendingSamples = (count) => history.reservePendingSamples(count);
        }
        const bounds = volume.brush(
          center,
          radius / 1000,
          construct ? "add" : mode,
          mode === "smooth" ? 0.5 : 0.0005,
          record,
          construct ? 1 : 0,
          construct,
          1,
          local ? center : point(a),
        );
        if (local) assert(bounds, `Expected a field edit for ${mode}.`);
        history.commit();
        return bounds;
      });
      if (index === 0) checkpoint("first dab");
      if (strokes[index + 1]?.phase !== phase) checkpoint(phase);
    });
    action("undo", (invalidate) => history.undo(invalidate));
    checkpoint("undo");
    action("redo", (invalidate) => history.redo(invalidate));
    checkpoint("redo");
    return {
      kind,
      resolution,
      spacingMm: volume.step * 1000,
      checkpoints,
      trials,
      maxRssKiB: process.resourceUsage().maxRSS,
    };
  } finally {
    mesher.dispose();
  }
}

const reports = [];
for (const workload of workloads)
  for (let run = 0; run < 2; run++) {
    const [dense, sparse] =
      run === 0
        ? [replay(workload, false), replay(workload, true)]
        : [replay(workload, true), replay(workload, false)].reverse();
    const signature = (data) =>
      data.checkpoints.map(({ kind, field, mesh, triangles }) => ({
        kind,
        field,
        mesh,
        triangles,
      }));
    assert.deepEqual(signature(sparse), signature(dense));
    assert.deepEqual(signature(sparse).at(-1), { ...signature(sparse).at(-3), kind: "redo" });
    reports.push({ run, dense, sparse });
  }
writeFileSync(outputPath, JSON.stringify(reports, null, 2));
for (const workload of workloads) {
  for (const backend of ["dense", "sparse"]) {
    const runs = reports
      .map((report) => report[backend])
      .filter((run) => run.kind === workload.kind);
    const trials = runs.flatMap((run) => run.trials);
    const modes = Object.fromEntries(
      [...new Set(trials.map((row) => row.mode))].map((mode) => [
        mode,
        percentiles(trials.filter((row) => row.mode === mode).map((row) => row.totalMs)),
      ]),
    );
    console.log(
      workload.kind,
      backend,
      JSON.stringify({
        modes,
        sliceMs: percentiles(trials.flatMap((row) => row.slices)),
        maxQueue: Math.max(...trials.map((row) => row.queue)),
        maxSlices: Math.max(...trials.map((row) => row.slices.length)),
        finish: runs[0].checkpoints.at(-3),
      }),
    );
  }
}
