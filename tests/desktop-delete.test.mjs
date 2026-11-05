import assert from "node:assert/strict";
import test from "node:test";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { handleLayerDeleteShortcut } from "../work/test-build/interaction.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";

const key = (key, options = {}) => ({
  key,
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  preventDefault() {
    this.prevented = true;
  },
  ...options,
});
const make = () => {
  const v = new SDFVolume(17, 1.6, false);
  v.values.fill(6.4);
  return new IndependentLayers(
    createBaseProject(v, {
      mode: "add",
      radius: 0.12,
      strength: 0.5,
      hardness: 0.5,
      camera: { position: [2, 2, 3], target: [0, 0, 0] },
    }),
  );
};

test("Delete and Mac Backspace remove only the selected layer and preserve its geometry through Undo/Redo", async () => {
  for (const name of ["Delete", "Backspace"]) {
    const l = make();
    try {
      const base = l.project.activeLayerId;
      const part = await l.regeneratePrimitive({
        kind: "box",
        width: 0.2,
        height: 0.2,
        depth: 0.2,
      });
      const child = await l.regeneratePrimitive({ kind: "sphere", diameter: 0.05 });
      l.reparent(child.id, part.id);
      l.select(part.id);
      const values = part.volume.getDenseView().slice(),
        pose = structuredClone(child.transform),
        event = key(name);
      assert(
        handleLayerDeleteShortcut(event, false, false, () => l.deleteObject(l.transformNode.id)),
      );
      assert(event.prevented);
      assert(!l.project.layerStack.layers.some((s) => s.id === part.id));
      assert.equal(l.project.layerStack.hierarchy.parent(child.id), null);
      assert.deepEqual(child.transform, pose);
      l.undo();
      assert.equal(l.project.layerStack.get(part.id), part);
      assert.deepEqual(part.volume.getDenseView(), values);
      assert.equal(l.project.layerStack.hierarchy.parent(child.id), part.id);
      l.undo(true);
      assert(!l.project.layerStack.layers.some((s) => s.id === part.id));
      assert(l.project.layerStack.get(base));
    } finally {
      l.dispose();
    }
  }
});
test("typing, unavailable editor, modifiers and key repetition cannot delete extra layers", () => {
  let deleted = 0;
  const remove = () => deleted++;
  for (const name of ["Delete", "Backspace"]) {
    assert.equal(handleLayerDeleteShortcut(key(name), false, true, remove), false);
    assert.equal(handleLayerDeleteShortcut(key(name), true, false, remove), false);
    for (const modifier of ["ctrlKey", "metaKey", "altKey", "shiftKey"])
      assert.equal(
        handleLayerDeleteShortcut(key(name, { [modifier]: true }), false, false, remove),
        false,
      );
    const held = key(name, { repeat: true });
    assert(handleLayerDeleteShortcut(held, false, false, remove));
    assert(held.prevented);
  }
  assert.equal(handleLayerDeleteShortcut(key("d"), false, false, remove), false);
  assert.equal(deleted, 0);
});
test("keyboard deletion retains last-layer and live Boolean target locking protections", async () => {
  const l = make();
  try {
    assert.throws(
      () =>
        handleLayerDeleteShortcut(key("Delete"), false, false, () =>
          l.deleteObject(l.project.activeLayerId),
        ),
      /at least one/,
    );
    const source = await l.regeneratePrimitive({ kind: "sphere", diameter: 0.1 });
    l.setNodeFlag(source.id, "locked", true);
    assert.throws(
      () => handleLayerDeleteShortcut(key("Delete"), false, false, () => l.deleteObject(source.id)),
      /locked/,
    );
    l.setNodeFlag(source.id, "locked", false);
    const target = l.project.layerStack.layers[0];
    l.setBooleanModifiers(target.id, [
      { id: "source-ref", sourceId: source.id, operation: "difference", enabled: true },
    ]);
    l.setNodeFlag(target.id, "locked", true);
    assert.throws(
      () => handleLayerDeleteShortcut(key("Delete"), false, false, () => l.deleteObject(source.id)),
      /locked/,
    );
    assert(l.project.layerStack.get(source.id));
    l.setNodeFlag(target.id, "locked", false);
    const before = l.undoCount;
    handleLayerDeleteShortcut(key("Backspace"), false, false, () => l.deleteObject(source.id));
    assert.equal(l.undoCount, before + 1);
    assert.equal(target.booleanModifiers.length, 0);
    l.undo();
    assert(l.project.layerStack.get(source.id));
    assert.equal(target.booleanModifiers[0].sourceId, source.id);
  } finally {
    l.dispose();
  }
});
