// Run npm run build first. Uses a disposable browser profile and a generated project.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { PerspectiveCamera, Vector2 } from "three";
import "./compile-core.mjs";
import { DEFAULT_ENCLOSURE } from "../work/test-build/enclosure-recipe.mjs";
import { faceCorners, pickBoxFace } from "../work/test-build/face-resize.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { ModellingAPI } from "../work/test-build/modelling-api.mjs";
import { saveSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { identityTransform, transformMatrix } from "../work/test-build/transform.mjs";

const output = resolve(process.argv[2] ?? "work/face-resize-browser");
await mkdir(output, { recursive: true });
const enclosure = process.argv.includes("--enclosure");
const pos = enclosure ? [1.8, 1.35, 2.1] : [2.4, 1.8, 3];
const commitDelta = enclosure ? 0.035 : 0.55;
const empty = new SDFVolume(17, 1.6, false);
empty.values.fill(6.4);
const editor = new IndependentLayers(
  createBaseProject(empty, {
    mode: "add",
    radius: 0.2,
    strength: 0.3,
    hardness: 0,
    camera: { position: pos, target: [0, 0, 0] },
  }),
);
let cutter;
if (enclosure) {
  const api = new ModellingAPI(editor);
  const created = await api.enclosure.create(
    {
      ...DEFAULT_ENCLOSURE,
      innerWidthMm: 90,
      innerHeightMm: 42,
      innerDepthMm: 66,
    },
    { expectedRevision: api.revision },
  );
  assert(created.ok, JSON.stringify(created));
  const { base, lid } = created.value.partIds;
  const port = await api.enclosure.setFeature(
    base,
    lid,
    {
      kind: "cutout",
      name: "Connector opening",
      anchor: "enclosure.base.wall.front",
      shape: "rectangle",
      uMm: 17,
      vMm: 16,
      widthMm: 12,
      heightMm: 8,
      insetMm: 0,
    },
    { expectedRevision: api.revision },
  );
  assert(port.ok, JSON.stringify(port));
  cutter = editor.project.layerStack.get(port.value.features[0].sourceIds[0]);
} else {
  const host = await editor.regeneratePrimitive({
    kind: "box",
    width: 2.1,
    height: 1.6,
    depth: 1.55,
  });
  cutter = await editor.regeneratePrimitive(
    { kind: "box", width: 0.7, height: 0.7, depth: 0.8 },
    undefined,
    undefined,
    { ...identityTransform(), position: [0.25, -0.12, 0.13] },
  );
  editor.setBooleanModifiers(host.id, [
    { id: "slot", sourceId: cutter.id, operation: "difference", enabled: true },
  ]);
}
const source = cutter.primitive;
const pose = structuredClone(cutter.transform);
editor.select(cutter.id);
const bytes = Buffer.from(saveSculptProject(editor.project));
editor.dispose();

const port = 5267;
const url = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { stdio: ["ignore", "ignore", "inherit"] },
);
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch (error) {
      if (i === 59) throw error;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ["--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(url);
  await page.locator("#project-file").setInputFiles({
    name: "hidden-cutter.form",
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  await page.locator('[data-library-action="library:open"]').click();
  await page
    .locator("#project-message")
    .filter({ hasText: /^Opened / })
    .waitFor();
  if (enclosure) {
    const quality = page.locator("#composite-quality");
    await quality.evaluate((el) => {
      el.closest("details").open = true;
    });
    await quality.selectOption("64");
  }
  const boolean = page.locator('[data-surface-view="boolean"]');
  if ((await boolean.getAttribute("aria-pressed")) !== "true") await boolean.click();
  await page
    .locator("#composite-info")
    .filter({ hasText: "Preview ready" })
    .waitFor({ timeout: 60_000 });
  await page.locator('[data-tool="scale"]').click();
  await page
    .locator("#transform-note")
    .filter({ hasText: /^Face Resize:/ })
    .waitFor();
  const canvas = page.locator("#viewport canvas").first();
  const rect = await canvas.boundingBox();
  assert(rect);
  const camera = new PerspectiveCamera(38, rect.width / rect.height, 0.01, 100);
  camera.position.fromArray(pos);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const matrix = transformMatrix(pose);
  const screen = (v) => {
    const p = v.applyMatrix4(matrix).project(camera);
    return new Vector2(((p.x + 1) * rect.width) / 2, ((1 - p.y) * rect.height) / 2);
  };
  const status = page.getByText("Face Resize · drag along the highlighted side · Esc to cancel", {
    exact: true,
  });
  let drag;
  for (const axis of [1, 0, 2]) {
    if (drag) break;
    for (const sign of [-1, 1]) {
      const corners = faceCorners(source, { axis, sign });
      for (const local of [
        corners[0].clone().lerp(corners[2], 0.5),
        ...corners.map((c, i) => c.clone().lerp(corners[(i + 1) % 4], 0.6)),
      ]) {
        const p = screen(local);
        const hit = pickBoxFace(source, matrix, camera, rect.width, rect.height, p);
        if (!hit) continue;
        await page.mouse.move(rect.x + p.x, rect.y + p.y);
        await page.mouse.down();
        if (await status.isVisible()) {
          drag = { hit, p };
          break;
        }
        await page.keyboard.press("Escape");
        await page.mouse.up();
      }
      if (drag) break;
    }
  }
  assert(drag, "The cutter should have a pickable source face outside the centre gizmo.");
  const history = page.locator("#history-info");
  const initial = await history.textContent();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.mouse.move(rect.x + drag.p.x + 14, rect.y + drag.p.y + 14);
  await page.mouse.move(rect.x + drag.p.x, rect.y + drag.p.y);
  await canvas.screenshot({ path: `${output}/hidden-cutter-hover.png` });
  await page.mouse.down();
  await status.waitFor();
  const move = async (delta) => {
    const p = drag.p.clone().addScaledVector(drag.hit.pixelsPerUnit, delta);
    await page.mouse.move(rect.x + p.x, rect.y + p.y, { steps: 5 });
  };
  await move(enclosure ? 0.018 : 0.25);
  await canvas.screenshot({ path: `${output}/hidden-cutter-preview.png` });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await history.textContent(), initial);
  await page.mouse.move(rect.x + drag.p.x, rect.y + drag.p.y);
  await page.mouse.down();
  await status.waitFor();
  await move(enclosure ? 0.018 : 0.25);
  await canvas.dispatchEvent("pointerup", { pointerId: 1024, button: 0, isPrimary: false });
  await canvas.dispatchEvent("pointercancel", { pointerId: 1024, isPrimary: false });
  assert.equal(await history.textContent(), initial);
  await canvas.evaluate((el) => {
    for (let id = 1; id <= 32; id++) {
      if (el.hasPointerCapture(id)) {
        el.releasePointerCapture(id);
        return;
      }
    }
    throw new Error("Expected real mouse capture");
  });
  await move(enclosure ? 0.02 : 0.3);
  await page.mouse.up();
  assert.equal(await history.textContent(), initial);
  await page.mouse.move(rect.x + drag.p.x, rect.y + drag.p.y);
  await page.mouse.down();
  await status.waitFor();
  await move(commitDelta);
  await page.mouse.up();
  await page.getByText("Primitive dimensions applied · Undo available", { exact: true }).waitFor();
  assert.match(await history.textContent(), /^1 undo · 0 redo$/);
  const field = page.locator(`[data-transform-field="p${"xyz"[drag.hit.face.axis]}"]`);
  const expected =
    100 * (pose.position[drag.hit.face.axis] + (drag.hit.face.sign * commitDelta) / 2);
  assert(Math.abs(Number(await field.inputValue()) - expected) < 0.1);
  await page
    .locator("#composite-info")
    .filter({ hasText: "Preview ready" })
    .waitFor({ timeout: 60_000 });
  await canvas.screenshot({ path: `${output}/hidden-cutter-committed.png` });
  await page.locator("#undo").click();
  assert.match(await history.textContent(), /^0 undo · 1 redo$/);
  assert(
    Math.abs(Number(await field.inputValue()) - pose.position[drag.hit.face.axis] * 100) < 0.001,
  );
  await page.locator("#redo").click();
  assert.match(await history.textContent(), /^1 undo · 0 redo$/);
  assert(Math.abs(Number(await field.inputValue()) - expected) < 0.1);
  assert.deepEqual(errors, []);
  console.log(
    `Hidden cutter acquired on ${drag.hit.face.axis}/${drag.hit.face.sign}; Escape, pointer ownership, capture loss, one-entry commit, Undo/Redo, and centre shift passed.`,
  );
} finally {
  await browser?.close();
  server.kill();
}
