import "./compile-core.mjs";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { createPersonalStamp, personalStampSource } from "../work/test-build/personal-stamp.mjs";
import { openSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { defineShape } from "../work/test-build/shapes.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";
import { FIXTURES } from "./fixtures/personal-stamp-baseline.mjs";

const parent = process.argv[2];
if (!parent) throw new Error("Provide the completed benchmark output directory.");
const report = JSON.parse(readFileSync(resolve(parent, "results.json"), "utf8")),
  rows = [];
const settings = {
  mode: "add",
  radius: 0.22,
  strength: 0.35,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
function crossings(sample, origin, direction) {
  const at = (t) =>
    sample({
      x: (origin[0] + direction[0] * t) / 50,
      y: (origin[1] + direction[1] * t) / 50,
      z: (origin[2] + direction[2] * t) / 50,
    });
  const roots = [];
  let last = -50,
    value = at(last);
  for (let i = 1; i <= 2000; i++) {
    const t = -50 + i * 0.05,
      next = at(t);
    if (next < 0 !== value < 0) {
      let lo = last,
        hi = t;
      for (let j = 0; j < 24; j++) {
        const mid = (lo + hi) / 2;
        if (at(mid) < 0 === value < 0) lo = mid;
        else hi = mid;
      }
      roots.push((lo + hi) / 2);
    }
    last = t;
    value = next;
  }
  return roots;
}
for (const fixture of FIXTURES) {
  const bytes = readFileSync(
      `work/personal-stamp-baseline/2026-11-10T12-23-20.143Z/${fixture.id}.form`,
    ),
    p = openSculptProject(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    ),
    personal = createPersonalStamp(p.activeLayer, 1),
    source = personalStampSource(personal);
  let origin = [0, 0, 0],
    direction = [0, 1, 0];
  if (fixture.id.startsWith("long-thin")) {
    const a = (35 * Math.PI) / 180;
    direction = [-Math.sin(a), Math.cos(a), 0];
  }
  if (fixture.id === "hollow-part") {
    origin = [10, 0, 0];
    direction = [0, 0, 1];
  }
  if (["horn", "organic-curve"].includes(fixture.id)) {
    const r = 120 / Math.PI;
    origin = [r * (Math.SQRT1_2 - 0.5), r * (Math.SQRT1_2 - 0.5), 0];
    direction = [0, 0, 1];
  }
  const sourceCrossingsMM = crossings(
    (point) => p.activeLayer.volume.sampleWorld(point, p.activeLayer.transform),
    origin,
    direction,
  );
  for (const old of report.rows.filter((r) => r.id === fixture.id)) {
    const { n, operation } = old;
    if (old.rejected) {
      rows.push({ id: fixture.id, n, operation, rejected: old.rejected });
      continue;
    }
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
    const c = new IndependentLayers(createBaseProject(v, settings));
    try {
      const d = defineShape({
        kind: "box",
        personal,
        operation,
        targetLayerId: c.project.activeLayerId,
        dimensions: [source.size, source.size, source.size],
        transform: identityTransform(),
      });
      assert(c.stampShape(d));
      const resultCrossingsMM = crossings(
        (point) => v.sampleLocal(point) * (operation === "subtract" ? -1 : 1),
        origin,
        direction,
      ).filter((t) => Math.abs(t) < 42);
      rows.push({
        id: fixture.id,
        n,
        operation,
        originMM: origin,
        direction,
        sourceCrossingsMM,
        resultCrossingsMM,
        sourceIntervalsMM: sourceCrossingsMM.slice(1).map((v, i) => v - sourceCrossingsMM[i]),
        resultIntervalsMM: resultCrossingsMM.slice(1).map((v, i) => v - resultCrossingsMM[i]),
        sameCrossingCount: sourceCrossingsMM.length === resultCrossingsMM.length,
      });
    } finally {
      c.dispose();
    }
  }
  console.log(`${fixture.id}: detail cross-sections measured`);
}
writeFileSync(
  resolve(parent, "detail.json"),
  JSON.stringify(
    {
      method:
        "Physical mm cross-sections through actual destination trilinear SDF, 0.05 mm bracketing and 24 bisections. Intervals include solid and void spans, not a global minimum-feature certificate. Masters are the native fixtures whose exact restored hashes were validated by the matrix. Subtract host outer boundary excluded at |t| >= 42 mm.",
      rows,
    },
    null,
    2,
  ),
);
