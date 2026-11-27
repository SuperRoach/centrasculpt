import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import "./compile-core.mjs";

const { sampleBake } = await import("../work/test-build/bake.mjs");
const { compositeLayout } = await import("../work/test-build/compositor.mjs");
const { IndependentLayers } = await import("../work/test-build/independent-layers.mjs");
const { createBaseProject, SdfLayer } = await import("../work/test-build/layers.mjs");
const { IncrementalMesher } = await import("../work/test-build/mesh.mjs");
const { createPersonalStamp } = await import("../work/test-build/personal-stamp.mjs");
const { openSculptProject } = await import("../work/test-build/project.mjs");
const { SDFVolume } = await import("../work/test-build/sdf.mjs");
const { SparseSDFVolume } = await import("../work/test-build/sparse-sdf.mjs");

const settings = {
  mode: "add",
  radius: 0.2,
  strength: 0.5,
  hardness: 0.6,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const pose = { position: [0, 0, 0], rotation: [0.13, -0.22, 0.18], scale: [1, 1, 1] };
const repetitions = Number(process.env.SPARSE_CSG_REPEATS ?? 3);
const enclosurePath =
  process.env.BOOLEAN_BENCH_ENCLOSURE ?? "work/phase-8-9a/electronics-default-20-compact.form";
const fixtures = (process.env.SPARSE_CSG_FIXTURES ?? "cut,repeated,enclosure,organic").split(",");
const output = process.argv[2] ?? "work/phase-9.4-benchmark.json";

function seededField(storage, n, distance) {
  const volume = storage === "sparse" ? new SparseSDFVolume(n) : new SDFVolume(n, 1.6, false);
  volume.getDenseView()?.fill(6.4);
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const px = volume.coordinate(x),
          py = volume.coordinate(y),
          pz = volume.coordinate(z);
        if (Math.max(Math.abs(px), Math.abs(py), Math.abs(pz)) < 1.27)
          volume.writeVoxel(volume.index(x, y, z), distance(px, py, pz));
      }
  return volume;
}
const box = (x, y, z) => {
  const a = Math.abs(x) - 0.64,
    b = Math.abs(y) - 0.51,
    c = Math.abs(z) - 0.42;
  return (
    Math.hypot(Math.max(a, 0), Math.max(b, 0), Math.max(c, 0)) + Math.min(Math.max(a, b, c), 0)
  );
};
const organic = (x, y, z) =>
  Math.min(Math.hypot(x, y * 0.84, z) - 0.55, Math.hypot(x - 0.42, y + 0.24, z - 0.2) - 0.36) +
  0.06 * Math.sin(13 * x) * Math.cos(11 * y) * Math.sin(9 * z);
const bytes = (v) => v.residentBytes ?? v.getDenseView().byteLength;
function hashField(volume) {
  const n = volume.resolution,
    hash = createHash("sha256");
  for (let z = 0; z < n; z++) {
    const { values } = volume.readRegion({ min: [0, 0, z], max: [n - 1, n - 1, z] });
    hash.update(Buffer.from(values.buffer));
  }
  return hash.digest("hex");
}
function hashMesh(updates) {
  const hash = createHash("sha256");
  let triangles = 0;
  for (const { id, geometry } of [...updates].sort((a, b) => a.id - b.id)) {
    const position = geometry.getAttribute("position");
    if (!position.count) continue;
    hash.update(`${id}:${position.count}:`);
    triangles += position.count / 3;
    for (const key of ["position", "normal"]) {
      const { buffer, byteOffset, byteLength } = geometry.getAttribute(key).array;
      hash.update(Buffer.from(buffer, byteOffset, byteLength));
    }
  }
  return { mesh: hash.digest("hex"), triangles };
}
function signature(volume, updates) {
  return { field: hashField(volume), ...hashMesh(updates) };
}

async function cut(fixture, source, storage) {
  const project = createBaseProject(seededField(source, 49, box), settings);
  const editor = new IndependentLayers(project);
  try {
    const body = editor.active.layer;
    const cutter = await editor.regeneratePrimitive({
      kind: "cylinder",
      diameter: 0.36,
      height: 1.3,
    });
    editor.setActiveTransform({
      ...pose,
      position: [-0.17, 0, 0.13],
      rotation: [0, 0, Math.PI / 2],
    });
    editor.setBooleanModifiers(
      body.id,
      Array.from({ length: fixture === "repeated" ? 20 : 1 }, (_, i) => ({
        id: `cut-${i}`,
        sourceId: cutter.id,
        operation: "difference",
        enabled: true,
      })),
    );
    const baked = await editor.bake({
      name: "Bench cut",
      resolution: 128,
      sourceIds: [body.id],
      hideSources: true,
      storage,
    });
    const stats = editor.lastBakeStats;
    return {
      ...signature(baked.volume, editor.active.exportUpdates()),
      cpuMs: stats.samplingMs + stats.meshingMs,
      wallMs: stats.totalMs,
      fieldBytes: bytes(baked.volume),
      sourceFieldBytes: bytes(body.volume),
      resolution: stats.resolution,
    };
  } finally {
    editor.dispose();
  }
}

// The archived scene occupies all 20 layer slots. Run the production sampling
// and mesh kernels at the 8.9c comparison lattice without inserting a layer.
async function enclosure(storage) {
  const project = openSculptProject(Uint8Array.from(readFileSync(enclosurePath)).buffer);
  const resolution = 128;
  const { extent, center } = compositeLayout(project.layerStack.compositionLayers, resolution);
  const start = performance.now();
  const { volume, samplingMs } = await sampleBake(project, {
    resolution,
    center,
    scale: extent / 1.6,
    storage,
  });
  const mesher = new IncrementalMesher(volume);
  try {
    let meshingMs = 0;
    while (mesher.pendingChunks) meshingMs += mesher.rebuildChunks(8, 3).stats.milliseconds;
    const wallMs = performance.now() - start;
    return {
      ...signature(volume, mesher.snapshotUpdates()),
      cpuMs: samplingMs + meshingMs,
      wallMs,
      fieldBytes: bytes(volume),
      resolution,
    };
  } finally {
    mesher.dispose();
  }
}

function stamp(storage) {
  const editor = new IndependentLayers(
    createBaseProject(seededField(storage, 128, organic), settings),
  );
  try {
    const target = editor.active.layer;
    const source = new SdfLayer(seededField(storage, 41, organic), { transform: pose });
    const personal = createPersonalStamp(source, 0.92);
    editor.symmetry = { enabled: true, axis: "x", offset: -0.04 };
    const edits = [];
    for (const [i, kind, operation, token] of [
      [0, "sphere", "add", undefined],
      [1, "box", "add", personal],
      [2, "box", "subtract", personal],
      [3, "triangular-prism", "subtract", undefined],
    ]) {
      const start = performance.now();
      assert(
        editor.stampShape({
          id: `stamp-${i}`,
          targetLayerId: target.id,
          kind,
          operation,
          transform: { ...pose, position: [0.37 + i * 0.09, 0.2 - i * 0.08, 0.13] },
          dimensions: [0.46, 0.46, 0.46],
          ...(token ? { personal: token } : {}),
        }),
      );
      while (editor.pendingChunks) editor.drainSparseMeshes();
      const cpuMs = performance.now() - start,
        stats = editor.lastStampStats;
      edits.push({
        ...signature(target.volume, editor.active.exportUpdates()),
        kind: token ? "personal" : kind,
        operation,
        cpuMs,
        fieldBytes: bytes(target.volume),
        stagingBytes: stats.peakStagingBytes,
        historyBytes: editor.active.history.memoryBytes,
        scanned: stats.scanned,
        evaluated: stats.evaluated,
      });
    }
    return edits;
  } finally {
    editor.dispose();
  }
}

const results = [];
for (const fixture of fixtures) {
  assert(["cut", "repeated", "enclosure", "organic"].includes(fixture));
  let reference;
  for (let run = -1; run < repetitions; run++) {
    const pairs =
      fixture === "cut" || fixture === "repeated"
        ? [
            ["dense", "dense"],
            ["sparse", "dense"],
            ["dense", "sparse"],
            ["sparse", "sparse"],
          ]
        : [
            ["dense", "dense"],
            ["sparse", "sparse"],
          ];
    if (run % 2 !== 0) pairs.reverse();
    for (const [source, storage] of pairs) {
      globalThis.gc?.();
      const value =
        fixture === "organic"
          ? stamp(storage)
          : fixture === "enclosure"
            ? await enclosure(storage)
            : await cut(fixture, source, storage);
      const hashes = [value]
        .flat()
        .map(({ field, mesh, triangles }) => ({ field, mesh, triangles }));
      reference ??= hashes;
      assert.deepEqual(hashes, reference, `${fixture} ${source} to ${storage}`);
      if (run >= 0)
        results.push({
          fixture,
          run,
          source: fixture === "enclosure" ? "analytic" : source,
          storage,
          value,
        });
      console.log(
        fixture,
        run,
        source,
        storage,
        [value]
          .flat()
          .map((v) => v.cpuMs.toFixed(1))
          .join(" / "),
      );
    }
  }
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    { node: process.version, platform: process.platform, arch: process.arch, results },
    null,
    2,
  ),
);
