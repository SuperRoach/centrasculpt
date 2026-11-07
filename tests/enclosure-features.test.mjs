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
    const full = bytes(l);
    assert.equal(
      (await api.enclosure.setFeature(base, lid, cut(WALL_ANCHORS[1]), options(api))).ok,
      false,
    );
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
