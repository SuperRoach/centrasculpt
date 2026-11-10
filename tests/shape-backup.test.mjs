import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { createBaseProject } from "../work/test-build/layers.mjs";
import {
  compressPersonalShape,
  encodePersonalShape,
  PersonalShapeLibrary,
} from "../work/test-build/personal-shapes.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import {
  BACKUP_LIMIT,
  exportShapeBackup,
  previewShapeBackup,
} from "../work/test-build/shape-backup.mjs";

// Node has no image decoder; actual image decoding is covered in Chromium.
globalThis.createImageBitmap = async () => ({ width: 128, height: 128, close() {} });
const settings = {
  mode: "add",
  radius: 0.22,
  strength: 0.35,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
async function fixture() {
  const library = new PersonalShapeLibrary(new IDBFactory(), "source");
  for (let i = 0; i < 2; i++) {
    const project = createBaseProject(new SDFVolume(25), settings);
    project.activeLayer.volume.values[7812] = i * 0.123;
    const e = encodePersonalShape(
      project,
      project.activeLayer,
      `Shape ${i}`,
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
      [10 + i, 20, 30],
      100,
      i ? "base" : "centre",
    );
    const packed = await compressPersonalShape(e.record, e.data);
    await library.put(packed.record, packed.data, null);
  }
  return library;
}
test("lossless multi-shape portable restore, conflict copies, duplicate skip, preservation", async () => {
  const source = await fixture(),
    blob = await exportShapeBackup(source),
    preview = await previewShapeBackup(blob);
  const target = new PersonalShapeLibrary(new IDBFactory(), "fresh");
  assert.equal((await target.restore(preview)).imported, 2);
  const before = await source.shapes();
  for (const record of before) {
    const a = await source.master(record.id),
      b = await target.master(record.id);
    assert.deepEqual(a.layer.volume.values, b.layer.volume.values);
    for (const key of [
      "dimensionsMM",
      "pivot",
      "thumbnail",
      "created",
      "modified",
      "millimetresPerUnit",
    ])
      assert.deepEqual(a.record[key], b.record[key]);
    assert.deepEqual((await source.read(record.id)).data, (await target.read(record.id)).data);
  }
  assert.equal((await target.restore(preview)).imported, 0);
  const conflict = new PersonalShapeLibrary(new IDBFactory(), "conflict");
  await conflict.put(
    { ...preview.entries[0].record, backupFingerprint: undefined, name: "Keep me" },
    preview.entries[0].data,
    null,
  );
  const result = await conflict.restore(preview);
  assert.equal(result.conflicts, 1);
  assert.equal((await conflict.shapes()).length, 3);
  assert.equal((await conflict.read(preview.entries[0].record.id)).record.name, "Keep me");
  assert.deepEqual(await source.shapes(), before);
  source.close();
  target.close();
  conflict.close();
});
test("corrupt, truncated, incompatible, trailing and oversized backups refused", async () => {
  const source = await fixture(),
    blob = await exportShapeBackup(source);
  for (const offset of [0, 12, 50, blob.size - 1]) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    bytes[offset] ^= 1;
    await assert.rejects(previewShapeBackup(new Blob([bytes])));
  }
  await assert.rejects(previewShapeBackup(blob.slice(0, blob.size - 1)));
  await assert.rejects(previewShapeBackup(new Blob([blob, "extra"])));
  await assert.rejects(previewShapeBackup(new Blob([new Uint8Array(BACKUP_LIMIT + 1)])), /limit/);
  source.close();
});
test("quota, count, cancellation and interrupted transaction preserve all prior records", async () => {
  const source = await fixture(),
    preview = await previewShapeBackup(await exportShapeBackup(source));
  const small = new PersonalShapeLibrary(new IDBFactory(), "small", 16);
  await assert.rejects(small.restore(preview), /limit/);
  assert.equal((await small.shapes()).length, 0);
  const target = new PersonalShapeLibrary(new IDBFactory(), "atomic");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(target.restore(preview, controller.signal), /cancelled/);
  await assert.rejects(previewShapeBackup(new Blob(), controller.signal), /cancelled/);
  await assert.rejects(exportShapeBackup(source, controller.signal), /cancelled/);
  const original = IDBObjectStore.prototype.add;
  let calls = 0;
  IDBObjectStore.prototype.add = function (...args) {
    const result = original.apply(this, args);
    if (++calls === 3) this.transaction.abort();
    return result;
  };
  try {
    await assert.rejects(target.restore(preview));
  } finally {
    IDBObjectStore.prototype.add = original;
  }
  assert.equal((await target.shapes()).length, 0);
  const large = {
    entries: Array.from({ length: 101 }, (_, i) => ({
      ...preview.entries[0],
      record: { ...preview.entries[0].record, id: `large-${i}`, backupFingerprint: `unique-${i}` },
    })),
    bytes: 1,
  };
  await assert.rejects(target.restore(large), /limit/);
  assert.equal((await target.shapes()).length, 0);
  source.close();
  small.close();
  target.close();
});

async function rewrite(blob, mutate) {
  const bytes = await blob.arrayBuffer(),
    length = new DataView(bytes).getUint32(8, true);
  const manifest = JSON.parse(new TextDecoder().decode(bytes.slice(44, 44 + length)));
  await mutate(manifest);
  const raw = new TextEncoder().encode(JSON.stringify(manifest));
  const header = new Uint8Array(bytes.slice(0, 44));
  new DataView(header.buffer).setUint32(8, raw.length, true);
  header.set(new Uint8Array(await crypto.subtle.digest("SHA-256", raw)), 12);
  return new Blob([header, raw, bytes.slice(44 + length)]);
}
test("valid manifest hashes cannot bypass version, declared-length, thumbnail and memory checks", async () => {
  const source = await fixture(),
    blob = await exportShapeBackup(source);
  for (const change of [
    (m) => {
      m.version = 2;
    },
    (m) => {
      m.entries[0].record.bytes++;
    },
    (m) => {
      m.entries[0].record.masterBytes = 128 * 1024 ** 2;
    },
    (m) => {
      m.entries[0].record.thumbnail = "data:image/png;base64,aA==";
    },
    (m) => {
      m.entries[1].record.id = m.entries[0].record.id;
    },
    (m) => {
      m.entries[0].record.dimensionsMM = [-1, 1, 1];
    },
  ])
    await assert.rejects(previewShapeBackup(await rewrite(blob, change)));
  source.close();
});
test("100-shape library restores atomically and survives reopen; count 101 refused", async () => {
  const source = await fixture(),
    original = await previewShapeBackup(await exportShapeBackup(source));
  const big = new PersonalShapeLibrary(new IDBFactory(), "hundred");
  for (let i = 0; i < 100; i++) {
    const e = original.entries[i % 2];
    await big.put(
      { ...e.record, id: `shape-${i}`, name: `Shape ${i}`, backupFingerprint: undefined },
      e.data,
      null,
    );
  }
  const blob = await exportShapeBackup(big),
    preview = await previewShapeBackup(blob),
    factory = new IDBFactory();
  const target = new PersonalShapeLibrary(factory, "large-target");
  assert.equal((await target.restore(preview)).imported, 100);
  target.close();
  const reopened = new PersonalShapeLibrary(factory, "large-target");
  assert.equal((await reopened.shapes()).length, 100);
  await assert.rejects(
    previewShapeBackup(await rewrite(blob, (m) => m.entries.push(m.entries[0]))),
  );
  source.close();
  big.close();
  reopened.close();
});

test("mid-write quota failure and cancellation preserve an existing record and payload", async () => {
  const source = await fixture(),
    preview = await previewShapeBackup(await exportShapeBackup(source));
  const target = new PersonalShapeLibrary(new IDBFactory(), "prior-record");
  const entry = preview.entries[0];
  await target.put(
    { ...entry.record, id: "prior", backupFingerprint: undefined },
    entry.data,
    null,
  );
  const prior = await target.read("prior"),
    original = IDBObjectStore.prototype.add;
  for (const mode of ["quota", "cancel"]) {
    let calls = 0;
    const controller = new AbortController();
    IDBObjectStore.prototype.add = function (...args) {
      const result = original.apply(this, args);
      if (++calls === 2) {
        if (mode === "quota") throw new DOMException("Simulated disk quota", "QuotaExceededError");
        controller.abort();
      }
      return result;
    };
    try {
      await assert.rejects(
        target.restore(preview, controller.signal),
        (e) => e.code === (mode === "quota" ? "quota" : "cancelled"),
      );
    } finally {
      IDBObjectStore.prototype.add = original;
    }
    assert.equal((await target.shapes()).length, 1);
    assert.deepEqual(await target.read("prior"), prior);
  }
  source.close();
  target.close();
});
