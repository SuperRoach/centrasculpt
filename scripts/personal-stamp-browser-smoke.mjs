// Two disposable browser profiles; user storage is never opened.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
try {
  const source = await browser.newPage(),
    target = await browser.newPage();
  const errors = [];
  for (const page of [source, target]) {
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5268");
  }
  await source.locator("#personal-shapes").click();
  for (let i = 0; i < 2; i++) {
    await source.getByRole("button", { name: "Save selected as Shape", exact: true }).click();
    await source
      .getByRole("button", { name: "Save Shape", exact: true })
      .waitFor({ timeout: 60000 });
    await source.getByRole("textbox", { name: "Shape name" }).fill(`Portable ${i}`);
    await source
      .getByRole("combobox", { name: "Insertion pivot" })
      .selectOption(i ? "base" : "centre");
    await source.getByRole("button", { name: "Save Shape", exact: true }).click();
    await source.getByRole("heading", { name: `Portable ${i}`, exact: true }).waitFor();
  }
  const originals = await source.evaluate(async () => {
    const { PersonalShapeLibrary } = await import("/src/personal-shapes.ts");
    const library = new PersonalShapeLibrary();
    return Promise.all(
      (await library.shapes()).map(async (r) => ({
        record: r,
        data: Array.from(new Uint8Array((await library.read(r.id)).data)),
      })),
    );
  });
  await source.getByRole("button", { name: "Export Library Backup", exact: true }).click();
  await source.getByRole("status").filter({ hasText: "2 shapes" }).waitFor();
  const downloadEvent = source.waitForEvent("download");
  await source.getByRole("button", { name: "Download Library Backup", exact: true }).click();
  const download = await downloadEvent,
    path = await download.path();
  await target.locator("#personal-shapes").click();
  async function choose() {
    await target.getByRole("button", { name: "Import Library Backup", exact: true }).click();
    await target.getByLabel("Library backup file").setInputFiles(path);
    await target
      .getByRole("button", { name: "Confirm Import Library Backup", exact: true })
      .waitFor();
  }
  await choose();
  await target.getByRole("button", { name: "Cancel Import", exact: true }).click();
  await target.getByRole("status").filter({ hasText: "Import cancelled" }).waitFor();
  await choose();
  await target.getByRole("button", { name: "Confirm Import Library Backup", exact: true }).click();
  await target.getByRole("status").filter({ hasText: "Restored 2 shapes" }).waitFor();
  const restored = await target.evaluate(async () => {
    const { PersonalShapeLibrary } = await import("/src/personal-shapes.ts");
    const library = new PersonalShapeLibrary();
    return Promise.all(
      (await library.shapes()).map(async (r) => ({
        record: r,
        data: Array.from(new Uint8Array((await library.read(r.id)).data)),
      })),
    );
  });
  for (const a of originals) {
    const b = restored.find((b) => b.record.id === a.record.id);
    assert.deepEqual(b.data, a.data);
    for (const key of [
      "name",
      "created",
      "modified",
      "dimensionsMM",
      "pivot",
      "thumbnail",
      "millimetresPerUnit",
    ])
      assert.deepEqual(b.record[key], a.record[key]);
  }
  await choose();
  await target.getByRole("status").filter({ hasText: "2 duplicates skipped" }).waitFor();
  await target.getByRole("button", { name: "Confirm Import Library Backup", exact: true }).click();
  await target.getByRole("status").filter({ hasText: "Restored 0 shapes" }).waitFor();
  await target.getByRole("button", { name: "Browse", exact: true }).click();
  const cdp = await target.context().newCDPSession(target),
    memory = {
      method:
        "Disposable Chromium restored starter-shape UI workload. Runtime.getHeapUsage after GC for retained snapshots; 50 ms samples are observed peaks, not continuous maxima. Backing storage includes ArrayBuffers, not GPU allocations.",
      snapshots: [],
      samples: [],
    };
  async function snapshot(label) {
    await cdp.send("HeapProfiler.collectGarbage");
    memory.snapshots.push({ label, ...(await cdp.send("Runtime.getHeapUsage")) });
  }
  await snapshot("before selection");
  const timer = setInterval(() => {
    void cdp
      .send("Runtime.getHeapUsage")
      .then((v) => memory.samples.push(v))
      .catch(() => {});
  }, 50);
  await target.getByRole("button", { name: "Use as Stamp", exact: true }).first().click();
  await target
    .getByRole("dialog", { name: "Personal Shapes", exact: true })
    .waitFor({ state: "hidden" });
  await target.locator("#shape-description").filter({ hasText: "Portable" }).waitFor();
  await target.locator("#shape-follow").uncheck();
  for (const [axis, value] of [
    ["px", "0"],
    ["py", "0"],
    ["pz", "1"],
    ["scale", "0.35"],
  ]) {
    await target.locator(`[data-shape-field="${axis}"]`).fill(value);
  }
  await target.locator("#stamp-shape-overlay").click();
  await target.locator("#undo:not([disabled])").waitFor();
  await target.locator("#undo").click();
  await target.locator("#redo").click();
  await target.getByLabel("Shape Subtract", { exact: true }).click();
  await target.locator("#stamp-shape-overlay").click();
  await target.locator("#undo").click();
  await snapshot("selected master after stamps and Undo/Redo");
  await target.screenshot({ path: "work/personal-stamp-desktop.png" });
  await target.locator('[data-shape-kind="box"]').click();
  await snapshot("released personal selection");
  clearInterval(timer);
  memory.observedPeakUsedSize = Math.max(...memory.samples.map((v) => v.usedSize));
  memory.observedPeakBackingStorageSize = Math.max(
    ...memory.samples.map((v) => v.backingStorageSize ?? 0),
  );
  writeFileSync("work/personal-stamp-browser-memory.json", JSON.stringify(memory, null, 2));
  const afterStamp = await target.evaluate(async () => {
    const { PersonalShapeLibrary } = await import("/src/personal-shapes.ts");
    const library = new PersonalShapeLibrary();
    return Promise.all(
      (await library.shapes()).map(async (r) => ({
        id: r.id,
        data: Array.from(new Uint8Array((await library.read(r.id)).data)),
      })),
    );
  });
  for (const record of restored)
    assert.deepEqual(afterStamp.find((r) => r.id === record.record.id).data, record.data);
  const roundtrip = await target.evaluate(async () => {
    const { PersonalShapeLibrary } = await import("/src/personal-shapes.ts"),
      { IndependentLayers } = await import("/src/independent-layers.ts"),
      { createBaseProject } = await import("/src/layers.ts"),
      { SDFVolume } = await import("/src/sdf.ts");
    const { saveSculptProject, openSculptProject } = await import("/src/project.ts"),
      { encodeSTL } = await import("/src/stl-export.ts");
    const db = new PersonalShapeLibrary(),
      records = await db.shapes(),
      { layer } = await db.master(records[0].id);
    const original = layer.volume.values.slice();
    const target = new IndependentLayers(
      createBaseProject(new SDFVolume(25), {
        mode: "add",
        radius: 0.22,
        strength: 0.35,
        hardness: 0.5,
        camera: { position: [2, 2, 3], target: [0, 0, 0] },
      }),
    );
    const inserted = await target.insertPersonalShape(layer, 1, new AbortController().signal);
    target.select(inserted.id);
    target.beginStroke();
    target.applyStroke({ x: 0, y: 0, z: 0.55 }, 0.4, "add", 0.8, 0.1, 0.4);
    target.finishStroke();
    const loaded = openSculptProject(saveSculptProject(target.project));
    if (!inserted.volume.values.some((v, i) => v !== original[i]))
      throw new Error("Edit had no effect");
    if (
      !loaded.layerStack
        .get(inserted.id)
        .volume.values.every((v, i) => v === inserted.volume.values[i])
    )
      throw new Error("Form mismatch");
    if (!(await db.master(records[0].id)).layer.volume.values.every((v, i) => v === original[i]))
      throw new Error("Master modified");
    const stl = await encodeSTL(
      target.exportSources("selected", false),
      "fast",
      256 * 1024 ** 2,
      50,
    );
    target.dispose();
    return { size: stl.data.byteLength, blocking: stl.report.blocking };
  });
  assert(roundtrip.size > 84);
  assert.deepEqual(roundtrip.blocking, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: isolated profiles; two exact payloads/metadata/thumbnails; UI export/preview/cancel/restore/duplicates; restored Use as Stamp, Add/Subtract, Undo/Redo; insert/edit/form/STL; independent masters; no page errors",
  );
} finally {
  await browser.close();
}
