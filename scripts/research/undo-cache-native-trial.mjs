import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { IndependentLayers } from "../../src/independent-layers";
import { createBaseProject } from "../../src/layers";
import { SDFVolume } from "../../src/sdf";

const settings = {
  mode: "subtract",
  radius: 0.4,
  strength: 0.8,
  hardness: 0.6,
  camera: { position: [2.4, 1.7, 3.3], target: [0.1, 0, 0] },
};

function signature(runtime) {
  const hash = createHash("sha256");
  hash.update(Buffer.from(runtime.volume.values.buffer));
  for (const { id, geometry } of runtime.exportUpdates()) {
    const position = geometry.getAttribute("position").array;
    const normal = geometry.getAttribute("normal").array;
    // Empty geometry allocation does not affect the exact rendered surface.
    if (!position.length) continue;
    hash.update(`${id}:${position.length}:`);
    hash.update(Buffer.from(position.buffer, position.byteOffset, position.byteLength));
    hash.update(Buffer.from(normal.buffer, normal.byteOffset, normal.byteLength));
  }
  return hash.digest("hex");
}

function replay(capBytes, action) {
  const editor = new IndependentLayers(createBaseProject(new SDFVolume(65), settings));
  const runtime = editor.active;
  const sourceVolume = runtime.volume;
  const before = signature(runtime);
  const original = runtime.mesher;
  const sourceBytes = original.ownedGeometryBytes;
  const captureStart = performance.now();
  // The trial only admits an ordinary, fully meshed voxel layer on its original lattice.
  const fork =
    capBytes && sourceBytes > 0 && sourceBytes <= capBytes && !original.pendingChunks
      ? original.forkEdit(sourceVolume, null)
      : null;
  if (fork) runtime.mesher = fork;
  const captureMs = performance.now() - captureStart;
  let restored = false;
  try {
    editor.beginStroke();
    for (let i = 0; i < 30; i++)
      editor.applyStroke({ x: (i - 15) / 80, y: 0, z: 0.72 }, 0.4, "subtract", 0.8, 1 / 60, 0.6);
    if (action === "cancel") {
      editor.cancelStroke();
      assert.equal(signature(runtime), before);
      assert.equal(editor.undo(), null);
      return { admitted: Boolean(fork), restored, sourceBytes };
    }
    editor.finishStroke();
    const after = signature(runtime);
    assert.notEqual(after, before);
    const owningRevision = editor.sourceRevision;
    if (action === "stale") {
      editor.beginStroke();
      editor.applyStroke({ x: 0.15, y: 0, z: 0.72 }, 0.4, "add", 0.8, 1 / 60, 0.6);
      editor.finishStroke();
      assert.notEqual(editor.sourceRevision, owningRevision);
    }

    const rebuild = runtime.rebuild;
    const eligible =
      fork &&
      runtime.mesher === fork &&
      runtime.volume === sourceVolume &&
      editor.sourceRevision === owningRevision;
    if (eligible) {
      // The normal editor still replays history, invalidates the composite and syncs
      // presentation. Only its synchronous mesh rebuild is intercepted in this fixture.
      runtime.rebuild = () => {
        const updates = original.snapshotUpdates();
        runtime.surface.clear();
        runtime.surface.update(updates);
        runtime.mesher = original;
        runtime.triangles = original.triangles;
        runtime.totalChunks = original.allocatedChunks;
        runtime.lastChanged = updates.length;
        fork.dispose();
        restored = true;
        return true;
      };
    }

    const undoStart = performance.now();
    try {
      assert.equal(editor.undo(), runtime.layer.id);
    } finally {
      if (eligible) delete runtime.rebuild;
      assert.equal(runtime.rebuild, rebuild);
    }
    const undoMs = performance.now() - undoStart;
    assert.equal(signature(runtime), action === "stale" ? after : before);
    assert.equal(runtime.mesher.pendingChunks, 0);
    assert.equal(
      runtime.surface.group.children.reduce(
        (sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3,
        0,
      ),
      runtime.triangles,
    );
    if (action !== "stale") {
      assert.equal(editor.undo(true), runtime.layer.id);
      assert.equal(signature(runtime), after);
    }
    return { admitted: Boolean(fork), restored, sourceBytes, captureMs, undoMs };
  } finally {
    if (fork && !restored) {
      fork.prepareAdoptionFrom(original)();
      original.dispose();
    }
    editor.dispose();
  }
}

const output = process.argv[2];
const cap = 40 * 1024 ** 2;
const trials = [];
for (let trial = 0; trial < 5; trial++) {
  for (const budget of trial % 2 ? [cap, 0] : [0, cap]) {
    const result = replay(budget, "undo");
    assert.equal(result.restored, budget === cap);
    trials.push({ policy: budget ? "cache" : "ordinary", ...result });
  }
}
const overBudget = replay(1, "undo");
const stale = replay(cap, "stale");
const canceled = replay(cap, "cancel");
assert(!overBudget.admitted && !overBudget.restored);
assert(stale.admitted && !stale.restored);
assert(canceled.admitted && !canceled.restored);
writeFileSync(output, JSON.stringify({ trials, overBudget, stale, canceled }, null, 2), {
  flag: "wx",
});
