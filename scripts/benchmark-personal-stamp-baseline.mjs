/** Offline fixture/sampling preparation only. Never opens a user database. */
import "./compile-core.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { arch, cpus, platform } from "node:os";
import { resolve } from "node:path";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { FIXTURE_VERSION, FIXTURES, POSES } from "./fixtures/personal-stamp-baseline.mjs";

const output = resolve(
  process.argv[2] ?? "work/personal-stamp-baseline",
  new Date().toISOString().replaceAll(":", "-"),
);
mkdirSync(output, { recursive: true });
const hash = (values) =>
  createHash("sha256")
    .update(new Uint8Array(values.buffer, values.byteOffset, values.byteLength))
    .digest("hex");
const settings = {
  mode: "add",
  radius: 0.22,
  strength: 0.35,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const report = {
  fixtureVersion: FIXTURE_VERSION,
  date: new Date().toISOString(),
  runtime: process.version,
  host: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
  scope:
    "Offline dense master generation and read-only interpolation quality. No custom stamp engine, CSG timing, Undo, mesh, cache or Quest acceptance.",
  units: "mm; cube [-50,50]; positive outside; fields divided by 50 for native extent 1",
  memoryMethod:
    "process.memoryUsage snapshots are whole-process observations, not isolated retained bytes or continuous peaks; no forced GC. Dense array bytes are calculated separately.",
  pending: [
    "restored-master stamping",
    "Add/Subtract",
    "pivot/transform/symmetry UI",
    "cold/warm stamp timing",
    "history/chunks",
    "retained/peak browser memory",
    "Quest",
  ],
  poses: POSES,
  rows: [],
};
for (const fixture of FIXTURES) {
  for (const [x, y, z, sign] of fixture.probes)
    assert.equal(Math.sign(fixture.sample(x, y, z)), sign, fixture.id);
  const started = performance.now(),
    master = new SDFVolume(192, 1, false);
  let occupied = 0;
  for (let z = 0; z < 192; z++)
    for (let y = 0; y < 192; y++)
      for (let x = 0; x < 192; x++) {
        const value =
          fixture.sample(
            master.coordinate(x) * 50,
            master.coordinate(y) * 50,
            master.coordinate(z) * 50,
          ) / 50;
        assert(Number.isFinite(value));
        master.values[master.index(x, y, z)] = value;
        if (value < 0) occupied++;
      }
  assert(occupied > 0, `${fixture.id} vanished`);
  const masterHash = hash(master.values),
    project = createBaseProject(master, settings);
  project.activeLayer.name = fixture.id;
  project.displayPreferences = {
    mode: "clay",
    colours: {},
    precision: {
      unit: "mm",
      millimetresPerUnit: 50,
      translationSnapMM: 0,
      angleSnapDegrees: 0,
      measurements: [],
    },
  };
  const native = saveSculptProject(project);
  const reopened = openSculptProject(native);
  assert.equal(hash(reopened.activeLayer.volume.values), masterHash);
  assert.equal(reopened.displayPreferences.precision.millimetresPerUnit, 50);
  writeFileSync(resolve(output, `${fixture.id}.form`), new Uint8Array(native));
  const row = {
    id: fixture.id,
    description: fixture.description,
    masterHash,
    nativeSHA256: hash(new Uint8Array(native)),
    masterOccupiedVoxels: occupied,
    masterStepMM: master.step * 50,
    masterValuesBytes: master.values.byteLength,
    masterValuesPlusScratchBytes: master.values.byteLength * 2,
    generationAndNativeRoundtripMs: performance.now() - started,
    targets: [],
  };
  for (const resolution of [64, 128, 192]) {
    // Cell-centre probes avoid trivial exact lattice agreement at equal resolutions.
    const stepMM = 100 / (resolution - 1),
      start = performance.now();
    let count = 0,
      sum = 0,
      max = 0,
      signDisagreements = 0;
    for (let z = -45; z < 45; z += stepMM)
      for (let y = -45; y < 45; y += stepMM)
        for (let x = -45; x < 45; x += stepMM) {
          const reference = fixture.sample(x, y, z);
          if (Math.abs(reference) > 2 * stepMM) continue;
          const sampled = master.sampleLocal({ x: x / 50, y: y / 50, z: z / 50 }) * 50;
          const error = Math.abs(sampled - reference);
          sum += error;
          max = Math.max(max, error);
          count++;
          if (sampled < 0 !== reference < 0) signDisagreements++;
        }
    assert(count > 0);
    row.targets.push({
      resolution,
      destinationStepMM: stepMM,
      featureWidthsInDestinationVoxels: fixture.featuresMM.map((v) => v / stepMM),
      nearSurfaceProbeCount: count,
      meanFieldErrorMM: sum / count,
      maxFieldErrorMM: max,
      signDisagreements,
      probeMs: performance.now() - start,
      destinationValuesPlusScratchBytes: resolution ** 3 * 8,
    });
  }
  assert.equal(hash(master.values), masterHash, "read-only probes changed master");
  row.processMemorySnapshot = process.memoryUsage();
  report.rows.push(row);
  console.log(`${fixture.id}: native roundtrip exact, ${occupied} occupied voxels`);
  writeFileSync(resolve(output, "baseline.json"), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(`Prepared ${report.rows.length} fixtures: ${output}`);
