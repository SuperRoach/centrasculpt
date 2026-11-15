import assert from "node:assert/strict";
import test from "node:test";
import { BufferAttribute, BufferGeometry, Ray, Vector3 } from "three";
import { LatestUndoMesh } from "../scripts/research/latest-undo-mesh.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { ChunkSurface } from "../work/test-build/surface.mjs";

const settings = {
  mode: "subtract",
  radius: 0.4,
  strength: 0.8,
  hardness: 0.6,
  camera: { position: [2.4, 1.7, 3.3], target: [0, 0, 0] },
};

function buffers(updates) {
  return updates.map(({ id, geometry }) => [
    id,
    {
      position: geometry.getAttribute("position").array,
      normal: geometry.getAttribute("normal").array,
    },
  ]);
}

test("the research cache reproduces native Undo chunk bytes and spatial queries", () => {
  const controller = new IndependentLayers(createBaseProject(new SDFVolume(41), settings));
  const runtime = controller.active;
  const staged = new ChunkSurface(runtime.material);
  const cache = new LatestUndoMesh(40 * 1024 ** 2);
  const revision = Symbol("synthetic subtract stroke");
  const before = runtime.volume.values.slice();
  const beforeUpdates = runtime.exportUpdates();
  const beforeMesh = new Map(
    buffers(beforeUpdates).map(([id, { position, normal }]) => [
      id,
      { position: position.slice(), normal: normal.slice() },
    ]),
  );
  const stagedGeometries = [];
  try {
    assert(beforeMesh.size > 1);
    assert(cache.capture(revision, buffers(beforeUpdates)));
    assert(cache.bytes > 0);

    controller.beginStroke();
    for (let i = 0; i < 30; i++)
      controller.applyStroke(
        { x: (i - 15) / 80, y: 0, z: 0.72 },
        0.4,
        "subtract",
        0.8,
        1 / 60,
        0.6,
      );
    controller.finishStroke();
    const edited = runtime.volume.values.slice();
    const editedMesh = new Map(buffers(runtime.exportUpdates()));
    assert.notDeepEqual(edited, before);
    assert.notDeepEqual(editedMesh, beforeMesh);

    assert.equal(controller.undo(), runtime.layer.id);
    assert.deepEqual(runtime.volume.values, before);
    const nativeUndo = new Map(buffers(runtime.exportUpdates()));
    assert.deepEqual(nativeUndo, beforeMesh);
    assert.equal(cache.take(Symbol("unrelated stroke")), null);
    const retained = cache.take(revision);
    assert(retained);
    assert.deepEqual(retained, nativeUndo);

    for (let start = 0; start < beforeUpdates.length; start += 8) {
      staged.update(
        beforeUpdates.slice(start, start + 8).map(({ id, bounds }) => {
          const { position, normal } = retained.get(id);
          const geometry = new BufferGeometry();
          geometry.setAttribute("position", new BufferAttribute(position, 3));
          geometry.setAttribute("normal", new BufferAttribute(normal, 3));
          stagedGeometries.push(geometry);
          return { id, bounds, geometry };
        }),
      );
    }
    const ray = new Ray(new Vector3(0, 0, 3), new Vector3(0, 0, -1));
    const nativeHits = [],
      stagedHits = [];
    runtime.surface.spatial.ray(ray, nativeHits);
    staged.spatial.ray(ray, stagedHits);
    assert(nativeHits.length > 0);
    assert.deepEqual(
      stagedHits.map(({ name }) => name).sort(),
      nativeHits.map(({ name }) => name).sort(),
    );
    assert.equal(cache.bytes, 0);

    assert.equal(controller.undo(true), runtime.layer.id);
    assert.deepEqual(runtime.volume.values, edited);
    assert.deepEqual(new Map(buffers(runtime.exportUpdates())), editedMesh);
    assert.equal(cache.take(revision), null);
  } finally {
    staged.clear();
    for (const geometry of stagedGeometries) geometry.dispose();
    controller.dispose();
  }
});

function edit(editor) {
  editor.beginStroke();
  for (let i = 0; i < 8; i++)
    editor.applyStrokeLocal({ x: i / 80, y: 0, z: 0.75 }, 0.4, "subtract", 0.8, 1 / 60, 0.6);
  editor.finishStroke();
}

test("live opt-in restores exact chunk buffers once through the normal Undo path", () => {
  const editor = new IndependentLayers(createBaseProject(new SDFVolume(41), settings));
  const runtime = editor.active;
  try {
    edit(editor);
    assert.equal(editor.undoMeshCacheBytes, 0);
    editor.undo();

    editor.setUndoMeshCacheEnabled(true);
    const before = runtime.volume.values.slice();
    const beforeBuffers = new Map(buffers(runtime.exportUpdates()));
    edit(editor);
    const retained = editor.undoMeshCacheBytes;
    assert(retained > 0 && retained <= 40 * 1024 ** 2);
    const after = runtime.volume.values.slice();
    const afterBuffers = new Map(buffers(runtime.exportUpdates()));
    assert.notDeepEqual(after, before);

    editor.undo();
    assert.deepEqual(runtime.volume.values, before);
    const restored = new Map(buffers(runtime.exportUpdates()));
    assert.deepEqual(restored, beforeBuffers);
    const replaced = [...beforeBuffers].filter(
      ([id, original]) => original.position !== afterBuffers.get(id)?.position,
    );
    assert(replaced.some(([id, original]) => restored.get(id).position === original.position));
    assert.equal(editor.undoMeshCacheBytes, 0);
    editor.undo(true);
    assert.deepEqual(runtime.volume.values, after);
    assert.deepEqual(new Map(buffers(runtime.exportUpdates())), afterBuffers);
  } finally {
    editor.dispose();
  }
});

test("live opt-in releases snapshots on disable, cancellation, growth and disposal", () => {
  const editor = new IndependentLayers(createBaseProject(new SDFVolume(41), settings));
  const runtime = editor.active;
  try {
    editor.setUndoMeshCacheEnabled(true);
    edit(editor);
    const cachedBytes = editor.undoMeshCacheBytes;
    const total = editor.trackedBytes;
    assert(cachedBytes > 0);
    editor.setUndoMeshCacheEnabled(false);
    assert.equal(editor.undoMeshCacheBytes, 0);
    assert.equal(editor.trackedBytes, total - cachedBytes);
    assert.equal(editor.undo(), runtime.layer.id);

    editor.setUndoMeshCacheEnabled(true);
    editor.beginStroke();
    assert(editor.undoMeshCacheBytes > 0);
    editor.cancelStroke();
    assert.equal(editor.undoMeshCacheBytes, 0);

    editor.beginStroke();
    assert(editor.undoMeshCacheBytes > 0);
    const priorVolume = runtime.volume;
    editor.applyStrokeLocal({ x: 2.4, y: 0, z: 0 }, 0.2, "add", 0.8, 1 / 60, 0.6, true);
    assert.notEqual(runtime.volume, priorVolume);
    assert.equal(editor.undoMeshCacheBytes, 0);
    editor.finishStroke();
    assert.equal(editor.undoMeshCacheBytes, 0);

    edit(editor);
    assert(editor.undoMeshCacheBytes > 0);
  } finally {
    editor.dispose();
  }
  assert.equal(editor.undoMeshCacheBytes, 0);
});

test("live opt-in declines a snapshot when the existing memory budget cannot fit it", () => {
  const editor = new IndependentLayers(createBaseProject(new SDFVolume(41), settings));
  try {
    editor.setUndoMeshCacheEnabled(true);
    editor.growthLimits.maxTransientBytes = editor.trackedBytes + 256 * 1024;
    editor.beginStroke();
    assert.equal(editor.undoMeshCacheBytes, 0);
    editor.cancelStroke();
  } finally {
    editor.dispose();
  }
});
