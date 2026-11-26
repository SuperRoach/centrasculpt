import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LayerStack, SculptProject, SdfLayer } from "../work/test-build/layers.mjs";
import { importNative, renameNative } from "../work/test-build/library-codec.mjs";
import { evaluatePrimitive } from "../work/test-build/parametric-primitive.mjs";
import {
  ANALYTIC_PROJECT_VERSION,
  assertProjectTriangleBudget,
  openSculptProject,
  saveSculptProject,
} from "../work/test-build/project.mjs";
import { sculptMask } from "../work/test-build/sculpt-mask.mjs";
import { sculptPaint } from "../work/test-build/sculpt-paint.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";

const settings = {
  mode: "add",
  radius: 0.12,
  strength: 0.5,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
function sourceVolume(source, resolution) {
  const generator = evaluatePrimitive(source, resolution, 63 ** 3);
  let result = generator.next();
  while (!result.done) result = generator.next();
  return result.value;
}
function mixed(sculpt = new SdfLayer(new SDFVolume(17), { name: "Sculpt" })) {
  const primitive = { kind: "box", width: 0.5, height: 0.4, depth: 0.5, cornerRadius: 0.02 };
  const analytic = new SdfLayer(sourceVolume(primitive, 33), {
    name: "Analytic",
    order: 1,
    primitive,
    visible: false,
    locked: true,
  });
  analytic.transform.position = [0.4, 0, 0];
  sculpt.booleanModifiers = [
    { id: "trim", operation: "difference", sourceId: analytic.id, enabled: true },
  ];
  const project = new SculptProject(new LayerStack([sculpt, analytic]), settings);
  project.layerStack.hierarchy.reparent(analytic.id, sculpt.id);
  return project;
}
function header(buffer) {
  const view = new DataView(buffer);
  const size = view.getUint32(12, true);
  return {
    version: view.getUint32(8, true),
    meta: JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 16, size))),
    payload: new Uint8Array(buffer, 16 + size),
  };
}
function mutate(data, edit) {
  const { meta, payload } = header(data);
  edit(meta);
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const out = new Uint8Array(16 + json.length + payload.length);
  out.set(new Uint8Array(data, 0, 16));
  new DataView(out.buffer).setUint32(12, json.length, true);
  out.set(json, 16);
  out.set(payload, 16 + json.length);
  return out.buffer;
}
function compare(expected, actual) {
  for (const [i, layer] of expected.layerStack.layers.entries()) {
    const loaded = actual.layerStack.layers[i];
    assert.deepEqual(loaded.metadata(), layer.metadata());
    assert.deepEqual(loaded.transform, layer.transform);
    assert.deepEqual(loaded.volume.dimensions, layer.volume.dimensions);
    assert.deepEqual(loaded.volume.latticeMin, layer.volume.latticeMin);
    assert.deepEqual(loaded.volume.voxelSize, layer.volume.voxelSize);
    assert.deepEqual(loaded.volume.values, layer.volume.values);
    assert.deepEqual(sculptMask(loaded.volume).snapshot(), sculptMask(layer.volume).snapshot());
    assert.deepEqual(sculptPaint(loaded.volume).snapshot(), sculptPaint(layer.volume).snapshot());
  }
}

test("mixed native storage reconstructs exact caches and preserves paint, masks, hierarchy and Booleans", () => {
  const project = mixed();
  for (const { volume } of project.layerStack.layers) {
    sculptMask(volume).uniform(1);
    sculptMask(volume).write(300, 0.25);
    sculptPaint(volume).channels[0].write(200, 0.2);
    sculptPaint(volume).channels[3].write(200, 0.4);
  }
  const data = saveSculptProject(project);
  const { version, meta } = header(data);
  assert.equal(version, ANALYTIC_PROJECT_VERSION);
  assert.equal(meta.layers[0].voxelCount, 17 ** 3);
  assert.equal(meta.layers[1].voxelCount, 0);
  assert.equal(meta.layers[1].source.encoding, "primitive-sdf-v1");
  const progress = [];
  compare(
    project,
    openSculptProject(data, (...args) => progress.push(args)),
  );
  assert.deepEqual(progress, [
    [1, 2],
    [2, 2],
  ]);
});

test("v2 sculpt remains lossless when saved alongside an analytic source", () => {
  const original = Uint8Array.from(
    readFileSync(new URL("./fixtures/legacy-v2.form", import.meta.url)),
  ).buffer;
  const reopened = openSculptProject(original);
  const voxelOnly = saveSculptProject(reopened);
  assert.equal(header(voxelOnly).version, 24);
  compare(reopened, openSculptProject(voxelOnly));
  const project = mixed(reopened.activeLayer);
  const compacted = saveSculptProject(project);
  compare(project, openSculptProject(compacted));
});

test("signed-zero mismatches fall back to exact voxel persistence and edited clay is stored whole", () => {
  const project = mixed();
  const [sculpt, analytic] = project.layerStack.layers;
  sculpt.volume.values[601] += 0.01;
  analytic.primitive = { kind: "box", width: 1, height: 1, depth: 1 };
  analytic.primitiveOriginal = analytic.primitive;
  // Pick widths that put the surface on a lattice coordinate.
  const volume = sourceVolume(analytic.primitive, 61);
  analytic.volume = volume;
  const index = volume.values.findIndex((v) => Object.is(v, 0));
  assert(index >= 0);
  volume.values[index] = -0;
  const reopened = openSculptProject(saveSculptProject(project));
  assert.equal(header(saveSculptProject(project)).meta.layers[1].source, undefined);
  compare(project, reopened);
  volume.values[index] = -0.001;
  assert.throws(() => saveSculptProject(project), /does not match/);
});

test("validated compact files can be renamed, duplicated and imported without touching the cache definition", () => {
  const data = saveSculptProject(mixed());
  const imported = importNative(data, "Imported").data;
  const copy = openSculptProject(renameNative(imported, "Duplicate", true));
  const original = openSculptProject(data);
  assert.equal(copy.name, "Duplicate");
  assert.notEqual(copy.id, original.id);
  assert.deepEqual(header(imported).meta.layers[1].source, header(data).meta.layers[1].source);
  assert.deepEqual(header(imported).payload, header(data).payload);
  const [sculpt, analytic] = copy.layerStack.layers;
  assert.equal(sculpt.booleanModifiers[0].sourceId, analytic.id);
  assert.equal(copy.layerStack.hierarchy.parent(analytic.id), sculpt.id);
  assert.deepEqual(analytic.volume.values, original.layerStack.layers[1].volume.values);
});

test("corrupt analytic records fail before cache reconstruction and inconsistent fields fail closed", () => {
  const data = saveSculptProject(mixed());
  const cases = [
    [
      (l) => {
        l.source.encoding = "future";
      },
      /encoding/,
    ],
    [
      (l) => {
        delete l.primitive;
        delete l.primitiveOriginal;
      },
      /source definition/,
    ],
    [
      (l) => {
        l.grid.initialResolution = 191;
      },
      /lattice|source definition/,
    ],
    [
      (l) => {
        l.grid.voxelSize[0] += 1e-12;
      },
      /source definition/,
    ],
    [
      (l) => {
        l.source.dimensions[0] *= 2;
      },
      /source definition/,
    ],
    [
      (l) => {
        l.voxelCount = 33 ** 3;
      },
      /offset/,
    ],
  ];
  for (const [corrupt, error] of cases) {
    const callbacks = [];
    assert.throws(
      () =>
        openSculptProject(
          mutate(data, (m) => corrupt(m.layers[1])),
          (i) => callbacks.push(i),
        ),
      error,
    );
    assert.deepEqual(callbacks, []);
  }
  const badCache = mutate(data, (m) => {
    m.layers[1].source.fingerprint ^= 1;
  });
  assert.throws(() => openSculptProject(badCache), /fingerprint|differs|definition/);
  assert.throws(
    () =>
      openSculptProject(data, () => {
        throw new Error("fixture cancelled");
      }),
    /fixture cancelled/,
  );
  assert.equal(openSculptProject(data).layerStack.layers.length, 2);
});

test("a v9 STL reference survives legacy open and mixed analytic migration", () => {
  const legacy = Uint8Array.from(
    readFileSync(new URL("./fixtures/legacy-v9.form", import.meta.url)),
  ).buffer;
  assert.equal(header(legacy).version, 9);
  const reopened = openSculptProject(legacy);
  const migration = mixed(reopened.activeLayer);
  migration.displayPreferences = reopened.displayPreferences;
  const compacted = openSculptProject(saveSculptProject(migration));
  compare(migration, compacted);
  assert.deepEqual(compacted.displayPreferences, reopened.displayPreferences);
});

test("native accounting keeps the voxel triangle cap and admits twenty exact 63³ rebuilds", () => {
  const primitive = { kind: "cylinder", height: 0.06, diameter: 0.06 };
  const template = sourceVolume(primitive, 63);
  const layers = Array.from({ length: 20 }, (_, order) => {
    const volume = new SDFVolume(63, template.extent, false);
    volume.values.set(template.values);
    return new SdfLayer(volume, { primitive, order, name: "Post " + order });
  });
  const project = new SculptProject(new LayerStack(layers), settings);
  const stored = layers.map((layer) => new SdfLayer(layer.volume));
  assert.throws(() => assertProjectTriangleBudget(stored), /triangle budget/);
  assert.doesNotThrow(() => assertProjectTriangleBudget(layers));
  const data = saveSculptProject(project);
  const { meta, payload } = header(data);
  assert.equal(payload.byteLength, 0);
  assert(meta.layers.every((layer) => layer.grid.initialResolution === 63));
  const restored = openSculptProject(data);
  for (const layer of restored.layerStack.layers)
    assert.deepEqual(layer.volume.values, template.values);
  assert.throws(
    () => openSculptProject(mutate(data, (m) => m.layers.push(m.layers[0]))),
    /layer count/,
  );
});
