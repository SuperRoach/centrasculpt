import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseBenchmarkOptions, summarise } from "../scripts/fixtures/export-benchmark-options.mjs";
import { ExportWork } from "../work/test-build/export-mesh.mjs";

test("benchmark options reject unsafe resolution, unknown fixture and invalid repeat counts", () => {
  for (const args of [
    ["--resolutions", "512"],
    ["--fixtures", "user"],
    ["--repeats", "0"],
    ["--warmup", "-1"],
    ["--formats", "obj"],
    ["--typo", "1"],
  ])
    assert.throws(() => parseBenchmarkOptions(args));
  assert.deepEqual(parseBenchmarkOptions(["--resolutions", "192,256"]).resolutions, [192, 256]);
});
test("benchmark summary excludes discarded runs, retains refusals and reports even medians", () => {
  const row = (repeat, pipelineWallMs, refused) => ({
    name: "fixture",
    resolution: 192,
    quality: "fast",
    format: "stl",
    repeat,
    pipelineWallMs,
    refused,
    qualities: [],
  });
  const [summary] = summarise([
    row(-1, 999),
    row(0, 10),
    row(1, 20),
    row(2, undefined, "bounded refusal"),
  ]);
  assert.equal(summary.runs, 3);
  assert.equal(summary.medianMs, 15);
  assert.deepEqual(summary.refusals, ["bounded refusal"]);
  const valid = { ...row(0, 10), qualities: [{ report: { blocking: [] } }] };
  assert.deepEqual(summarise([valid])[0].refusals, []);
});
test("benchmark guard causes remain exact and refuse cancellation and stale sources", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    new ExportWork(controller.signal).pause("probe", 0, 1),
    /Export cancelled\.$/,
  );
  await assert.rejects(
    new ExportWork(undefined, () => false).pause("probe", 0, 1),
    /Export cancelled: source changed\.$/,
  );
});
test("isolated benchmark repeats preserve native bytes/history and produce independently counted STL", async () => {
  const output = await mkdtemp(join(tmpdir(), "centra-export-bench-"));
  try {
    const rows = [];
    for (let repeat = 0; repeat < 2; repeat++) {
      const run = spawnSync(
        process.execPath,
        [
          "scripts/benchmark-export-diagnose.mjs",
          "--child",
          JSON.stringify({
            name: "clay",
            resolution: 192,
            quality: "high",
            format: "stl",
            repeat,
            output,
          }),
        ],
        { encoding: "utf8", timeout: 60000 },
      );
      assert.equal(run.status, 0, run.stderr);
      const row = JSON.parse(run.stdout);
      rows.push(row);
      assert.equal(row.preserved, true);
      assert.ok(row.preparation.extractionMs >= 0);
      assert.ok(row.preparation.precompactionMs >= 0);
      assert.equal(row.qualities[0].refused, undefined);
      const bytes = await readFile(join(output, "clay-192-high.stl"));
      assert.equal(bytes.length, 84 + bytes.readUInt32LE(80) * 50);
      assert.equal(row.qualities[0].report.nonManifoldEdges, 0);
    }
    assert.equal(rows[0].preparedTriangles, rows[1].preparedTriangles);
    assert.deepEqual(rows[0].encodedDimensions, rows[1].encodedDimensions);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("silhouette diagnostics ignore winding and detect changed projected coverage", async () => {
  const { silhouetteMasks, silhouettePNG } = await import(
    "../scripts/fixtures/export-silhouette.mjs"
  );
  const p = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const reverse = new Float32Array([0, 1, 0, 1, 0, 0, 0, 0, 0]);
  const masks = silhouetteMasks(p, 2);
  assert.deepEqual(masks, silhouetteMasks(reverse, 2));
  const small = silhouetteMasks(p, 4);
  assert.ok(masks[2].reduce((a, v) => a + v, 0) > small[2].reduce((a, v) => a + v, 0));
  const png = silhouettePNG(masks);
  assert.equal(png.readUInt32BE(16), 900);
  assert.equal(png.readUInt32BE(20), 300);
});

test("benchmark child retains exact refusal/cancel/stale reasons and source preservation", async () => {
  const output = await mkdtemp(join(tmpdir(), "centra-bench-probes-"));
  try {
    for (const [probe, reason] of [
      ["cancel", /^Export cancelled\.$/],
      ["stale", /^Export cancelled: source changed\.$/],
      ["memory", /memory/],
    ]) {
      const run = spawnSync(
        process.execPath,
        [
          "scripts/benchmark-export-diagnose.mjs",
          "--child",
          JSON.stringify({
            name: "clay",
            resolution: 192,
            quality: "high",
            format: "stl",
            probe,
            output,
            repeat: 0,
          }),
        ],
        { encoding: "utf8", timeout: 60000 },
      );
      assert.equal(run.status, 0, run.stderr);
      const row = JSON.parse(run.stdout);
      assert.equal(row.preserved, true);
      assert.match(row.qualities[0].refused, reason);
      assert.equal(row.pipelineWallMs, undefined);
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("native-copy benchmark reads persisted calibration without rewriting its input", async () => {
  const { LayerStack, SculptProject, SdfLayer } = await import("../work/test-build/layers.mjs");
  const { saveSculptProject } = await import("../work/test-build/project.mjs");
  const { SDFVolume } = await import("../work/test-build/sdf.mjs");
  const { defaultPrecision } = await import("../work/test-build/physical-units.mjs");
  const output = await mkdtemp(join(tmpdir(), "centra-bench-native-"));
  try {
    const project = new SculptProject(new LayerStack([new SdfLayer(new SDFVolume(17))]), {
      mode: "add",
      radius: 0.2,
      strength: 0.35,
      hardness: 0.5,
      camera: { position: [2, 2, 3], target: [0, 0, 0] },
    });
    project.displayPreferences = {
      mode: "clay",
      colours: {},
      precision: { ...defaultPrecision(), millimetresPerUnit: 37 },
    };
    const original = Buffer.from(saveSculptProject(project)),
      native = join(output, "source.form");
    await writeFile(native, original);
    await chmod(native, 0o444);
    const run = spawnSync(
      process.execPath,
      [
        "scripts/benchmark-export-diagnose.mjs",
        "--child",
        JSON.stringify({
          name: "native-test",
          resolution: 192,
          quality: "fast",
          format: "glb",
          output,
          native,
          repeat: 0,
        }),
      ],
      { encoding: "utf8", timeout: 60000 },
    );
    assert.equal(run.status, 0, run.stderr);
    const row = JSON.parse(run.stdout);
    assert.equal(row.mmPerUnit, 37);
    assert.equal(row.preserved, true);
    assert.equal(row.qualities[0].refused, undefined);
    assert.deepEqual(await readFile(native), original);
    assert.equal(row.units, "m");
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
