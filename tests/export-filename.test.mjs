import assert from "node:assert/strict";
import test from "node:test";
import { exportFilename } from "../work/test-build/export-filename.mjs";

test("selected layer name is preserved with the selected file extension", () => {
  assert.equal(exportFilename("My vase", "stl"), "My vase.stl");
  assert.equal(exportFilename("My vase", "glb"), "My vase.glb");
  assert.equal(exportFilename("Vase.stl", "glb"), "Vase.glb");
  assert.equal(exportFilename("Café", "stl"), "Café.stl");
});
test("export names cannot contain path separators, controls or reserved Windows device names", () => {
  assert.equal(exportFilename("Part/A:B", "stl"), "Part-A-B.stl");
  assert.equal(exportFilename("CON", "stl"), "_CON.stl");
  assert.equal(exportFilename("...", "glb"), "sculpt.glb");
  assert(!exportFilename("a\u0000b", "stl").includes("\u0000"));
});
