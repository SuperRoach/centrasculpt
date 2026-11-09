import assert from "node:assert/strict";
import test from "node:test";
import { compositeLayout, prepareComposite } from "../work/test-build/compositor.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { LayerStack, SculptProject, SdfLayer } from "../work/test-build/layers.mjs";
import { saveSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

const settings = {
  mode: "add",
  radius: 0.22,
  strength: 0.35,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
function source(order) {
  const volume = new SDFVolume(17, 0.2, false);
  for (let z = 0; z < 17; z++)
    for (let y = 0; y < 17; y++)
      for (let x = 0; x < 17; x++)
        volume.values[volume.index(x, y, z)] =
          Math.hypot(volume.coordinate(x), volume.coordinate(y), volume.coordinate(z)) - 0.1;
  return new SdfLayer(volume, {
    order,
    transform: { ...identityTransform(), position: [order * 0.6, 0, 0] },
  });
}
const array = {
  id: "repeated",
  enabled: true,
  kind: "linear",
  count: 16,
  spacingModelUnits: 0.01,
  centered: false,
  axis: [1, 0, 0],
};

test("ten-source interactive preview fits its existing work limit without changing sources or strict export admission", async () => {
  const layers = Array.from({ length: 10 }, (_, i) => source(i));
  const editor = new IndependentLayers(
    new SculptProject(new LayerStack(layers), structuredClone(settings)),
  );
  const before = saveSculptProject(editor.project);
  const history = [editor.undoCount, editor.redoCount];
  try {
    assert.throws(() => compositeLayout(layers, 192), /64 million/);
    assert.equal(compositeLayout(layers.slice(0, 9), 192, false, false, true).resolution, 192);
    const layout = compositeLayout(layers, 192, false, false, true);
    assert.equal(layout.resolution, 185);
    assert.equal(layout.previewWorkCapped, true);
    assert(185 ** 3 * 10 <= 64_000_000 && 186 ** 3 * 10 > 64_000_000);
    await editor.composite.flush();
    assert.equal(editor.composite.stats.resolution, 185);
    assert.equal(editor.composite.stats.previewWorkCapped, true);
    assert.equal(editor.composite.stats.samples, 185 ** 3);
    assert(editor.composite.stats.triangles > 0);
    const volume = editor.composite.volume;
    const evaluate = prepareComposite(layers);
    const center = editor.composite.group.position;
    for (const x of [0, 29, 61, 92, 123, 154, 184])
      for (const y of [0, 91, 92, 184])
        for (const z of [0, 91, 92, 184])
          assert.equal(
            volume.values[volume.index(x, y, z)],
            Math.fround(
              evaluate(
                volume.coordinate(x) + center.x,
                volume.coordinate(y) + center.y,
                volume.coordinate(z) + center.z,
              ),
            ),
          );
    const exportLayout = compositeLayout(layers, 256, true, true);
    assert(exportLayout.resolution > 185);
    assert.equal(exportLayout.previewWorkCapped, undefined);
    assert.throws(() => compositeLayout(layers, 256), /staged export/);
    assert.deepEqual(saveSculptProject(editor.project), before);
    assert.deepEqual([editor.undoCount, editor.redoCount], history);
    editor.composite.setSuspended(true);
    await assert.rejects(editor.composite.flush(), /tracking/);
    editor.composite.setSuspended(false);
    editor.composite.availableBytes = () => 1;
    await assert.rejects(editor.composite.flush(), /memory budget/);
  } finally {
    editor.dispose();
  }
});

test("preview accounting excludes hidden roots but charges shared hidden arrays for every enabled reference", () => {
  const a = source(0),
    b = source(9),
    hidden = source(2);
  hidden.visible = false;
  hidden.array = structuredClone(array);
  const layers = [a, b, hidden];
  const without = compositeLayout([a, b], 192, false, false, true);
  assert.equal(compositeLayout(layers, 192, false, false, true).resolution, without.resolution);
  a.booleanModifiers = [
    { id: "cut-a", sourceId: hidden.id, operation: "difference", enabled: true },
  ];
  b.booleanModifiers = [
    { id: "cut-b", sourceId: hidden.id, operation: "difference", enabled: true },
  ];
  const layout = compositeLayout(layers, 192, false, false, true);
  const work = 2 + 2 * 16;
  assert.equal(layout.resolution, Math.floor(Math.cbrt(64_000_000 / work)));
  assert(layout.resolution ** 3 * work <= 64_000_000);
  assert((layout.resolution + 1) ** 3 * work > 64_000_000);
  a.booleanModifiers[0].enabled = false;
  assert(compositeLayout(layers, 192, false, false, true).resolution > layout.resolution);
  a.booleanModifiers[0].sourceId = a.id;
  assert.throws(() => compositeLayout(layers, 192, false, false, true), /acyclic/);
});
