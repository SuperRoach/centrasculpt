import assert from "node:assert/strict";
import test from "node:test";
import { Box3, Group, Raycaster, Vector3 } from "three";
import { installFileReader } from "../scripts/fixtures/export-node.mjs";
import { RecoveryBrowserWorker } from "../scripts/fixtures/node-recovery-worker.mjs";
import { createHeadlessEditor } from "../scripts/headless-enclosure.mjs";
import {
  COMPONENT_LIMIT,
  COMPONENT_PRESETS,
  validateComponents,
} from "../work/test-build/component-references.mjs";
import {
  ComponentView,
  componentClearance,
  componentMounting,
  componentSurfaceMm,
} from "../work/test-build/component-view.mjs";
import { DEFAULT_ENCLOSURE } from "../work/test-build/enclosure-recipe.mjs";
import { encodeExport } from "../work/test-build/glb-export.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { renameNative } from "../work/test-build/library-codec.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { encodeRecovery } from "../work/test-build/recovery-client.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { encodeSTL } from "../work/test-build/stl-export.mjs";

const record = (patch = {}) => ({
  id: "component",
  preset: "pcb",
  positionMm: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
  opacity: 1,
  visible: true,
  ...patch,
});
const ok = (result) => {
  assert(result.ok, JSON.stringify(result));
  return result.value;
};
const rounded = (vector) => vector.toArray().map((n) => Number(n.toFixed(4)));

test("component metadata bounds count, dimensions, transforms and user hole geometry", () => {
  assert.equal(Object.keys(COMPONENT_PRESETS).length, 5);
  assert.throws(() => validateComponents(Array(COMPONENT_LIMIT + 1).fill(null)), /At most/);
  assert.throws(() => validateComponents([record(), record()]), /Invalid/);
  assert.throws(() => validateComponents([record({ preset: "constructor" })]), /Invalid/);
  assert.throws(() => validateComponents([record({ rotation: [0, Infinity, 0] })]), /Invalid/);
  assert.throws(() => validateComponents([record({ gapMm: 4 })]), /Invalid/);
  assert.throws(() => validateComponents([record({ dimensions: [0, 1, 2] })]), /Invalid/);
  const hole = { x: 3, z: -4, diameter: 2.7 };
  assert.throws(() => validateComponents([record({ holes: [hole, hole] })]), /Invalid/);
  assert.throws(() => validateComponents([record({ holes: [{ ...hole, x: 25 }] })]), /Invalid/);
  assert.deepEqual(validateComponents([record({ holes: [hole] })])[0].holes, [hole]);
});

test("calibrated 3D bodies occupy physical dimensions and release unused geometry", () => {
  const scene = new Group();
  const view = new ComponentView(scene);
  const records = validateComponents([record({ dimensions: [40, 2, 25] })]);
  view.sync(records, [], 100);
  assert.deepEqual(
    rounded(new Box3().setFromObject(view.group).getSize(new Vector3()).multiplyScalar(100)),
    [40, 2, 25],
  );
  let disposed = false;
  view.group.children[0].children[0].geometry.addEventListener("dispose", () => {
    disposed = true;
  });
  view.sync([], [], 100);
  assert.equal(view.group.children.length, 0);
  assert(disposed);
  view.dispose();
  assert.equal(scene.children.length, 0);
});

test("part-relative Pi snap, mounting preview, Undo, native save and recovery", async () => {
  const { layers, api } = createHeadlessEditor();
  const view = new ComponentView(new Group());
  const prior = globalThis.Worker;
  globalThis.Worker = RecoveryBrowserWorker;
  try {
    const options = () => ({ expectedRevision: api.revision });
    const {
      partIds: { base, lid },
    } = ok(
      await api.enclosure.create(
        { ...DEFAULT_ENCLOSURE, innerWidthMm: 110, innerDepthMm: 75, innerHeightMm: 28 },
        options(),
      ),
    );
    const hosts = layers.project.layerStack.layers;
    const basePart = layers.project.layerStack.get(base);
    const mm = layers.display.precision.millimetresPerUnit;
    const pi = record({
      preset: "pi4",
      hostId: base,
      positionMm: [4, 0, 2],
      gapMm: 5,
      rotation: [0, 180, 0],
    });
    layers.display.components = validateComponents([pi]);
    view.sync(layers.display.components, hosts, mm);
    const object = view.group.children[0];
    const bounds = new Box3().setFromObject(object);
    assert(
      Math.abs(
        (bounds.min.y - basePart.transform.position[1]) * mm - componentSurfaceMm(basePart) - 5,
      ) < 0.001,
    );
    view.sync(layers.display.components, [], mm);
    assert.equal(object.visible, false);
    view.sync(layers.display.components, hosts, mm);
    assert.equal(object.visible, true);
    const lidPart = layers.project.layerStack.get(lid);
    const onLid = { ...pi, hostId: lid, rotation: [0, 0, 0] };
    view.sync([onLid], hosts, mm);
    const lidBounds = new Box3().setFromObject(object);
    assert(
      Math.abs(
        (lidBounds.max.y - lidPart.transform.position[1]) * mm - componentSurfaceMm(lidPart) + 5,
      ) < 0.001,
    );
    ok(
      await api.execute(
        {
          type: "object.transform",
          id: base,
          unit: "mm",
          transform: { position: [11, 6, 2], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
        options(),
      ),
    );
    view.sync(layers.display.components, layers.project.layerStack.layers, mm);
    const basePose = new Vector3().setFromMatrixPosition(object.matrix).multiplyScalar(mm);
    assert.deepEqual(rounded(basePose), [15, 6 + componentSurfaceMm(basePart) + 5, 4]);
    const definition = componentMounting(pi, basePart, 6, 2);
    assert.deepEqual(
      definition.centresMm.map((p) => p.map((v) => Math.round(v * 10) / 10)),
      [
        [43, 26.5],
        [43, -22.5],
        [-15, 26.5],
        [-15, -22.5],
      ],
    );
    const revision = api.revision;
    ok(await api.enclosure.setFeature(base, lid, definition, { ...options(), dryRun: true }));
    assert.equal(api.revision, revision);
    assert.equal(
      ok(await api.enclosure.setFeature(base, lid, definition, options())).features[0].sourceIds
        .length,
      8,
    );
    layers.undo();
    assert.equal(api.enclosure.features(base, lid).length, 0);
    layers.undo(true);
    assert.equal(api.enclosure.features(base, lid).length, 1);
    const display = layers.display.snapshot(layers.project.id, layers.project.layerStack.layers);
    const native = saveSculptProject(layers.project, display);
    assert.deepEqual(openSculptProject(native).displayPreferences.components, [pi]);
    const duplicate = openSculptProject(renameNative(native, "Copy", true));
    assert.notEqual(duplicate.displayPreferences.components[0].hostId, base);
    assert(
      duplicate.layerStack.get(duplicate.displayPreferences.components[0].hostId).assemblyPart
        .enclosure,
    );
    const recovery = await encodeRecovery(
      layers,
      layers.project.settings,
      display,
      undefined,
      new AbortController().signal,
      () => true,
    );
    assert.deepEqual(openSculptProject(recovery.data).displayPreferences.components, [pi]);
  } finally {
    globalThis.Worker = prior;
    view.dispose();
    layers.dispose();
  }
});

test("Generic PCB and Pi Zero 2 W stage standard floor-mounted posts", async () => {
  const { layers, api } = createHeadlessEditor();
  try {
    const options = () => ({ expectedRevision: api.revision });
    const {
      partIds: { base, lid },
    } = ok(
      await api.enclosure.create(
        { ...DEFAULT_ENCLOSURE, innerWidthMm: 110, innerDepthMm: 75, innerHeightMm: 28 },
        options(),
      ),
    );
    const host = layers.project.layerStack.get(base);
    const common = { hostId: base, gapMm: 5, positionMm: [4, 0, -3], rotation: [0, 90, 0] };
    const [pcb, zero] = validateComponents([
      record({ ...common, holes: [{ x: 11, z: 6, diameter: 3.1 }] }),
      record({ ...common, id: "zero", preset: "zero2" }),
    ]);
    assert.throws(() => componentMounting(record(common), host, 6, 2), /mounting holes/);
    const generic = componentMounting(pcb, host, 6, 2.4);
    const pi = componentMounting(zero, host, 6, 2.2);
    assert.deepEqual(
      generic.centresMm.map((p) => p.map(Math.round)),
      [[10, -14]],
    );
    assert.deepEqual(
      pi.centresMm.map((p) => p.map((v) => Number(v.toFixed(2)))),
      [
        [-7.5, 26],
        [15.5, 26],
        [-7.5, -32],
        [15.5, -32],
      ],
    );
    assert.equal(pi.boreDiameterMm, 2.2);
    for (const definition of [generic, pi]) {
      const revision = api.revision;
      ok(await api.enclosure.setFeature(base, lid, definition, { ...options(), dryRun: true }));
      assert.equal(api.revision, revision);
      ok(await api.enclosure.setFeature(base, lid, definition, options()));
    }
    assert.equal(api.enclosure.features(base, lid).length, 2);
    layers.undo();
    assert.equal(api.enclosure.features(base, lid).length, 1);
    layers.undo(true);
    assert.equal(api.enclosure.features(base, lid).length, 2);

    const floor = componentSurfaceMm(host);
    assert.match(
      componentClearance(
        new Box3(new Vector3(-25, floor + 5, -15), new Vector3(25, floor + 7, 15)),
        host,
      ),
      /Floor clearance 5.00 mm · wall margin 22.50 mm\.$/,
    );
    assert.match(
      componentClearance(
        new Box3(new Vector3(-56, floor - 1, -15), new Vector3(25, floor + 35, 15)),
        host,
      ),
      /crosses a wall.*intersects the floor.*reserved lid region/,
    );
  } finally {
    layers.dispose();
  }
});

test("component picking finds the closest visible reference without hitting its outline", () => {
  const view = new ComponentView(new Group());
  const ray = new Raycaster(new Vector3(0, 1, 0), new Vector3(0, -1, 0));
  const lower = record();
  const upper = record({ id: "upper", positionMm: [0, 10, 0] });
  view.sync([lower, upper], [], 100, lower.id);
  assert.equal(view.pick(ray), upper.id);
  view.sync([lower, { ...upper, visible: false }], [], 100, lower.id);
  assert.equal(view.pick(ray), lower.id);
  ray.ray.origin.x = 0.3;
  assert.equal(view.pick(ray), undefined);
  view.dispose();
});

test("visible component meshes leave both STL and GLB output byte-identical", async () => {
  installFileReader();
  const layers = new IndependentLayers(
    createBaseProject(new SDFVolume(17), {
      mode: "add",
      radius: 0.22,
      strength: 0.35,
      hardness: 0,
      camera: { position: [2, 2, 3], target: [0, 0, 0] },
    }),
  );
  const view = new ComponentView(new Group());
  const budget = 256 * 1024 ** 2;
  const exportBoth = async () => {
    const sources = layers.exportSources();
    return [
      (await encodeSTL(sources, "fast", budget, 100)).data,
      (await encodeExport(sources, "fast", budget)).data,
    ];
  };
  try {
    const clear = await exportBoth();
    layers.display.components = validateComponents([
      record(),
      record({ id: "pi4", preset: "pi4" }),
      record({ id: "switch", preset: "tactile" }),
    ]);
    view.sync(layers.display.components, [], layers.display.precision.millimetresPerUnit);
    assert.equal(view.group.children.length, 3);
    assert.deepEqual(await exportBoth(), clear);
    assert.equal(layers.undoCount, 0);
  } finally {
    view.dispose();
    layers.dispose();
  }
});
