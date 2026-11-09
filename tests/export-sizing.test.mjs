import assert from "node:assert/strict";
import test from "node:test";
import { Box3, BoxGeometry } from "three";
import { installFileReader, readGlb } from "../scripts/fixtures/export-node.mjs";
import { encodeExport } from "../work/test-build/glb-export.mjs";
import {
  exportSizing,
  physicalExportDimensionsMM,
  physicalGLBSources,
} from "../work/test-build/physical-units.mjs";
import { encodeSTL } from "../work/test-build/stl-export.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

installFileReader();
test("443 mm fixture retains 1:1 and explicit 200/100 targets agree in actual STL/GLB files", async () => {
  const geometry = new BoxGeometry(4.43, 1, 0.5).toNonIndexed();
  const sources = [
    {
      name: "443 mm measured fixture",
      transform: identityTransform(),
      step: 0.01,
      chunks: [
        {
          positions: geometry.attributes.position.array,
          normals: geometry.attributes.normal.array,
        },
      ],
    },
  ];
  const before = sources[0].chunks[0].positions.slice();
  const dimensions = physicalExportDimensionsMM(sources, 100);
  assert(Math.abs(dimensions[0] - 443) < 0.001);
  for (const [mode, target] of [
    ["actual", 443],
    ["target", 200],
    ["target", 100],
  ]) {
    const sizing =
      mode === "actual" ? exportSizing(dimensions) : exportSizing(dimensions, mode, target);
    const stl = await encodeSTL(sources, "standard", 256 * 1024 ** 2, sizing.longestMM);
    assert.deepEqual(stl.report.blocking, []);
    assert.equal(stl.report.boundaryEdges, 0);
    assert.equal(stl.report.inconsistentEdges, 0);
    const view = new DataView(stl.data),
      points = [];
    for (let f = 0; f < view.getUint32(80, true); f++)
      for (let k = 0; k < 3; k++) points.push(view.getFloat32(96 + f * 50 + k * 12, true));
    assert(Math.abs(Math.max(...points) - Math.min(...points) - target) < 0.001);
    const glb = await encodeExport(
      physicalGLBSources(sources, 100 * sizing.scale),
      "standard",
      256 * 1024 ** 2,
    );
    const parsed = await readGlb(glb.data);
    const box = new Box3().setFromObject(parsed.scene);
    assert(Math.abs((box.max.x - box.min.x) * 1000 - target) < 0.001);
  }
  assert.deepEqual(sources[0].chunks[0].positions, before);
  assert.equal(exportSizing(dimensions, "target").longestMM, 200);
  for (const target of [0, NaN, Infinity, 10001])
    assert.throws(() => exportSizing(dimensions, "target", target));
  geometry.dispose();
});
