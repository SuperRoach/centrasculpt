import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector";
import { arch, cpus, platform } from "node:os";
import { promisify } from "node:util";
import { createHeadlessEditor } from "./headless-enclosure.mjs";

const { IndependentLayers } = await import("../work/test-build/independent-layers.mjs");
const { SDFVolume } = await import("../work/test-build/sdf.mjs");
const { openSculptProject, saveSculptProject } = await import("../work/test-build/project.mjs");
const fixtures = (
  process.env.BOOLEAN_BENCH_FIXTURES ?? "box,enclosure,pattern,repeated,dense,moving,192"
).split(",");
const enclosurePath =
  process.env.BOOLEAN_BENCH_ENCLOSURE ?? "work/phase-8-9a/electronics-default-20-compact.form";
const session = process.env.BOOLEAN_BENCH_ALLOCATIONS === "1" ? new Session() : null;
session?.connect();
const profiler = session ? promisify(session.post.bind(session)) : null;
const warmups = 1;
const repeats = Number(process.env.BOOLEAN_BENCH_REPEATS ?? 3);
const results = [];

function hashArrays(arrays) {
  const hash = createHash("sha256");
  for (const array of arrays)
    hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  return hash.digest("hex");
}

function allocationSummary(profile) {
  const bytes = { colour: 0, mesh: 0, other: 0 };
  const frames = new Map();
  function visit(node, category) {
    const { functionName, url } = node.callFrame;
    if (["extractRegion", "geometryFromRegions", "rebuildChunks"].includes(functionName))
      category = "mesh";
    if (["cooperativeColours", "prepareCompositeColour", "setChunkColours"].includes(functionName))
      category = "colour";
    bytes[category] += node.selfSize;
    const key = `${url.split("/").at(-1) || "runtime"} · ${functionName}`;
    frames.set(key, (frames.get(key) ?? 0) + node.selfSize);
    for (const child of node.children) visit(child, category);
  }
  visit(profile.head, "other");
  return {
    sampledBytes: bytes,
    samples: profile.samples.length,
    topFrames: [...frames].sort((a, b) => b[1] - a[1]).slice(0, 15),
  };
}

for (const fixture of fixtures) {
  for (let run = -warmups; run < repeats; run++) {
    const layers =
      fixture === "enclosure"
        ? new IndependentLayers(
            openSculptProject(Uint8Array.from(readFileSync(enclosurePath)).buffer),
          )
        : createHeadlessEditor().layers;
    const composite = layers.composite;
    const stack = layers.project.layerStack;
    try {
      let cutter;
      if (fixture === "enclosure" && stack.layers.length !== 20)
        throw new Error("Expected the 20-source electronics enclosure");
      if (fixture !== "enclosure") {
        const box = await layers.regeneratePrimitive({
          kind: "box",
          width: 0.4,
          height: 0.3,
          depth: 0.1,
        });
        cutter = await layers.regeneratePrimitive(
          fixture === "192"
            ? { kind: "box", width: 0.004, height: 0.2, depth: 0.04, cornerRadius: 0.001 }
            : {
                kind: "cylinder",
                diameter: fixture === "pattern" ? 0.025 : 0.04,
                height: fixture === "pattern" ? 0.16 : 0.2,
              },
        );
        const pose = structuredClone(cutter.transform);
        pose.rotation[0] = Math.PI / 2;
        if (fixture === "pattern") pose.position[0] = -0.1595;
        layers.setActiveTransform(pose);
        const operands = Array.from({ length: fixture === "repeated" ? 20 : 1 }, () => cutter);
        if (fixture === "pattern") {
          for (let i = 1; i < 12; i++) {
            const tool = await layers.regeneratePrimitive(cutter.primitive);
            pose.position[0] = -0.1595 + i * 0.029;
            layers.setActiveTransform(pose);
            operands.push(tool);
          }
        }
        layers.setBooleanModifiers(
          box.id,
          operands.map((source, i) => ({
            id: `hole-${i}`,
            sourceId: source.id,
            operation: "difference",
            enabled: true,
          })),
        );
        if (fixture === "dense") {
          const volume = new SDFVolume(128, 0.3, false);
          for (let z = 0; z < 128; z++)
            for (let y = 0; y < 128; y++)
              for (let x = 0; x < 128; x++) {
                const px = volume.coordinate(x),
                  py = volume.coordinate(y),
                  pz = volume.coordinate(z);
                volume.values[volume.index(x, y, z)] =
                  Math.hypot(px, py, pz) - 0.195 + 0.008 * Math.sin(110 * px) * Math.sin(90 * py);
              }
          box.primitive = undefined;
          box.primitiveOriginal = undefined;
          layers.replaceVolume(layers.runtime(box.id), volume);
        }
      }
      composite.setQuality(fixture === "192" ? 192 : 128);
      for (let edit = 0; edit < (fixture === "moving" ? 6 : 1); edit++) {
        if (fixture === "moving") {
          composite.setInteractive(edit < 3);
          if (edit < 3) {
            const pose = structuredClone(cutter.transform);
            pose.position[0] = edit * 0.025;
            composite.setPrimitivePreview(cutter.id, cutter.primitive, pose);
          } else if (edit >= 4) {
            const pose = structuredClone(cutter.transform);
            pose.position[0] = (edit - 3) * 0.05;
            layers.select(cutter.id);
            layers.setActiveTransform(pose);
          }
        }
        const savedBefore = Buffer.from(saveSculptProject(layers.project));
        globalThis.gc?.();
        const initial = process.memoryUsage();
        const peak = { ...initial };
        let trackedPeak = layers.trackedBytes + composite.trackedBytes;
        const observeMemory = () => {
          for (const [key, value] of Object.entries(process.memoryUsage()))
            peak[key] = Math.max(peak[key], value);
          trackedPeak = Math.max(trackedPeak, layers.trackedBytes + composite.trackedBytes);
        };
        const observe = setInterval(observeMemory, 8);
        const passes = [];
        let colourMs = 0,
          colourBuffers = 0,
          colourBytes = 0;
        const cooperative = composite.cooperativeColours;
        composite.cooperativeColours = async function (...args) {
          const start = performance.now();
          const result = await cooperative.apply(this, args);
          colourMs += performance.now() - start;
          if (result?.colours) {
            colourBuffers++;
            colourBytes += result.colours.byteLength;
          }
          return result;
        };
        if (profiler)
          await profiler("HeapProfiler.startSampling", {
            samplingInterval: 32768,
            includeObjectsCollectedByMajorGC: true,
            includeObjectsCollectedByMinorGC: true,
          });
        const begin = performance.now();
        try {
          do {
            if (!(await composite.rebuild(true))) throw new Error("Build did not publish");
            const timeToPublishMs = performance.now() - begin;
            observeMemory();
            const geometryBytes = composite.mesher
              .snapshotUpdates()
              .reduce(
                (bytes, { geometry }) =>
                  bytes +
                  Object.values(geometry.attributes).reduce(
                    (total, attribute) => total + attribute.array.byteLength,
                    0,
                  ),
                0,
              );
            passes.push({
              geometryBytes,
              ...composite.stats,
              timeToPublishMs,
              colourMs,
              colourBuffers,
              colourBytes,
            });
            colourMs = colourBuffers = colourBytes = 0;
          } while (composite.pending);
        } finally {
          clearInterval(observe);
          composite.cooperativeColours = cooperative;
        }
        const allocationProfile = profiler
          ? allocationSummary((await profiler("HeapProfiler.stopSampling")).profile)
          : undefined;
        if (!savedBefore.equals(Buffer.from(saveSculptProject(layers.project))))
          throw new Error("Preview changed native save");
        const geometry = composite.mesher.snapshotUpdates().map((u) => u.geometry);
        results.push({
          fixture,
          run,
          edit,
          sourceCount: stack.layers.length,
          passes,
          initial,
          peak,
          trackedPeak,
          field: hashArrays([composite.volume.values]),
          mesh: hashArrays(
            geometry.flatMap((g) =>
              ["position", "normal"].map((name) => g.getAttribute(name).array),
            ),
          ),
          colour: hashArrays(
            geometry.flatMap((g) => {
              const attribute = g.getAttribute("color");
              return attribute ? [attribute.array] : [];
            }),
          ),
          ...(allocationProfile ? { allocationProfile } : {}),
        });
      }
    } finally {
      layers.dispose();
    }
  }
}
mkdirSync("work/phase-8-9c", { recursive: true });
writeFileSync(
  process.argv[2] ?? "work/phase-8-9c/results.json",
  JSON.stringify(
    {
      node: process.version,
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0].model,
      warmups,
      repeats,
      results,
    },
    null,
    2,
  ),
);

session?.disconnect();

if (process.argv[3]) {
  const reference = JSON.parse(readFileSync(process.argv[3], "utf8")).results;
  for (const row of results) {
    const key = `${row.fixture}/${row.run}/${row.edit}`;
    const expected = reference.find(
      (candidate) =>
        candidate.fixture === row.fixture &&
        candidate.run === row.run &&
        candidate.edit === row.edit,
    );
    assert(expected, `Missing benchmark reference for ${key}`);
    for (const name of ["field", "mesh"]) assert.equal(row[name], expected[name], `${key} ${name}`);
    // A transient cutter now owns faces at its evaluated pose. The old preview
    // used the committed cutter pose for colour even when the mesh moved.
    if (row.fixture !== "moving" || row.edit < 1 || row.edit > 2)
      assert.equal(row.colour, expected.colour, `${key} colour`);
  }
}
