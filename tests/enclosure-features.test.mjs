import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { createHeadlessEditor } from "../scripts/headless-enclosure.mjs";
import { partSources } from "../work/test-build/assembly.mjs";
import { prepareComposite } from "../work/test-build/compositor.mjs";
import {
  enclosureAnchors,
  featurePlan,
  WALL_ANCHORS,
} from "../work/test-build/enclosure-features.mjs";
import { DEFAULT_ENCLOSURE } from "../work/test-build/enclosure-recipe.mjs";
import { renameNative } from "../work/test-build/library-codec.mjs";
import { primitiveDistance } from "../work/test-build/parametric-primitive.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { transformMatrix } from "../work/test-build/transform.mjs";

const ok = (r) => {
  assert(r.ok, JSON.stringify(r));
  return r.value;
};
const options = (api) => ({ expectedRevision: api.revision });
const cut = (anchor) => ({
  kind: "cutout",
  name: "Port",
  anchor,
  shape: "rectangle",
  uMm: 1,
  vMm: 5,
  widthMm: 4,
  heightMm: 3,
  insetMm: 0,
});
const bytes = (l) => Buffer.from(saveSculptProject(l.project));
for (const anchor of WALL_ANCHORS)
  for (const shape of ["rectangle", "round"])
    test(`${anchor} ${shape}: physical through-wall and transformed resize follows frame, one Undo`, async () => {
      const { layers: l, api } = createHeadlessEditor();
      try {
        const {
          partIds: { base, lid },
        } = ok(await api.enclosure.create(DEFAULT_ENCLOSURE, options(api)));
        const def = { ...cut(anchor), shape, ...(shape === "round" ? { heightMm: 4 } : {}) };
        const before = bytes(l),
          rev = api.revision;
        ok(await api.enclosure.setFeature(base, lid, def, { ...options(api), dryRun: true }));
        assert.equal(api.revision, rev);
        assert.deepEqual(bytes(l), before);
        const feature = ok(await api.enclosure.setFeature(base, lid, def, options(api)))
          .features[0];
        const after = bytes(l);
        l.undo();
        assert.deepEqual(bytes(l), before);
        l.undo(true);
        assert.deepEqual(bytes(l), after);
        const pose = { position: [10, 20, 30], rotation: [0.2, 0.7, 0.4], scale: [1, 1, 1] };
        ok(
          await api.execute(
            { type: "object.transform", id: base, unit: "mm", transform: pose },
            options(api),
          ),
        );
        for (const patch of [
          {
            innerWidthMm: 30,
            innerDepthMm: 26,
            wallThicknessMm: 4,
            floorThicknessMm: 4,
            cornerRadiusMm: 5,
          },
          { innerWidthMm: 22, innerDepthMm: 18, wallThicknessMm: 2, floorThicknessMm: 2 },
        ]) {
          const p = { ...DEFAULT_ENCLOSURE, ...patch };
          ok(await api.enclosure.update(base, lid, p, options(api)));
          const node = l.project.layerStack.get(feature.sourceIds[0]),
            mm = l.display.precision.millimetresPerUnit;
          const sdf = prepareComposite(partSources(l.project.layerStack, base));
          const frame = enclosureAnchors(p).find((a) => a.id === anchor);
          const root = transformMatrix(l.project.layerStack.get(base).transform);
          for (const depth of [-0.1, p.wallThicknessMm / 2, p.wallThicknessMm + 0.1]) {
            const point = new Vector3(...frame.originMm)
              .addScaledVector(new Vector3(...frame.u), def.uMm)
              .addScaledVector(new Vector3(...frame.v), def.vMm)
              .addScaledVector(new Vector3(...frame.normal), -depth)
              .multiplyScalar(1 / mm)
              .applyMatrix4(root);
            assert(sdf(...point.toArray()) > 0, `opening at depth ${depth}`);
          }
          const plan = featurePlan(p, def)[0],
            expected = new Vector3(...plan.positionMm).multiplyScalar(1 / mm).applyMatrix4(root);
          assert(expected.distanceTo(new Vector3(...node.transform.position)) < 1e-6);
        }
        assert.equal(new DataView(saveSculptProject(l.project)).getUint32(8, true), 19);
        const opened = openSculptProject(saveSculptProject(l.project));
        assert.deepEqual(opened.layerStack.get(base).assemblyPart.enclosure.features[0], feature);
        const duplicated = openSculptProject(
          renameNative(saveSculptProject(l.project), "Copy", true),
        );
        const copied = duplicated.layerStack.layers.find(
          (n) => n.assemblyPart?.enclosure?.role === "base",
        );
        assert.notEqual(copied.id, base);
        assert.notEqual(
          copied.assemblyPart.enclosure.features[0].sourceIds[0],
          feature.sourceIds[0],
        );
        assert(duplicated.layerStack.get(copied.assemblyPart.enclosure.features[0].sourceIds[0]));
        const preRemove = bytes(l);
        ok(await api.enclosure.removeFeature(base, lid, feature.sourceIds[0], options(api)));
        assert.equal(api.enclosure.features(base, lid).length, 0);
        l.undo();
        assert.deepEqual(bytes(l), preRemove);
      } finally {
        l.dispose();
      }
    });
test("four explicit posts retain centres and through bores after floor resize; capacity/cancel/stale/invalid atomically refuse", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const {
      partIds: { base, lid },
    } = ok(await api.enclosure.create(DEFAULT_ENCLOSURE, options(api)));
    const d = {
      kind: "mounting",
      name: "User centres",
      anchor: "enclosure.base.floor",
      centresMm: [
        [-5, -4],
        [5, -4],
        [-5, 4],
        [5, 4],
      ],
      outerDiameterMm: 3,
      boreDiameterMm: 1.5,
      heightMm: 4,
      floorOffsetMm: 0,
    };
    const feature = ok(await api.enclosure.setFeature(base, lid, d, options(api))).features[0];
    assert.equal(feature.sourceIds.length, 8);
    const p = { ...DEFAULT_ENCLOSURE, floorThicknessMm: 4 };
    ok(await api.enclosure.update(base, lid, p, options(api)));
    const sdf = prepareComposite(partSources(l.project.layerStack, base)),
      mm = l.display.precision.millimetresPerUnit;
    const floor = enclosureAnchors(p).find((a) => a.id === "enclosure.base.floor").originMm[1];
    for (const [x, z] of d.centresMm) {
      assert(sdf(x / mm, (floor + 2) / mm, z / mm) > 0);
      assert(sdf((x + 1.2) / mm, (floor + 2) / mm, z / mm) < 0);
    }
    const before = bytes(l);
    const abort = new AbortController();
    abort.abort();
    for (const [definition, opt] of [
      [cut(WALL_ANCHORS[0]), { ...options(api), signal: abort.signal }],
      [cut(WALL_ANCHORS[0]), { expectedRevision: "stale" }],
      [{ ...cut(WALL_ANCHORS[0]), uMm: 100 }, options(api)],
      [{ ...d, anchor: "invented" }, options(api)],
    ]) {
      assert.equal((await api.enclosure.setFeature(base, lid, definition, opt)).ok, false);
      assert.deepEqual(bytes(l), before);
    }
    ok(await api.enclosure.setFeature(base, lid, cut(WALL_ANCHORS[0]), options(api)));
    ok(await api.enclosure.setFeature(base, lid, cut(WALL_ANCHORS[2]), options(api)));
    while (l.project.layerStack.layers.length < 20) l.create(64);
    const full = bytes(l);
    const overflow = await api.enclosure.setFeature(base, lid, cut(WALL_ANCHORS[1]), options(api));
    assert.equal(overflow.ok, false);
    assert.match(overflow.error.message, /20 independent layers/);
    assert.deepEqual(bytes(l), full);
  } finally {
    l.dispose();
  }
});

test("strict native links/tags refuse malformed anchors, source cycles and foreign references; real recovery retains association", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const {
      partIds: { base, lid },
    } = ok(await api.enclosure.create(DEFAULT_ENCLOSURE, options(api)));
    ok(await api.enclosure.setFeature(base, lid, cut(WALL_ANCHORS[0]), options(api)));
    const native = saveSculptProject(l.project);
    const mutate = (fn) => {
      const v = new DataView(native),
        len = v.getUint32(12, true),
        meta = JSON.parse(new TextDecoder().decode(new Uint8Array(native, 16, len)));
      fn(meta);
      const encoded = new TextEncoder().encode(JSON.stringify(meta)),
        out = new Uint8Array(16 + encoded.length + native.byteLength - 16 - len);
      out.set(new Uint8Array(native, 0, 16));
      new DataView(out.buffer).setUint32(12, encoded.length, true);
      out.set(encoded, 16);
      out.set(new Uint8Array(native, 16 + len), 16 + encoded.length);
      return out.buffer;
    };
    const intent = (m) => m.layers.find((n) => n.id === base).assemblyPart.enclosure;
    for (const fn of [
      (m) => (intent(m).features[0].definition.anchor = "board.invented"),
      (m) => (intent(m).features[0].sourceIds[0] = lid),
      (m) => (intent(m).features[0].sourceIds[0] = base),
      (m) => (intent(m).features[0].definition.extra = 1),
    ])
      assert.throws(() => openSculptProject(mutate(fn)));
    const old = native.slice(0);
    new DataView(old).setUint32(8, 18, true);
    assert.throws(() => openSculptProject(old), /19/);
    const { RecoveryBrowserWorker } = await import("../scripts/fixtures/node-recovery-worker.mjs");
    const { encodeRecovery } = await import("../work/test-build/recovery-client.mjs");
    const prev = globalThis.Worker;
    globalThis.Worker = RecoveryBrowserWorker;
    try {
      const r = await encodeRecovery(
        l,
        l.project.settings,
        undefined,
        undefined,
        new AbortController().signal,
        () => true,
      );
      assert.deepEqual(
        openSculptProject(r.data).layerStack.get(base).assemblyPart.enclosure.features,
        l.project.layerStack.get(base).assemblyPart.enclosure.features,
      );
    } finally {
      globalThis.Worker = prev;
    }
  } finally {
    l.dispose();
  }
});

test("source IDs, extra Boolean order, disabled state and editable source semantics survive reflow; locks and unsupported edits refuse", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const {
      partIds: { base, lid },
    } = ok(await api.enclosure.create(DEFAULT_ENCLOSURE, options(api)));
    const f = ok(await api.enclosure.setFeature(base, lid, cut(WALL_ANCHORS[0]), options(api)))
        .features[0],
      id = f.sourceIds[0];
    const root = l.project.layerStack.get(base),
      original = structuredClone(root.booleanModifiers);
    ok(
      await api.execute(
        {
          type: "boolean.update",
          id: base,
          modifiers: original.map((m, i) => (i === 1 ? { ...m, enabled: false } : m)),
        },
        options(api),
      ),
    );
    ok(await api.execute({ type: "object.rename", id, name: "Custom cutter" }, options(api)));
    const stackBefore = structuredClone(root.booleanModifiers);
    ok(
      await api.enclosure.update(
        base,
        lid,
        { ...DEFAULT_ENCLOSURE, innerDepthMm: 22 },
        options(api),
      ),
    );
    assert.deepEqual(l.project.layerStack.get(base).booleanModifiers, stackBefore);
    assert.equal(l.project.layerStack.get(id).name, "Custom cutter");
    assert(l.project.layerStack.get(id).primitive);
    ok(await api.execute({ type: "object.flag", id, flag: "locked", value: true }, options(api)));
    const locked = bytes(l);
    assert.equal(
      (await api.enclosure.update(base, lid, DEFAULT_ENCLOSURE, options(api))).ok,
      false,
    );
    assert.deepEqual(bytes(l), locked);
    ok(await api.execute({ type: "object.flag", id, flag: "locked", value: false }, options(api)));
    const before = bytes(l);
    assert.equal((await api.execute({ type: "object.delete", id }, options(api))).ok, false);
    assert.deepEqual(bytes(l), before);
    ok(
      await api.enclosure.setFeature(
        base,
        lid,
        { ...cut(WALL_ANCHORS[0]), uMm: 2 },
        options(api),
        id,
      ),
    );
    assert.equal(api.enclosure.features(base, lid)[0].sourceIds[0], id);
    const tight = { ...DEFAULT_ENCLOSURE, innerWidthMm: 6 };
    assert.equal((await api.enclosure.update(base, lid, tight, options(api))).ok, false);
  } finally {
    l.dispose();
  }
});

test("actual per-part STL topology and mm bounds exclude retained cutters; source-cache preview is not export", async () => {
  const { exportPartSTL } = await import("../work/test-build/assembly-tools.mjs");
  const { layers: l, api } = createHeadlessEditor();
  try {
    const p = { ...DEFAULT_ENCLOSURE, cornerRadiusMm: 0 };
    const {
      partIds: { base, lid },
    } = ok(await api.enclosure.create(p, options(api)));
    ok(
      await api.enclosure.setFeature(
        base,
        lid,
        { ...cut(WALL_ANCHORS[0]), widthMm: 6, heightMm: 4 },
        options(api),
      ),
    );
    ok(
      await api.enclosure.setFeature(
        base,
        lid,
        {
          kind: "mounting",
          name: "Two user posts",
          anchor: "enclosure.base.floor",
          centresMm: [
            [-5, 0],
            [5, 0],
          ],
          outerDiameterMm: 4,
          boreDiameterMm: 2,
          heightMm: 4,
          floorOffsetMm: 0,
        },
        options(api),
      ),
    );
    const before = bytes(l);
    for (const [id, dims] of [
      [base, [30, 17, 26]],
      [lid, [30, 7, 26]],
    ]) {
      const result = await exportPartSTL(l, id, undefined, "fast");
      for (const key of [
        "boundaryEdges",
        "nonManifoldEdges",
        "inconsistentEdges",
        "degenerateTriangles",
        "invertedComponents",
      ])
        assert.equal(result.report[key], 0, key);
      assert.equal(result.report.components, 1);
      dims.forEach((n, i) => {
        assert(Math.abs(result.report.dimensions[i] - n) < 0.01);
      });
      assert(new DataView(result.data).getUint32(80, true) <= 600000);
      console.log("feature STL", id, JSON.stringify(result.report));
    }
    assert.deepEqual(bytes(l), before);
  } finally {
    l.dispose();
  }
});

test("rounded and tapered profiles preserve inside size and wall orientation", () => {
  const p = DEFAULT_ENCLOSURE;
  for (const namedWall of WALL_ANCHORS) {
    const anchor = enclosureAnchors(p).find((a) => a.id === namedWall);
    for (const shape of ["rectangle", "round"]) {
      const definition = { ...cut(namedWall), uMm: 0, shape, heightMm: 4, outsideFlareMm: 0.5 };
      const [{ source, rotation, positionMm }] = featurePlan(p, definition);
      const inverse = transformMatrix({
        position: positionMm,
        rotation,
        scale: [1, 1, 1],
      }).invert();
      const origin = new Vector3(...anchor.originMm).addScaledVector(
        new Vector3(...anchor.v),
        definition.vMm,
      );
      const distance = (u, v, normal) =>
        primitiveDistance(
          source,
          ...origin
            .clone()
            .addScaledVector(new Vector3(...anchor.u), u)
            .addScaledVector(new Vector3(...anchor.v), v)
            .addScaledVector(new Vector3(...anchor.normal), normal)
            .applyMatrix4(inverse)
            .toArray(),
        );
      assert(Math.abs(distance(2, 0, -p.wallThicknessMm)) < 1e-9);
      assert(Math.abs(distance(2.5, 0, 0)) < 1e-9);
      assert(distance(2.25, 0, -p.wallThicknessMm) > 0);
      assert(distance(2.25, 0, 0) < 0);
    }
  }
  const [{ source }] = featurePlan(p, { ...cut(WALL_ANCHORS[0]), cornerRadiusMm: 1 });
  assert(primitiveDistance(source, 1.9, 0, 1.4) > 0);
  assert(primitiveDistance(source, 1.8, 0, 0) < 0);
  assert.throws(
    () => featurePlan(p, { ...cut(WALL_ANCHORS[0]), outsideFlareMm: 5 }),
    /corner, floor or rim/,
  );
  assert.throws(
    () => featurePlan(p, { ...cut(WALL_ANCHORS[0]), cornerRadiusMm: 2 }),
    /Corner radius/,
  );
});

test("changing a cutout profile keeps its source ID and Boolean slot through save and Undo", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const {
      partIds: { base, lid },
    } = ok(await api.enclosure.create(DEFAULT_ENCLOSURE, options(api)));
    const definition = cut(WALL_ANCHORS[0]);
    const {
      features: [feature],
    } = ok(await api.enclosure.setFeature(base, lid, definition, options(api)));
    const [id] = feature.sourceIds;
    const initial = bytes(l);
    const tapered = { ...definition, outsideFlareMm: 0.5 };
    ok(await api.enclosure.setFeature(base, lid, tapered, { ...options(api), dryRun: true }, id));
    assert.deepEqual(bytes(l), initial);
    const history = l.undoCount;
    ok(await api.enclosure.setFeature(base, lid, tapered, options(api), id));
    assert.equal(l.undoCount, history + 1);
    assert.equal(l.project.layerStack.get(id).primitive.kind, "tapered-box");
    const reopened = openSculptProject(saveSculptProject(l.project));
    assert.deepEqual(reopened.layerStack.get(base).assemblyPart.enclosure.features[0], {
      definition: tapered,
      sourceIds: [id],
    });
    assert.equal(reopened.layerStack.get(base).booleanModifiers[1].sourceId, id);
    l.undo();
    assert.deepEqual(bytes(l), initial);
    l.undo(true);
    ok(
      await api.enclosure.setFeature(
        base,
        lid,
        { ...definition, cornerRadiusMm: 0.5 },
        options(api),
        id,
      ),
    );
    assert.equal(l.project.layerStack.get(id).primitive.cornerRadius, 0.005);
  } finally {
    l.dispose();
  }
});

test("moving a bore across a transformed enclosure floor moves its post and saves one coordinate edit", async () => {
  const { layers, api } = createHeadlessEditor();
  try {
    const {
      partIds: { base, lid },
    } = ok(await api.enclosure.create(DEFAULT_ENCLOSURE, options(api)));
    const {
      features: [mount],
    } = ok(
      await api.enclosure.setFeature(
        base,
        lid,
        {
          kind: "mounting",
          name: "Board mount",
          anchor: "enclosure.base.floor",
          centresMm: [
            [-4, -4],
            [4, 4],
          ],
          outerDiameterMm: 3,
          boreDiameterMm: 1.5,
          heightMm: 4,
          floorOffsetMm: 0,
        },
        options(api),
      ),
    );
    const [postId, boreId, otherId] = mount.sourceIds;
    const stack = layers.project.layerStack;
    const root = stack.get(base);
    layers.select(base);
    layers.setActiveTransform({
      position: [0.2, -0.3, 0.4],
      rotation: [0.3, 0.6, 0.2],
      scale: [1.5, 1.5, 1.5],
    });
    const post = stack.get(postId),
      bore = stack.get(boreId),
      other = stack.get(otherId);
    const beforeOther = structuredClone(other.localTransform);
    const oldPost = post.localTransform.position;
    const oldBore = bore.localTransform.position;
    const coordinates = () => root.assemblyPart.enclosure.features[0].definition.centresMm;
    const world = (local) =>
      new Vector3(...local).applyMatrix4(transformMatrix(root.transform)).toArray();
    const changeTo = (x, z) => ({
      ...bore.transform,
      position: world([x / 100, oldBore[1] + 0.5, z / 100]),
    });
    layers.select(boreId);
    const history = layers.undoCount;
    layers.beginTransform({ placeEnclosureFeature: true });
    layers.updateTransform(changeTo(-3, -2));
    assert.deepEqual(post.localTransform.position, [-0.03, oldPost[1], -0.02]);
    assert.deepEqual(bore.localTransform.position, [-0.03, oldBore[1], -0.02]);
    assert.deepEqual(coordinates(), [
      [-4, -4],
      [4, 4],
    ]);
    layers.cancelTransform();
    assert.equal(layers.undoCount, history);
    assert.deepEqual(post.localTransform.position, oldPost);
    assert.deepEqual(bore.localTransform.position, oldBore);
    assert.throws(
      () => layers.setActiveTransform(changeTo(4, 4), { placeEnclosureFeature: true }),
      /overlap/,
    );
    assert.deepEqual(coordinates(), [
      [-4, -4],
      [4, 4],
    ]);
    assert.equal(layers.undoCount, history);
    assert(layers.setActiveTransform(changeTo(-3, -2), { placeEnclosureFeature: true }));
    assert.equal(layers.undoCount, history + 1);
    assert.deepEqual(other.localTransform, beforeOther);
    assert.deepEqual(coordinates(), [
      [-3, -2],
      [4, 4],
    ]);
    const reopened = openSculptProject(saveSculptProject(layers.project));
    assert.deepEqual(
      reopened.layerStack.get(base).assemblyPart.enclosure.features[0].definition.centresMm,
      coordinates(),
    );
    layers.undo();
    assert.deepEqual(coordinates(), [
      [-4, -4],
      [4, 4],
    ]);
    assert.deepEqual(post.localTransform.position, oldPost);
    assert.deepEqual(bore.localTransform.position, oldBore);
    layers.undo(true);
    assert.deepEqual(coordinates(), [
      [-3, -2],
      [4, 4],
    ]);
    assert.equal(layers.project.activeLayerId, boreId);
  } finally {
    layers.dispose();
  }
});

test("moving a wall cutout updates across and above floor while retaining the wall depth", async () => {
  const { layers, api } = createHeadlessEditor();
  try {
    const {
      partIds: { base, lid },
    } = ok(await api.enclosure.create(DEFAULT_ENCLOSURE, options(api)));
    const {
      features: [feature],
    } = ok(await api.enclosure.setFeature(base, lid, cut(WALL_ANCHORS[1]), options(api)));
    const [id] = feature.sourceIds;
    const cutter = layers.project.layerStack.get(id);
    layers.select(id);
    const pose = structuredClone(cutter.transform);
    assert(
      layers.setActiveTransform(
        {
          ...pose,
          position: [pose.position[0] + 0.5, pose.position[1] + 0.02, pose.position[2] - 0.03],
        },
        { placeEnclosureFeature: true },
      ),
    );
    const [updated] = api.enclosure.features(base, lid);
    assert.equal(updated.definition.uMm, 4);
    assert.equal(updated.definition.vMm, 7);
    assert.equal(cutter.transform.position[0], pose.position[0]);
  } finally {
    layers.dispose();
  }
});

test("duplicating a cutter keeps an independent enclosure cutout that can be moved", async () => {
  const { layers, api } = createHeadlessEditor();
  try {
    const {
      partIds: { base, lid },
    } = ok(await api.enclosure.create(DEFAULT_ENCLOSURE, options(api)));
    const definition = { ...cut(WALL_ANCHORS[0]), outsideFlareMm: 0.3 };
    const {
      features: [feature],
    } = ok(await api.enclosure.setFeature(base, lid, definition, options(api)));
    const [id] = feature.sourceIds;
    const stack = layers.project.layerStack;
    const original = stack.get(id);
    layers.select(id);
    const before = bytes(layers);
    const history = layers.undoCount;
    const copy = await layers.duplicateAsync(id);
    assert.equal(layers.undoCount, history + 1);
    assert.equal(layers.project.activeLayerId, copy.id);
    assert.notEqual(copy.id, id);
    assert.deepEqual(copy.primitive, original.primitive);
    assert.notEqual(copy.volume, original.volume);
    assert.equal(stack.hierarchy.parent(copy.id), base);
    assert.deepEqual(
      stack
        .get(base)
        .booleanModifiers.slice(1)
        .map(({ sourceId, operation }) => [sourceId, operation]),
      [
        [id, "difference"],
        [copy.id, "difference"],
      ],
    );
    const output = api.enclosure.features(base, lid);
    assert.equal(output.length, 2);
    assert.deepEqual(output[1].sourceIds, [copy.id]);
    assert.equal(output[1].definition.outsideFlareMm, 0.3);
    const duplicate = bytes(layers);
    layers.undo();
    assert.deepEqual(bytes(layers), before);
    layers.undo(true);
    assert.deepEqual(bytes(layers), duplicate);
    const copiedPose = stack.get(copy.id).transform;
    layers.setActiveTransform(
      { ...copiedPose, position: [-0.06, copiedPose.position[1], copiedPose.position[2]] },
      { placeEnclosureFeature: true },
    );
    const features = api.enclosure.features(base, lid);
    assert.equal(features[0].definition.uMm, definition.uMm);
    assert.equal(features[1].definition.uMm, -6);
    const sdf = prepareComposite(stack.compositionLayers);
    assert(sdf(0.01, copiedPose.position[1], copiedPose.position[2]) > 0);
    assert(sdf(-0.06, copiedPose.position[1], copiedPose.position[2]) > 0);
    assert(sdf(-0.105, copiedPose.position[1], copiedPose.position[2]) < 0);
    assert.doesNotThrow(() => openSculptProject(saveSculptProject(layers.project)));
  } finally {
    layers.dispose();
  }
});

test("duplicating a mounting bore copies the pattern and rewires bores, with rollback on cancel", async () => {
  const { layers, api } = createHeadlessEditor();
  try {
    const {
      partIds: { base, lid },
    } = ok(await api.enclosure.create(DEFAULT_ENCLOSURE, options(api)));
    const {
      features: [feature],
    } = ok(
      await api.enclosure.setFeature(
        base,
        lid,
        {
          kind: "mounting",
          name: "Mounting posts",
          anchor: "enclosure.base.floor",
          centresMm: [
            [-4, -4],
            [4, 4],
          ],
          outerDiameterMm: 3,
          boreDiameterMm: 1.5,
          heightMm: 4,
          floorOffsetMm: 0,
        },
        options(api),
      ),
    );
    const stack = layers.project.layerStack;
    const boreId = feature.sourceIds[3];
    layers.select(boreId);
    const before = bytes(layers);
    const history = layers.undoCount;
    const count = stack.layers.length;
    const abort = new AbortController();
    await assert.rejects(
      layers.duplicateAsync(boreId, abort.signal, () => {
        if (stack.layers.length > count) abort.abort();
      }),
      /cancelled/,
    );
    assert.deepEqual(bytes(layers), before);
    assert.equal(layers.undoCount, history);

    const selected = await layers.duplicateAsync(boreId);
    const [, copy] = api.enclosure.features(base, lid);
    assert.equal(selected.id, copy.sourceIds[3]);
    assert.equal(layers.project.activeLayerId, selected.id);
    assert.equal(layers.undoCount, history + 1);
    for (const i of [0, 2]) {
      const post = stack.get(copy.sourceIds[i]);
      assert.equal(stack.hierarchy.parent(post.id), base);
      assert.equal(post.booleanModifiers[0].sourceId, copy.sourceIds[i + 1]);
      assert(
        stack
          .get(base)
          .booleanModifiers.some(
            ({ sourceId, operation }) => sourceId === post.id && operation === "union",
          ),
      );
    }
    layers.undo();
    assert.deepEqual(bytes(layers), before);
  } finally {
    layers.dispose();
  }
});

test("scaling an enclosure cutout's bottom keeps its top fixed and updates the recipe through Undo", async () => {
  const { layers, api } = createHeadlessEditor();
  try {
    const {
      partIds: { base, lid },
    } = ok(await api.enclosure.create(DEFAULT_ENCLOSURE, options(api)));
    const original = cut(WALL_ANCHORS[1]);
    const {
      features: [feature],
    } = ok(await api.enclosure.setFeature(base, lid, original, options(api)));
    const [id] = feature.sourceIds;
    layers.select(base);
    layers.setActiveTransform({
      position: [0.2, -0.1, 0.3],
      rotation: [0.3, 0.5, 0.2],
      scale: [1.5, 1.5, 1.5],
    });
    layers.select(id);
    const source = layers.project.layerStack.get(id);
    const top = () =>
      new Vector3(0, source.primitive.height / 2, 0).applyMatrix4(
        transformMatrix(source.transform),
      );
    const topBefore = top();
    const before = bytes(layers);
    const history = layers.undoCount;
    await layers.resizeBoxFace(id, { axis: 1, sign: -1 }, -0.01);
    const [updated] = api.enclosure.features(base, lid);
    assert.equal(updated.definition.heightMm, 2);
    assert.equal(updated.definition.vMm, 5.5);
    assert.equal(updated.definition.widthMm, original.widthMm);
    assert.equal(updated.definition.uMm, original.uMm);
    assert(topBefore.distanceTo(top()) < 1e-9);
    assert.equal(layers.undoCount, history + 1);
    const resized = bytes(layers);
    layers.undo();
    assert.deepEqual(bytes(layers), before);
    layers.undo(true);
    assert.deepEqual(bytes(layers), resized);
    await assert.rejects(layers.resizeBoxFace(id, { axis: 2, sign: 1 }, 0.001), /depth/);
    assert.deepEqual(bytes(layers), resized);
  } finally {
    layers.dispose();
  }
});

test("scaling a mounting post updates pattern height and bores, with atomic cancellation", async () => {
  const { layers, api } = createHeadlessEditor();
  try {
    const {
      partIds: { base, lid },
    } = ok(await api.enclosure.create(DEFAULT_ENCLOSURE, options(api)));
    const definition = {
      kind: "mounting",
      name: "Board posts",
      anchor: "enclosure.base.floor",
      centresMm: [
        [-4, -4],
        [4, 4],
      ],
      outerDiameterMm: 3,
      boreDiameterMm: 1.5,
      heightMm: 4,
      floorOffsetMm: 0,
    };
    const {
      features: [feature],
    } = ok(await api.enclosure.setFeature(base, lid, definition, options(api)));
    const [id, bore] = feature.sourceIds;
    const stack = layers.project.layerStack;
    layers.select(id);
    const post = stack.get(id);
    const foot = post.localTransform.position[1] - post.primitive.height / 2;
    const before = bytes(layers);
    const history = layers.undoCount;
    const next = { ...post.primitive, height: post.primitive.height + 0.015 };
    const abort = new AbortController();
    const pending = layers.resizePrimitiveFromGizmo(id, next, abort.signal);
    abort.abort();
    await assert.rejects(pending, /cancelled/);
    assert.deepEqual(bytes(layers), before);
    await layers.resizePrimitiveFromGizmo(id, next);
    assert.equal(layers.undoCount, history + 1);
    assert.equal(api.enclosure.features(base, lid)[0].definition.heightMm, 5.5);
    assert(Math.abs(post.localTransform.position[1] - post.primitive.height / 2 - foot) < 1e-9);
    assert.equal(stack.get(feature.sourceIds[2]).primitive.height, post.primitive.height);
    assert(Math.abs(stack.get(bore).primitive.height - 0.062) < 1e-9);
    layers.undo();
    assert.deepEqual(bytes(layers), before);

    layers.select(bore);
    const cutter = stack.get(bore);
    await layers.resizePrimitiveFromGizmo(bore, { ...cutter.primitive, diameter: 0.02 });
    const changed = api.enclosure.features(base, lid)[0].definition;
    assert.equal(changed.boreDiameterMm, 2);
    assert.equal(changed.outerDiameterMm, 3);
    assert.equal(stack.get(feature.sourceIds[3]).primitive.diameter, 0.02);
  } finally {
    layers.dispose();
  }
});

test("measured USB openings follow component pose and refuse misleading previews", async () => {
  const { componentOpening, openingIsStale } = await import(
    "../work/test-build/component-openings.mjs"
  );
  const { functionalFeatures } = await import("../work/test-build/component-references.mjs");
  const { layers: l, api } = createHeadlessEditor();
  try {
    const {
      partIds: { base, lid },
    } = ok(
      await api.enclosure.create(
        {
          ...DEFAULT_ENCLOSURE,
          innerWidthMm: 110,
          innerDepthMm: 90,
          innerHeightMm: 28,
        },
        options(api),
      ),
    );
    const host = l.project.layerStack.get(base);
    const record = {
      id: "pi-board",
      preset: "pi4",
      opacity: 1,
      hostId: base,
      visible: true,
      scale: 1,
      gapMm: 3,
      positionMm: [0, 0, 5],
      rotation: [0, 0, 0],
    };
    const m = {
      centre: [45, 9, 1],
      shape: "rectangle",
      width: 13,
      height: 15,
      horizontal: 0.4,
      vertical: 0.5,
      cable: 0.5,
    };
    const usb = functionalFeatures("pi4")[0];
    const preset = usb.measurements;
    assert.deepEqual(preset.centre, [45.5, undefined, 0.66]);
    assert.equal(preset.width, 13.82);
    assert.equal(preset.height, 16);
    assert.equal(functionalFeatures("devkit")[0].measurements.height, undefined);
    const presetOpening = componentOpening(record, host, usb, {
      ...m,
      centre: [preset.centre[0], 9, preset.centre[2]],
      width: preset.width,
      height: preset.height,
    }).opening;
    assert.deepEqual(presetOpening.association.manufacturer.fields, ["x", "z", "width", "height"]);
    assert.throws(
      () => componentOpening(record, host, usb, { ...m, horizontal: -0.1 }),
      /clearance/,
    );
    const { opening, depth } = componentOpening(record, host, usb, m);
    assert.equal(depth, 10);
    assert.equal(opening.anchor, WALL_ANCHORS[1]);
    assert.equal(opening.uMm, -6);
    assert(Math.abs(opening.vMm - 12) < 1e-8);
    assert.equal(opening.widthMm, 14.8);
    assert.equal(opening.heightMm, 17);
    assert.throws(() => componentOpening(record, host, usb, m, WALL_ANCHORS[0]), /functional axis/);
    assert.throws(
      () => componentOpening(record, host, usb, { ...m, width: NaN }),
      /measured envelope/,
    );
    assert.throws(() => componentOpening(record, host, usb, { ...m, cable: 50 }), /overlaps/);
    assert.throws(() => componentOpening({ ...record, scale: 2 }, host, usb, m), /full-size/);
    const esp = {
      ...record,
      id: "esp-board",
      preset: "devkit",
      positionMm: [10, 0, -20],
      rotation: [0, 90, 0],
    };
    const espResult = componentOpening(esp, host, functionalFeatures("devkit")[0], {
      ...m,
      centre: [0, 3, 25],
      width: 8,
      height: 4,
    });
    assert.equal(espResult.opening.anchor, WALL_ANCHORS[1]);
    assert(Math.abs(espResult.opening.uMm - 20) < 1e-8);
    assert.equal(espResult.depth, 20);
    const before = bytes(l);
    const preview = ok(
      await api.enclosure.setFeature(base, lid, opening, { ...options(api), dryRun: true }),
    );
    assert.equal(preview.features.length, 1);
    assert.deepEqual(bytes(l), before);
    const { revision } = api;
    ok(await api.enclosure.setFeature(base, lid, opening, options(api)));
    assert.equal(
      (await api.enclosure.setFeature(base, lid, espResult.opening, { expectedRevision: revision }))
        .error.code,
      "revision_conflict",
    );
    ok(await api.enclosure.setFeature(base, lid, espResult.opening, options(api)));
    l.display.components.push(record, esp);
    const display = l.display.snapshot(l.project.id, l.project.layerStack.layers);
    const native = saveSculptProject(l.project, display);
    const reopened = openSculptProject(native);
    assert.deepEqual(
      reopened.layerStack
        .get(base)
        .assemblyPart.enclosure.features.map(({ definition }) => definition),
      [opening, espResult.opening],
    );
    const copied = openSculptProject(renameNative(native, "Associated openings copy", true));
    const copiedBoard = copied.displayPreferences.components[0];
    const copiedBase = copied.layerStack.get(copiedBoard.hostId);
    const copiedAssociation = copiedBase.assemblyPart.enclosure.features[0].definition.association;
    assert.notEqual(copiedBoard.id, record.id);
    assert.equal(copiedAssociation.componentId, copiedBoard.id);
    assert.equal(copiedAssociation.partId, copiedBase.id);
    assert.equal(openingIsStale(copiedAssociation, copiedBoard, copiedBase), false);
    const { RecoveryBrowserWorker } = await import("../scripts/fixtures/node-recovery-worker.mjs");
    const { encodeRecovery } = await import("../work/test-build/recovery-client.mjs");
    const previousWorker = globalThis.Worker;
    globalThis.Worker = RecoveryBrowserWorker;
    try {
      const recovery = await encodeRecovery(
        l,
        l.project.settings,
        display,
        undefined,
        new AbortController().signal,
        () => true,
      );
      const recovered = openSculptProject(recovery.data);
      assert.deepEqual(recovered.displayPreferences.components, [record, esp]);
      assert.deepEqual(
        recovered.layerStack.get(base).assemblyPart.enclosure.features[0].definition.association,
        opening.association,
      );
    } finally {
      globalThis.Worker = previousWorker;
    }
    const { exportPartSTL } = await import("../work/test-build/assembly-tools.mjs");
    assert.equal((await exportPartSTL(l, base, undefined, "fast")).report.components, 1);
    const association = opening.association;
    const moved = { ...record, positionMm: [0, 0, 7] };
    const currentHost = l.project.layerStack.get(base);
    assert.equal(openingIsStale(association, record, currentHost), false);
    assert.equal(openingIsStale(association, moved, currentHost), true);
    assert.equal(openingIsStale(association, undefined, currentHost), true);
    assert.equal(openingIsStale(association, { ...record, hostId: lid }, currentHost), true);
    const id = currentHost.assemblyPart.enclosure.features[0].sourceIds[0];
    const updated = componentOpening(moved, currentHost, usb, association.measurements).opening;
    const beforeUpdate = bytes(l);
    const staged = ok(
      await api.enclosure.setFeature(base, lid, updated, { ...options(api), dryRun: true }, id),
    );
    assert.equal(staged.features[0].sourceIds[0], id);
    assert.deepEqual(bytes(l), beforeUpdate);
    const applied = ok(await api.enclosure.setFeature(base, lid, updated, options(api), id));
    assert.equal(applied.features[0].sourceIds[0], id);
    assert.equal(applied.features[0].definition.widthMm, opening.widthMm);
    assert.equal(applied.features[0].definition.uMm, -8);
    const afterUpdate = bytes(l);
    l.undo();
    assert.deepEqual(bytes(l), beforeUpdate);
    l.undo(true);
    assert.deepEqual(bytes(l), afterUpdate);
  } finally {
    l.dispose();
  }
});

test("measured switch creates a separate editable and independently printable plunger atomically", async () => {
  const { componentOpening } = await import("../work/test-build/component-openings.mjs");
  const { functionalFeatures } = await import("../work/test-build/component-references.mjs");
  const { exportPartSTL } = await import("../work/test-build/assembly-tools.mjs");
  const { layers: l, api } = createHeadlessEditor();
  try {
    const p = { ...DEFAULT_ENCLOSURE, innerHeightMm: 24 };
    const {
      partIds: { base, lid },
    } = ok(await api.enclosure.create(p, options(api)));
    const host = l.project.layerStack.get(base);
    const record = {
      id: "tactile-switch",
      preset: "tactile",
      hostId: base,
      visible: true,
      scale: 1,
      positionMm: [0, 0, p.innerDepthMm / 2 - 7.5],
      rotation: [90, 0, 0],
    };
    const switchFeature = functionalFeatures("tactile")[0];
    const measured = {
      centre: [0, 4.5, 0],
      shape: "round",
      width: 3.3,
      horizontal: 0.35,
      travel: 0.5,
      usableDepth: 1,
      plunger: { diameter: 8, height: 2, shaft: 4, length: 3 + p.wallThicknessMm + 0.5 },
    };
    assert.throws(
      () => componentOpening(record, host, switchFeature, { ...measured, travel: undefined }),
      /actuator travel/,
    );
    assert.throws(
      () => componentOpening(record, host, switchFeature, { ...measured, usableDepth: 0.2 }),
      /usable inward depth/,
    );
    assert.throws(
      () => componentOpening(record, host, switchFeature, { ...measured, horizontal: 0 }),
      /positive radial/,
    );
    assert.throws(
      () =>
        componentOpening(record, host, switchFeature, {
          ...measured,
          plunger: { ...measured.plunger, length: 3 },
        }),
      /shaft length/,
    );
    assert.equal(
      componentOpening(record, host, switchFeature, measured).plunger.retainer,
      undefined,
    );
    const captured = {
      ...measured,
      plunger: { ...measured.plunger, retainer: { diameter: 8, thickness: 3 } },
    };
    assert.throws(
      () =>
        componentOpening(record, host, switchFeature, {
          ...captured,
          plunger: { ...captured.plunger, retainer: { diameter: 8, thickness: 4 } },
        }),
      /gap behind/,
    );
    const { opening, plunger, depth } = componentOpening(record, host, switchFeature, captured);
    assert.equal(plunger.retainer[0].source.diameter, 8);
    assert.equal(plunger.retainer[0].source.height, depth);
    assert.equal(plunger.retainer[1].source.diameter, 4.7);
    assert.equal(
      plunger.pieces[0].positionMm[2] - 1 - (p.innerDepthMm / 2 + p.wallThicknessMm),
      0.5,
    );
    assert.equal(depth, 3);
    assert.equal(opening.widthMm, 4.7);
    const before = bytes(l);
    ok(
      await api.enclosure.setFeature(
        base,
        lid,
        opening,
        { ...options(api), dryRun: true },
        undefined,
        plunger,
      ),
    );
    assert.deepEqual(bytes(l), before);
    const controller = new AbortController();
    controller.abort();
    assert.equal(
      (
        await api.enclosure.setFeature(
          base,
          lid,
          opening,
          { ...options(api), signal: controller.signal },
          undefined,
          plunger,
        )
      ).error.code,
      "cancelled",
    );
    assert.deepEqual(bytes(l), before);
    const {
      aliases: { buttonCap, buttonShaft, buttonRetainer, retainerSocket },
    } = ok(await api.enclosure.setFeature(base, lid, opening, options(api), undefined, plunger));
    const built = bytes(l);
    const part = l.project.layerStack.get(buttonCap);
    assert(part.assemblyPart);
    assert.deepEqual(
      part.booleanModifiers.map(({ sourceId }) => sourceId),
      [buttonShaft],
    );
    assert(
      !partSources(l.project.layerStack, base).some(
        ({ id }) => id === buttonCap || id === buttonShaft,
      ),
    );
    const printed = await exportPartSTL(l, buttonCap, undefined, "fast");
    const printedRetainer = await exportPartSTL(l, buttonRetainer, undefined, "fast");
    assert.equal(printed.report.components, 1);
    assert.equal(printedRetainer.report.components, 1);
    for (const key of [
      "boundaryEdges",
      "nonManifoldEdges",
      "inconsistentEdges",
      "degenerateTriangles",
    ])
      assert.equal(printed.report[key] + printedRetainer.report[key], 0, key);
    l.undo();
    assert.deepEqual(bytes(l), before);
    l.undo(true);
    assert.deepEqual(bytes(l), built);
    const reopened = openSculptProject(saveSculptProject(l.project));
    assert(reopened.layerStack.get(buttonCap).assemblyPart);
    assert(reopened.layerStack.get(buttonRetainer).assemblyPart);
    const feature = reopened.layerStack.get(base).assemblyPart.enclosure.features[0];
    assert.deepEqual(feature.definition.association.printableIds, [
      buttonCap,
      buttonShaft,
      buttonRetainer,
      retainerSocket,
    ]);
    const { renameNative } = await import("../work/test-build/library-codec.mjs");
    const copied = openSculptProject(
      renameNative(saveSculptProject(l.project), "Button assembly copy", true),
    );
    const copiedBase = copied.layerStack.layers.find(
      (layer) => layer.assemblyPart?.enclosure?.role === "base",
    );
    const copyLink = copiedBase.assemblyPart.enclosure.features[0].definition.association;
    assert.equal(copyLink.partId, copiedBase.id);
    assert.notDeepEqual(copyLink.printableIds, feature.definition.association.printableIds);
    assert.equal(copied.layerStack.get(copyLink.printableIds[2]).name, "Button retainer");
    const currentHost = l.project.layerStack.get(base);
    const moved = { ...record, positionMm: [1, 0, record.positionMm[2] - 1] };
    const refit = componentOpening(
      moved,
      currentHost,
      switchFeature,
      feature.definition.association.measurements,
      undefined,
      true,
    );
    ok(
      await api.enclosure.setFeature(
        base,
        lid,
        refit.opening,
        options(api),
        feature.sourceIds[0],
        refit.plunger,
      ),
    );
    assert.deepEqual(
      l.project.layerStack.get(base).assemblyPart.enclosure.features[0].definition.association
        .printableIds,
      feature.definition.association.printableIds,
    );
    assert.equal(
      reopened.layerStack.get(base).assemblyPart.enclosure.features[0].definition.name,
      opening.name,
    );
  } finally {
    l.dispose();
  }
});
