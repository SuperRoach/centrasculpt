// Two disposable browser profiles; user storage is never opened.
import assert from "node:assert/strict";
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
    "PASS: isolated profiles; two exact payloads/metadata/thumbnails; UI export/preview/cancel/restore/duplicates; insert/edit/form/STL; independent masters; no page errors",
  );
} finally {
  await browser.close();
}
