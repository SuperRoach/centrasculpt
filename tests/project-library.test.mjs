import assert from "node:assert/strict";
import test from "node:test";
import { IDBObjectStore, indexedDB } from "fake-indexeddb";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { describeNative, importNative, renameNative } from "../work/test-build/library-codec.mjs";
import { defaultLighting } from "../work/test-build/lighting.mjs";
import { openSculptProject, saveProject, saveSculptProject } from "../work/test-build/project.mjs";
import { ProjectBrowser } from "../work/test-build/project-browser.mjs";
import {
  libraryModifiedLabel,
  libraryName,
  ProjectLibrary,
} from "../work/test-build/project-library.mjs";
import { hydrateProject, projectTransfer } from "../work/test-build/project-transfer.mjs";
import { newProjectData } from "../work/test-build/project-workflow.mjs";
import { IndexedRecoveryStore } from "../work/test-build/recovery-store.mjs";
import { createReference } from "../work/test-build/reference-images.mjs";
import { sculptMask } from "../work/test-build/sculpt-mask.mjs";
import { sculptPaint } from "../work/test-build/sculpt-paint.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";

const settings = {
  mode: "add",
  radius: 0.2,
  strength: 0.7,
  hardness: 0.3,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const raw = () => saveSculptProject(createBaseProject(new SDFVolume(17), settings));
const store = (budget) => new ProjectLibrary(indexedDB, "library-test-" + Math.random(), budget);
const put = async (s, name = "Test", data = raw()) => {
  const record = describeNative(data, name);
  return s.put(record, data, null);
};
const fixture = () => {
  const s = store();
  let data = raw(),
    key = "initial",
    ready = true,
    opens = 0,
    downloads = [];
  const b = new ProjectBrowser(s, {
    key: () => key,
    ready: () => ready,
    encode: async () => data,
    open: async (d) => {
      data = d;
      key += "opened";
      opens++;
      return true;
    },
    create: async (r, c) => newProjectData(r, c, settings),
    handoff: async (...args) => downloads.push(args),
    changed() {},
  });
  return {
    s,
    b,
    edit: () => (key += "edit"),
    ready: (v) => (ready = v),
    opens: () => opens,
    downloads,
    port: b.port,
  };
};
test("CRUD metadata queries, recent order, last opened and delete preserve other payloads", async () => {
  const s = store();
  try {
    const a = await put(s, "A"),
      b = await put(s, "B");
    const r = await s.metadata(a.id, a.revision, { name: "Renamed", opened: 123 });
    assert.equal(r.opened, 123);
    assert.equal(r.name, "Renamed");
    assert.equal((await s.read(b.id)).record.name, "B");
    const sorted = await s.list();
    assert(sorted[0].modified >= sorted[1].modified);
    await s.delete(a.id, r.revision);
    assert.equal((await s.list()).length, 1);
    await assert.rejects(s.read(a.id), (e) => e.code === "missing");
  } finally {
    s.close();
  }
});
test("list never reads payloads; rename never writes payloads", async () => {
  const s = store();
  try {
    const r = await put(s),
      get = IDBObjectStore.prototype.getAll,
      putBase = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.getAll = function (...args) {
      assert.notEqual(this.name, "payloads");
      return get.apply(this, args);
    };
    IDBObjectStore.prototype.put = function (...args) {
      assert.notEqual(this.name, "payloads");
      return putBase.apply(this, args);
    };
    try {
      await s.list();
      await s.metadata(r.id, r.revision, { name: "Only metadata" });
    } finally {
      IDBObjectStore.prototype.getAll = get;
      IDBObjectStore.prototype.put = putBase;
    }
  } finally {
    s.close();
  }
});
test("concurrent tab revision conflict prevents overwriting explicit save", async () => {
  const s = store();
  try {
    const data = raw(),
      r = await put(s, "Saved", data);
    await s.metadata(r.id, r.revision, { name: "Other tab" });
    await assert.rejects(s.put(r, data, r.revision), (e) => e.code === "conflict");
    await assert.rejects(s.delete(r.id, r.revision), (e) => e.code === "conflict");
    assert.equal((await s.read(r.id)).record.name, "Other tab");
  } finally {
    s.close();
  }
});
test("bounded library rejects new entries instead of evicting explicit saves", async () => {
  const data = raw(),
    s = store(data.byteLength + 1);
  try {
    const r = await put(s, "Kept", data);
    await assert.rejects(put(s, "Too much"), (e) => e.code === "quota");
    assert.deepEqual((await s.read(r.id)).data, data);
  } finally {
    s.close();
  }
});
for (const mode of ["quota", "abort"])
  test(`${mode} interrupted transaction rolls back metadata and payload together`, async () => {
    const s = store(),
      abort = new AbortController();
    try {
      const data = raw(),
        r = await put(s, "Original", data),
        base = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === "payloads") {
          if (mode === "quota") throw new DOMException("full", "QuotaExceededError");
          abort.abort();
        }
        return base.apply(this, args);
      };
      try {
        await assert.rejects(
          s.put({ ...r, name: "Not committed" }, data, r.revision, abort.signal),
        );
      } finally {
        IDBObjectStore.prototype.put = base;
      }
      assert.equal((await s.read(r.id)).record.name, "Original");
      assert.deepEqual((await s.read(r.id)).data, data);
    } finally {
      s.close();
    }
  });
test("pre-cancelled save is rejected with structured cancellation", async () => {
  const s = store(),
    a = new AbortController(),
    data = raw();
  a.abort();
  try {
    await assert.rejects(
      s.put(describeNative(data, "Cancelled"), data, null, a.signal),
      (e) => e.code === "cancelled",
    );
    assert.equal((await s.list()).length, 0);
  } finally {
    s.close();
  }
});
test("thumbnail size/type validation and metadata persistence", async () => {
  const s = store(),
    data = raw(),
    r = describeNative(data, "Preview");
  try {
    await assert.rejects(
      s.put({ ...r, thumbnail: "https://external/image" }, data, null),
      (e) => e.code === "invalid",
    );
    await assert.rejects(
      s.put({ ...r, thumbnail: "data:image/png;base64," + "a".repeat(32768) }, data, null),
    );
    await s.put({ ...r, thumbnail: "data:image/png;base64,AA==" }, data, null);
    assert.equal((await s.list())[0].thumbnail, "data:image/png;base64,AA==");
  } finally {
    s.close();
  }
});
test("Save and Save As attach previews; failed preview keeps the prior valid thumbnail and never blocks payload save", async () => {
  const f = fixture();
  try {
    let preview = "data:image/webp;base64,AA==";
    f.port.thumbnail = async () => preview;
    await f.b.activate("library:save");
    const first = f.b.current;
    assert.equal((await f.s.read(first.id)).record.thumbnail, preview);
    f.edit();
    preview = undefined;
    f.port.thumbnail = async () => {
      throw new Error("preview renderer unavailable");
    };
    await f.b.activate("library:save");
    assert.equal((await f.s.read(first.id)).record.thumbnail, "data:image/webp;base64,AA==");
    assert.equal(f.b.current.revision, first.revision + 1);
    await f.b.activate("library:save-as");
    f.b.draft = "Independent preview";
    f.port.thumbnail = async () => (preview = "data:image/jpeg;base64,Ag==");
    await f.b.activate("library:submit");
    assert.notEqual(f.b.current.id, first.id);
    assert.equal((await f.s.read(f.b.current.id)).record.thumbnail, "data:image/jpeg;base64,Ag==");
  } finally {
    f.s.close();
  }
});
test("native duplicate remaps rich hierarchy/assets and retains paint, masks, lighting, procedural sources", async () => {
  const l = new IndependentLayers(createBaseProject(new SDFVolume(17), settings));
  try {
    const a = l.active.layer;
    sculptMask(a.volume).write(30, 0.75);
    sculptPaint(a.volume).channels[0].write(50, 0.5);
    sculptPaint(a.volume).channels[3].write(50, 1);
    const group = l.createGroup("Assembly");
    l.reparent(a.id, group);
    const png = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVQIHWP4z8Dwn4GBgQEADfkB/VCm7xQAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    l.display.references = [createReference(png, "Image", "image-id")];
    l.display.lighting = defaultLighting();
    const tube = l.create(64);
    await l.regenerateTube({
      kind: "tube",
      closed: false,
      interpolation: "linear",
      points: [
        { id: "p1", position: [-0.4, 0, 0], radius: 0.15 },
        { id: "p2", position: [0.4, 0, 0], radius: 0.15 },
      ],
    });
    const native = saveSculptProject(
        l.project,
        l.display.snapshot(l.project.id, l.project.layerStack.layers),
      ),
      copy = renameNative(native, "Copy", true),
      p = openSculptProject(copy),
      q = openSculptProject(native);
    assert.notEqual(p.id, q.id);
    assert.equal(p.name, "Copy");
    assert.deepEqual(p.displayPreferences.lighting, q.displayPreferences.lighting);
    assert.deepEqual(p.displayPreferences.references[0].bytes, png);
    assert.notEqual(p.displayPreferences.references[0].id, q.displayPreferences.references[0].id);
    assert.notEqual(p.layerStack.hierarchy.groups[0].id, group);
    assert.equal(
      p.layerStack.hierarchy.parent(p.layerStack.layers[0].id),
      p.layerStack.hierarchy.groups[0].id,
    );
    p.layerStack.layers.forEach((x, i) => {
      assert.notEqual(x.id, q.layerStack.layers[i].id);
      assert.deepEqual(x.volume.values, q.layerStack.layers[i].volume.values);
    });
    assert.deepEqual(
      p.activeLayer.procedural.points.map((x) => x.position),
      q.activeLayer.procedural.points.map((x) => x.position),
    );
    assert.notEqual(p.activeLayer.procedural.points[0].id, q.activeLayer.procedural.points[0].id);
    assert.equal(sculptMask(p.layerStack.layers[0].volume).read(30), 0.75);
    assert.equal(sculptPaint(p.layerStack.layers[0].volume).channels[0].read(50), 0.5);
    p.displayPreferences.references[0].bytes[0] = 0;
    assert.equal(q.displayPreferences.references[0].bytes[0], 137);
    p.layerStack.layers[0].volume.values[0] = 9;
    assert.notEqual(q.layerStack.layers[0].volume.values[0], 9);
    assert.deepEqual(
      saveSculptProject(hydrateProject(projectTransfer(q)), q.displayPreferences),
      native,
    );
  } finally {
    l.dispose();
  }
});
for (const version of [1, 2, 3])
  test(`legacy/current v${version} import migrates independently and records source version`, () => {
    const data = version < 3 ? saveProject(new SDFVolume(17), settings) : raw();
    if (version === 1) new DataView(data).setUint32(8, 1, true);
    const imported = importNative(data, "Imported");
    assert.equal(imported.record.sourceVersion, version);
    assert.equal(openSculptProject(imported.data).name, "Imported");
    assert(imported.record.version >= 3);
    assert.deepEqual(
      openSculptProject(imported.data).activeLayer.volume.values,
      openSculptProject(data).activeLayer.volume.values,
    );
  });
for (const damage of ["short", "magic", "version", "truncated", "nan"])
  test(`malformed ${damage} import rejects without creating library entry`, () => {
    let data = raw();
    if (damage === "short") data = new ArrayBuffer(0);
    else if (damage === "magic") new Uint8Array(data)[0] = 0;
    else if (damage === "version") new DataView(data).setUint32(8, 999, true);
    else if (damage === "truncated") data = data.slice(0, -3);
    else new DataView(data).setFloat32(data.byteLength - 4, NaN, true);
    assert.throws(() => importNative(data, "Bad"));
  });
test("autosave checkpoints never update or replace an explicit library save", async () => {
  const s = store(),
    rstore = new IndexedRecoveryStore(indexedDB, "recovery-test-" + Math.random());
  try {
    const data = raw(),
      saved = await put(s, "Explicit", data);
    await rstore.write(
      {
        id: "old",
        format: 1,
        projectId: saved.id,
        projectName: "Old",
        createdAt: 1,
        revision: "old",
        bytes: data.byteLength,
        checksum: 0,
      },
      data,
      new AbortController().signal,
    );
    await rstore.clear();
    assert.equal((await s.read(saved.id)).record.name, "Explicit");
    assert.equal((await s.read(saved.id)).record.revision, 1);
  } finally {
    s.close();
    rstore.close();
  }
});
test("dirty Open supports cancel and Save & continue with current identity", async () => {
  const f = fixture();
  try {
    await f.b.activate("library:save");
    const initial = f.b.current;
    const other = await put(f.s, "Other");
    await f.b.refresh();
    f.edit();
    f.b.selected = other.id;
    await f.b.activate("library:open");
    assert.equal(f.b.confirmation, "replace");
    assert.equal(f.opens(), 0);
    await f.b.activate("library:cancel");
    assert(f.b.dirty);
    await f.b.activate("library:open");
    await f.b.activate("library:save-replace");
    assert.equal(f.opens(), 1);
    assert.equal(f.b.current.id, other.id);
    assert.equal((await f.s.read(initial.id)).record.revision, 2);
    assert(!f.b.dirty);
  } finally {
    f.s.close();
  }
});
test("save failure preserves pending replacement and current edits", async () => {
  const f = fixture();
  try {
    await f.b.activate("library:save");
    const r = f.b.current;
    await f.s.metadata(r.id, r.revision, { name: "Concurrent" });
    f.edit();
    const other = await put(f.s);
    await f.b.refresh();
    f.b.selected = other.id;
    await f.b.activate("library:open");
    await f.b.activate("library:save-replace");
    assert.equal(f.opens(), 0);
    assert.equal(f.b.confirmation, "replace");
    assert(f.b.dirty);
    assert.match(f.b.status, /another tab/);
  } finally {
    f.s.close();
  }
});
test("Save As, rename and duplicate leave source session/history identity unchanged", async () => {
  const f = fixture();
  try {
    await f.b.activate("library:save");
    const first = f.b.current,
      key = f.port.key();
    await f.b.activate("library:save-as");
    f.b.draft = "Branch";
    await f.b.activate("library:submit");
    assert.notEqual(f.b.current.id, first.id);
    assert.equal(f.port.key(), key);
    assert.equal(f.opens(), 0);
    f.b.selected = f.b.current.id;
    await f.b.activate("library:rename");
    f.b.draft = "Renamed";
    await f.b.activate("library:submit");
    assert.equal(f.b.name, "Renamed");
    assert(!f.b.dirty);
    await f.b.activate("library:duplicate");
    assert.equal((await f.s.list()).length, 3);
    assert.equal(f.port.key(), key);
    assert.equal(f.opens(), 0);
  } finally {
    f.s.close();
  }
});
test("delete confirmation keeps active edits; deleting active saved entry makes session unsaved", async () => {
  const f = fixture();
  try {
    await f.b.activate("library:save");
    f.b.selected = f.b.current.id;
    await f.b.activate("library:delete");
    await f.b.activate("library:cancel");
    assert.equal((await f.s.list()).length, 1);
    await f.b.activate("library:delete");
    await f.b.activate("library:delete-confirm");
    assert.equal((await f.s.list()).length, 0);
    assert(f.b.dirty);
    assert.equal(f.opens(), 0);
  } finally {
    f.s.close();
  }
});
test("busy sessions refuse save and replacement; stale async encoding cannot publish", async () => {
  const f = fixture();
  try {
    f.ready(false);
    await f.b.activate("library:save");
    assert.equal((await f.s.list()).length, 0);
    f.ready(true);
    let finish;
    f.port.encode = () => new Promise((r) => (finish = r));
    const job = f.b.activate("library:save");
    assert(f.b.busy);
    await f.b.activate("library:new");
    assert.equal(f.b.form, null);
    f.edit();
    finish(raw());
    await job;
    assert.equal((await f.s.list()).length, 0);
    assert.match(f.b.status, /changed/);
  } finally {
    f.s.close();
  }
});
test("download current preserves dirty state and export payload integrity", async () => {
  const f = fixture();
  try {
    await f.b.activate("library:download-current");
    assert(f.b.dirty);
    assert.equal(f.downloads.length, 1);
    assert.equal(openSculptProject(f.downloads[0][1]).name, "Untitled");
    assert.equal((await f.s.list()).length, 0);
  } finally {
    f.s.close();
  }
});
test("paged metadata browser has bounded ray targets and placeholder previews without decoding projects", async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 7; i++) await put(f.s, "Project " + i);
    await f.b.refresh();
    assert.equal(f.b.content().buttons.filter((b) => b.id.startsWith("library:select:")).length, 3);
    await f.b.activate("library:next");
    assert.equal(f.b.page, 1);
    for (const b of f.b.content().buttons) {
      assert(b.rect.width >= 74 && b.rect.height >= 74);
      assert(b.rect.y + b.rect.height <= 1152);
    }
    assert.equal(f.opens(), 0);
  } finally {
    f.s.close();
  }
});
test("names reject empty, oversized and control characters", () => {
  for (const name of ["", " ", "x".repeat(81), "a\n"]) assert.throws(() => libraryName(name));
  assert.equal(libraryName("  Sculpture  "), "Sculpture");
});
test("deferred project candidate creates no meshes until explicitly rebuilt and can be disposed", () => {
  const p = openSculptProject(raw()),
    l = new IndependentLayers(p, undefined, true);
  assert.equal(l.active.triangles, 0);
  assert(l.pendingChunks > 0);
  while (l.active.rebuild(1, 1)) {}
  assert(l.active.triangles > 0);
  l.dispose();
  assert.equal(l.group.children.length, 0);
});

test("actual library worker migrates, decodes by transfer and terminates on completion/cancellation", async () => {
  const { LibraryBrowserWorker } = await import("../scripts/fixtures/node-library-worker.mjs"),
    { prepareLibrary } = await import("../work/test-build/library-worker-client.mjs"),
    old = globalThis.Worker;
  globalThis.Worker = LibraryBrowserWorker;
  try {
    const rich = createBaseProject(new SDFVolume(17), settings);
    sculptMask(rich.activeLayer.volume).write(10, 0.5);
    sculptPaint(rich.activeLayer.volume).channels[3].write(20, 1);
    const pixels = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVQIHWP4z8Dwn4GBgQEADfkB/VCm7xQAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const display = {
      mode: "layer-colours",
      colours: {},
      references: [createReference(pixels, "Worker image", "worker-image")],
      lighting: defaultLighting(),
    };
    const result = await prepareLibrary(
      { kind: "import", data: saveSculptProject(rich, display), name: "Worker" },
      new AbortController().signal,
    );
    assert.equal(result.record.name, "Worker");
    const opened = await prepareLibrary(
      { kind: "decode", data: result.data },
      new AbortController().signal,
    );
    const p = hydrateProject(opened.snapshot);
    assert.equal(p.name, "Worker");
    assert.deepEqual(p.displayPreferences.references[0].bytes, pixels);
    assert.equal(sculptMask(p.activeLayer.volume).read(10), 0.5);
    assert.equal(sculptPaint(p.activeLayer.volume).channels[3].read(20), 1);
    const a = new AbortController(),
      job = prepareLibrary(
        { kind: "new", resolution: 192, contents: "sphere", settings },
        a.signal,
      );
    a.abort();
    await assert.rejects(job, /cancelled/);
    assert.equal(LibraryBrowserWorker.active, 0);
    await assert.rejects(
      prepareLibrary(
        { kind: "import", data: new ArrayBuffer(3), name: "Bad" },
        new AbortController().signal,
      ),
      (e) => e.code === "invalid",
    );
    assert.equal(LibraryBrowserWorker.active, 0);
  } finally {
    globalThis.Worker = old;
  }
});

test("stale asynchronous library read cannot replace newly edited current work", async () => {
  const f = fixture();
  try {
    const r = await put(f.s);
    await f.b.refresh();
    f.b.adopted(null, "Current", true);
    f.b.selected = r.id;
    const read = f.s.read.bind(f.s);
    let finish;
    f.s.read = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const job = f.b.activate("library:open");
    f.edit();
    finish(await read(r.id));
    await job;
    assert.equal(f.opens(), 0);
    assert(f.b.dirty);
    assert.match(f.b.status, /changed/);
  } finally {
    f.s.close();
  }
});
test("new scene preparation cannot discard edits made while its worker is pending", async () => {
  const f = fixture();
  try {
    f.b.adopted(null, "Current", true);
    let finish;
    f.port.create = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    await f.b.activate("library:new");
    const job = f.b.activate("library:submit");
    f.edit();
    finish(raw());
    await job;
    assert.equal(f.opens(), 0);
    assert(f.b.dirty);
    assert.match(f.b.status, /changed/);
  } finally {
    f.s.close();
  }
});
test("100-project bound refuses entry 101 without evicting saved work", async () => {
  const s = store(),
    data = raw(),
    base = describeNative(data, "Bounded");
  try {
    for (let i = 0; i < 100; i++)
      await s.put({ ...base, id: `project-${i}`, modified: i }, data, null);
    await assert.rejects(s.put({ ...base, id: "overflow" }, data, null), (e) => e.code === "quota");
    const rows = await s.list();
    assert.equal(rows.length, 100);
    assert.equal(rows[0].id, "project-99");
    assert.equal(rows[99].id, "project-0");
  } finally {
    s.close();
  }
});

test("untouched starter creates a named project directly without a replacement prompt", async () => {
  const f = fixture();
  try {
    const starterKey = f.port.key();
    f.port.pristine = () => f.port.key() === starterKey;
    await f.b.activate("library:new");
    f.b.draft = "My next sculpture";
    await f.b.activate("library:submit");
    assert.equal(f.b.confirmation, null);
    assert.equal(f.opens(), 1);
    assert.equal(f.b.name, "My next sculpture");
    assert.equal(f.b.form, null);
    assert.equal((await f.s.list()).length, 0);
    assert(f.b.dirty);
  } finally {
    f.s.close();
  }
});
test("editing the starter restores the save or discard prompt for new projects", async () => {
  const f = fixture();
  try {
    const starterKey = f.port.key();
    f.port.pristine = () => f.port.key() === starterKey;
    f.edit();
    await f.b.activate("library:new");
    f.b.draft = "Next";
    await f.b.activate("library:submit");
    assert.equal(f.b.confirmation, "replace");
    assert.equal(f.opens(), 0);
    await f.b.activate("library:cancel");
    assert.equal(f.opens(), 0);
    assert(f.b.dirty);
  } finally {
    f.s.close();
  }
});
test("starter exemption still rejects edits made during new project preparation", async () => {
  const f = fixture();
  try {
    const starterKey = f.port.key();
    f.port.pristine = () => f.port.key() === starterKey;
    let finish;
    f.port.create = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    await f.b.activate("library:new");
    const job = f.b.activate("library:submit");
    f.edit();
    finish(raw());
    await job;
    assert.equal(f.opens(), 0);
    assert.match(f.b.status, /changed/);
  } finally {
    f.s.close();
  }
});

test("library edit times use friendly minutes and hours, then calendar dates after one day", () => {
  const now = Date.parse("2026-11-06T10:00:00Z");
  for (const [minutes, expected] of [
    [0, "Just now"],
    [1, "1 min ago"],
    [5, "5 mins ago"],
    [59, "59 mins ago"],
    [60, "1 hr ago"],
    [240, "4 hrs ago"],
    [1439, "23 hrs ago"],
  ]) {
    assert.equal(libraryModifiedLabel(now - minutes * 60_000, now), expected);
  }
  assert.equal(libraryModifiedLabel(now + 60_000, now), "Just now");
  assert.equal(
    libraryModifiedLabel(now - 86400_000, now),
    new Date(now - 86400_000).toLocaleDateString(),
  );
});

test("thumbnail open targets its own project and keeps the unsaved changes prompt", async () => {
  const f = fixture();
  try {
    const a = await put(f.s, "First"),
      b = await put(f.s, "Thumbnail target");
    await f.b.refresh();
    f.b.selected = a.id;
    await f.b.activate(`library:open:${b.id}`);
    assert.equal(f.opens(), 0);
    assert.equal(f.b.confirmation, "replace");
    await f.b.activate("library:discard-replace");
    assert.equal(f.opens(), 1);
    assert.equal(f.b.current.id, b.id);
  } finally {
    f.s.close();
  }
});
