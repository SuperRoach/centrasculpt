import assert from "node:assert/strict";
import test from "node:test";
import { Box3, Vector3 } from "three";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { TransformPreview } from "../work/test-build/transform-preview.mjs";

const make = () =>
  new IndependentLayers(
    createBaseProject(new SDFVolume(17), {
      mode: "add",
      radius: 0.2,
      strength: 0.3,
      hardness: 0,
      camera: { position: [2, 2, 3], target: [0, 0, 0] },
    }),
  );
test("Boolean transform shows live layers, waits for refreshed result, and retains view choice", async () => {
  const l = make(),
    preview = new TransformPreview();
  try {
    l.viewMode = "boolean";
    await l.composite.flush();
    preview.sync(l);
    assert(l.composite.group.visible);
    l.beginTransform();
    preview.sync(l);
    assert(l.group.visible);
    assert(!l.composite.group.visible);
    l.updateTransform({ position: [0.4, 0, 0], rotation: [0, 0.5, 0], scale: [1, 1, 1] });
    l.finishTransform();
    preview.sync(l);
    assert(l.group.visible);
    assert.equal(l.viewMode, "boolean");
    await l.composite.flush();
    preview.sync(l);
    assert(!l.group.visible);
    assert(l.composite.group.visible);
  } finally {
    l.dispose();
  }
});
test("cancel, explicit Layers choice and project replacement clear temporary presentation", async () => {
  const l = make(),
    other = make(),
    preview = new TransformPreview();
  try {
    l.viewMode = "boolean";
    await l.composite.flush();
    l.beginTransform();
    preview.sync(l);
    l.cancelTransform();
    preview.sync(l);
    assert(l.composite.group.visible);
    l.beginTransform();
    preview.sync(l);
    l.viewMode = "separate";
    preview.sync(l);
    assert(l.group.visible);
    l.cancelTransform();
    other.viewMode = "boolean";
    await other.composite.flush();
    preview.sync(other);
    assert(other.composite.group.visible);
  } finally {
    l.dispose();
    other.dispose();
  }
});

test("live CSG source stays visible while moving and refining; fresh result replaces sources", async () => {
  const l = make(),
    preview = new TransformPreview();
  try {
    const target = await l.regeneratePrimitive({
      kind: "box",
      width: 0.4,
      height: 0.3,
      depth: 0.1,
    });
    const cutter = await l.regeneratePrimitive({ kind: "sphere", diameter: 0.05 });
    l.setBooleanModifiers(target.id, [
      { id: "hole", sourceId: cutter.id, operation: "difference", enabled: true },
    ]);
    preview.sync(l);
    assert(l.group.visible);
    assert(!l.composite.group.visible);
    await l.composite.flush();
    preview.sync(l);
    assert(l.composite.group.visible);
    l.beginTransform();
    preview.sync(l);
    assert(l.group.visible);
    assert(l.runtime(cutter.id).surface.group.visible);
    l.updateTransform({ position: [0.1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    l.finishTransform();
    preview.sync(l);
    assert(l.group.visible);
    assert(!l.composite.group.visible);
    await l.composite.flush();
    preview.sync(l);
    assert(!l.group.visible);
    assert(l.composite.group.visible);
    l.beginTransform();
    preview.sync(l);
    l.cancelTransform();
    preview.sync(l);
    assert(l.composite.group.visible);
  } finally {
    l.dispose();
  }
});

test("desktop Boolean drafts remain visible and restore chosen quality without editing sources/history", async () => {
  const l = make(),
    preview = new TransformPreview();
  try {
    l.viewMode = "boolean";
    l.composite.setQuality(128);
    await l.composite.flush();
    const before = l.active.volume.values.slice(),
      history = l.undoCount;
    const previousSurface = l.composite.group.children[0];
    l.beginTransform();
    preview.sync(l, true);
    assert(l.composite.interactionActive);
    assert(l.composite.group.visible);
    assert(!l.group.visible);
    l.updateTransform({ position: [0.4, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    l.composite.setInteractiveQuality(18);
    const draft = l.composite.rebuild();
    assert(
      l.composite.group.children.includes(previousSurface),
      "keep completed surface while draft is built",
    );
    assert(await draft);
    assert(l.composite.stats.resolution <= 18);
    assert.throws(() => l.composite.exportSources(), /finish rebuilding/);
    l.cancelTransform();
    preview.sync(l, true);
    assert(!l.composite.interactionActive);
    assert(l.composite.group.visible);
    assert(l.composite.pending);
    await l.composite.flush();
    preview.sync(l, true);
    assert(l.composite.group.visible);
    assert(!l.composite.pending);
    assert.deepEqual(l.active.volume.values, before);
    assert.equal(l.undoCount, history);
    assert.equal(l.viewMode, "boolean");
    assert(l.composite.exportSources().length);
  } finally {
    l.dispose();
  }
});

test("continuous desktop transform changes do not starve draft completion; flush restores full quality", async () => {
  const l = make(),
    preview = new TransformPreview();
  let timer;
  try {
    // The source's detail requires more than the interactive 64 cubed cap.
    const detail = new SDFVolume(81);
    l.active.layer.volume = detail;
    l.composite.setQuality(128);
    l.viewMode = "boolean";
    await l.composite.flush();
    const resolution = l.composite.stats.resolution;
    assert(resolution > 64);
    l.beginTransform();
    preview.sync(l, true);
    let edits = 0;
    timer = setInterval(() => {
      edits++;
      l.updateTransform({ position: [edits * 0.001, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    }, 1);
    assert(await l.composite.rebuild());
    clearInterval(timer);
    assert(edits > 0);
    assert(l.composite.stats.resolution <= 64);
    assert(l.composite.pending, "new edits remain scheduled after publishing a draft");
    l.finishTransform();
    await l.composite.flush();
    assert(!l.composite.interactionActive);
    assert.equal(l.composite.stats.resolution, resolution);
    assert(!l.composite.pending);
    assert.equal(
      l.composite.group.children.length,
      1,
      "release old display surface after publication",
    );
  } finally {
    clearInterval(timer);
    l.dispose();
  }
});

test("adaptive primitive size preview changes only draft geometry and cancellation restores the result", async () => {
  const l = make(),
    preview = new TransformPreview();
  try {
    const base = l.active.layer.id;
    const box = await l.regeneratePrimitive({ kind: "box", width: 0.2, height: 0.2, depth: 0.2 });
    l.setFlag(base, "visible", false);
    l.viewMode = "boolean";
    await l.composite.flush();
    const original = structuredClone(box.primitive),
      history = l.undoCount;
    l.beginTransform();
    preview.sync(l, true);
    l.composite.setInteractiveQuality(32);
    l.composite.setPrimitivePreview(box.id, { ...original, width: 0.5 });
    assert(await l.composite.rebuild());
    const width = new Box3().setFromObject(l.composite.group).getSize(new Vector3()).x;
    assert(width > 0.45, `draft width ${width}`);
    assert(l.composite.stats.resolution <= 32);
    assert.deepEqual(box.primitive, original);
    assert.equal(l.undoCount, history);
    l.cancelTransform();
    preview.sync(l, true);
    await l.composite.flush();
    const restored = new Box3().setFromObject(l.composite.group).getSize(new Vector3()).x;
    assert(restored < 0.25, `restored width ${restored}`);
    assert.equal(l.undoCount, history);
  } finally {
    l.dispose();
  }
});

test("export cache eviction cancels an adaptive build and releases both draft and retained geometry", async () => {
  const l = make(),
    preview = new TransformPreview();
  try {
    l.viewMode = "boolean";
    await l.composite.flush();
    l.beginTransform();
    preview.sync(l, true);
    const draft = l.composite.rebuild();
    const release = await l.composite.releaseForExport();
    assert.equal(await draft, false);
    assert.equal(l.composite.trackedBytes, 0);
    assert.equal(l.composite.group.children.length, 0);
    release();
    l.cancelTransform();
    preview.sync(l, true);
    await l.composite.flush();
    assert(l.composite.exportSources().length);
  } finally {
    l.dispose();
  }
});
