// Serial paired runs. Each mode gets its own cold process and same-process warm repeat.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";

if (process.argv[2] === "--pair") {
  const config = JSON.parse(process.argv[3]);
  for (let repeat = 0; repeat < 2; repeat++) {
    process.argv = [
      process.execPath,
      import.meta.filename,
      "--child",
      JSON.stringify({ ...config, repeat }),
    ];
    await import(`./benchmark-export-diagnose.mjs?repeat=${repeat}`);
  }
} else {
  await import("./compile-core.mjs");
  const matrix = process.argv.includes("--production-matrix");
  const enclosure = process.argv.includes("--enclosure-only");
  process.argv = process.argv.filter((arg) => arg !== "--enclosure-only");
  process.argv = process.argv.filter((arg) => arg !== "--production-matrix");
  const base = matrix ? "work/phase-7-5-4c" : "work/phase-7-5-4b";
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(`${base}/run-`);
  console.error(root);
  const rows = [];
  const reverse = process.argv[2] === "--reverse";
  const native = process.argv[reverse ? 3 : 2];
  if (native && (await stat(native)).mode & 0o222)
    throw new Error("Supply a write-disabled native copy.");
  const cases = enclosure
    ? [
        ["enclosure", 192],
        ["enclosure", 256],
      ]
    : native
      ? [
          ["native-copy", 192],
          ["native-copy", 256],
        ]
      : [
          ["clay", 192],
          ["boolean-array", 192],
          ["curved-192", 192],
          ["holder-443", 192],
          ["holder-443", 256],
        ];
  for (const [name, resolution] of matrix
    ? [...new Set(cases.map(([name]) => name))].flatMap((name) => [
        [name, 192],
        [name, 256],
      ])
    : cases) {
    for (const quality of matrix ? ["fast", "high"] : ["fast"]) {
      for (const experimentalChunk of reverse ? [true, false] : [false, true]) {
        const output = `${root}/${name}-${resolution}-${quality}-${experimentalChunk}`;
        await mkdir(output);
        const config = {
          name,
          resolution,
          quality,
          format: "stl",
          experimentalChunk,
          output,
          native,
        };
        const child = spawnSync(
          process.execPath,
          [import.meta.filename, "--pair", JSON.stringify(config)],
          { encoding: "utf8", timeout: 600000 },
        );
        if (child.status !== 0) throw new Error(child.stderr || String(child.error));
        for (const line of child.stdout.trim().split("\n")) rows.push(JSON.parse(line));
        await writeFile(`${root}/rows.json`, JSON.stringify(rows, null, 2));
        console.error(
          name,
          resolution,
          experimentalChunk,
          rows.at(-1).pipelineWallMs ?? rows.at(-1).refused ?? rows.at(-1).qualities[0]?.refused,
        );
      }
      const group = rows.filter(
        (r) => r.name === name && r.requestedResolution === resolution && r.quality === quality,
      );
      assert.equal(group.length, 4);
      for (const row of group) {
        assert.ok(row.preserved);
        const first = group[0];
        assert.equal(row.refused, first.refused);
        assert.equal(row.qualities[0]?.refused, first.qualities[0]?.refused);
        assert.deepEqual(row.qualities[0]?.report, first.qualities[0]?.report);
        assert.equal(row.qualities[0]?.sha256, first.qualities[0]?.sha256);
        assert.equal(row.preparedTriangles, first.preparedTriangles);
        assert.deepEqual(row.encodedDimensions, first.encodedDimensions);
        assert.deepEqual(row.qualities[0]?.residualBins, first.qualities[0]?.residualBins);
        assert.equal(row.qualities[0]?.probeResidualMM, first.qualities[0]?.probeResidualMM);
      }
    }
  }
}
