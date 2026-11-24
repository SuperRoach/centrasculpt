// Run npm run build first. Uses a disposable Chromium context.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { componentSurfaceMm } from "../work/test-build/component-view.mjs";
import { DEFAULT_ENCLOSURE } from "../work/test-build/enclosure-recipe.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { createHeadlessEditor } from "./headless-enclosure.mjs";

const { layers, api } = createHeadlessEditor();
const fixture = await api.enclosure.create(
  { ...DEFAULT_ENCLOSURE, innerWidthMm: 110, innerDepthMm: 75, innerHeightMm: 28 },
  { expectedRevision: api.revision },
);
assert(fixture.ok, JSON.stringify(fixture));
const basePart = layers.project.layerStack.get(fixture.value.partIds.base);
const floor = new Vector3(...basePart.transform.position);
const mm = layers.display.precision.millimetresPerUnit;
floor.y += componentSurfaceMm(basePart) / mm;
const native = Buffer.from(saveSculptProject(layers.project));
layers.dispose();

const port = process.env.CENTRA_COMPONENT_SMOKE_PORT ?? "5279";
const url = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    port,
    "--strictPort",
  ],
  { stdio: "inherit" },
);
let browser;
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch (error) {
      if (attempt === 59) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ["--enable-unsafe-swiftshader"],
  });
  const errors = [];
  async function newPage() {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    return page;
  }
  const page = await newPage();
  async function open(page, buffer) {
    await page.locator("#project-file").setInputFiles({
      name: "components.form",
      mimeType: "application/octet-stream",
      buffer,
    });
    await page.locator('[data-library-action="library:open"]').click();
    const status = page.locator("#project-message");
    await status
      .filter({ hasText: /^Opened / })
      .waitFor({ timeout: 120000 })
      .catch(async (error) => {
        throw new Error(`Project reopen: ${await status.textContent()}`, { cause: error });
      });
  }
  await open(page, native);
  assert(await page.locator("#component-layers").isHidden());
  const references = page.locator("#reference-panel");
  const panel = page.locator("#component-panel");
  for (const details of [references, panel]) {
    if (!(await details.evaluate((el) => el.open)))
      await details.locator(":scope > summary").click();
  }
  const button = (name) => panel.getByRole("button", { name, exact: true });
  await button("Insert component").click();
  const canvas = page.locator("#viewport > canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  assert(box);
  const camera = new PerspectiveCamera(38, box.width / box.height, 0.01, 100);
  camera.position.set(2, 2, 3);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const screen = (x, y, z) => {
    const point = new Vector3(x, y, z).project(camera);
    return [box.x + (box.width * (1 + point.x)) / 2, box.y + (box.height * (1 - point.y)) / 2];
  };
  const handleSize = (camera.position.length() * 1.9 * Math.tan((Math.PI * 19) / 180) * 0.85) / 4;
  const xField = panel.getByLabel("Position X (mm)");
  const yField = panel.getByLabel("Position Y (mm)");
  const zField = panel.getByLabel("Position Z (mm)");
  const rotatedY = panel.getByLabel("Rotation Y (degrees)");
  async function beginDrag(at, dx, dy) {
    await page.mouse.move(...at);
    await page.mouse.down();
    await page.mouse.move(at[0] + dx, at[1] + dy, { steps: 6 });
  }
  await page.mouse.click(...screen(0.19, 0.016, 0.08));
  await page
    .locator("#status")
    .filter({ hasText: "Component reference · W Move" })
    .waitFor()
    .catch(async (error) => {
      throw new Error(
        `Viewport selection: ${await page.locator("#status").textContent()} · ${errors.join(", ")}`,
        { cause: error },
      );
    });
  const xHandle = screen(handleSize * 0.4, 0, 0);
  await page.keyboard.down("e");
  await beginDrag(xHandle, 30, 7);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("e");
  assert.equal(Number(await xField.inputValue()), 0);
  await beginDrag(xHandle, 30, 7);
  await canvas.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  assert.equal(Number(await xField.inputValue()), 0);

  await page.keyboard.press("q");
  await page.keyboard.down("f");
  await beginDrag(screen(handleSize * 0.5, 0, 0), 24, 20);
  await page.mouse.up();
  await page.keyboard.up("f");
  assert(Math.abs(Number(await rotatedY.inputValue())) > 1);
  assert.equal(Number(await panel.getByLabel("Rotation X (degrees)").inputValue()), 0);
  assert.equal(Number(await panel.getByLabel("Rotation Z (degrees)").inputValue()), 0);

  await page.keyboard.press("w");
  await page.keyboard.down("e");
  await beginDrag(xHandle, 27, 4);
  await page.mouse.up();
  await page.keyboard.up("e");
  assert(Math.abs(Number(await xField.inputValue())) > 1);
  assert(Math.abs(Number(await yField.inputValue())) < 1e-7);
  assert(Math.abs(Number(await zField.inputValue())) < 1e-7);
  await page.keyboard.press("Escape");
  for (const preset of ["tactile", "pi4"]) {
    await panel.getByLabel("Component preset").selectOption(preset);
    await button("Insert component").click();
  }
  const [base] = await panel
    .getByLabel("Attach to enclosure part")
    .selectOption({ label: "Enclosure Base" });
  await button("Apply placement").click();
  await panel.getByLabel("Underside gap (mm)").fill("5.5");
  await button("Snap to enclosure surface").click();
  await panel.getByText(/Floor clearance 5.50 mm/).waitFor();
  const board = floor.clone().add(new Vector3(0, 5.5 / mm, 0));
  const snappedHandleSize =
    (handleSize * camera.position.distanceTo(board)) / camera.position.length();
  await button("Move").click();
  await page.keyboard.down("e");
  await beginDrag(screen(board.x + snappedHandleSize * 0.4, board.y, board.z), 15, 2);
  await page.mouse.up();
  await page.keyboard.up("e");
  assert(Math.abs(Number(await xField.inputValue())) > 1);
  assert.equal(Number(await yField.inputValue()), 0);
  await panel.getByText(/Floor clearance 5.50 mm/).waitFor();
  await xField.fill("0");
  await button("Apply placement").click();

  await button("Rotate").click();
  await page.keyboard.down("f");
  await beginDrag(screen(board.x + snappedHandleSize * 0.5, board.y, board.z), 12, 8);
  await page.mouse.up();
  await page.keyboard.up("f");
  assert(Math.abs(Number(await rotatedY.inputValue())) > 1);
  assert.equal(Number(await panel.getByLabel("Rotation X (degrees)").inputValue()), 0);
  assert.equal(Number(await panel.getByLabel("Rotation Z (degrees)").inputValue()), 0);
  await rotatedY.fill("0");
  await button("Apply placement").click();
  await panel.getByText(/Floor clearance 5.50 mm/).waitFor();
  await button("Preview mounting posts").click();
  await panel.getByRole("status").filter({ hasText: "Showing Pi 4 mounting posts" }).waitFor();
  await button("Cancel mounting preview").click();
  assert(await button("Create mounting posts").isDisabled());
  await button("Preview mounting posts").click();
  await panel.getByRole("status").filter({ hasText: "Showing Pi 4 mounting posts" }).waitFor();
  await button("Create mounting posts").click();
  await panel
    .getByRole("status")
    .filter({ hasText: "Attachment applied" })
    .waitFor({ timeout: 120000 })
    .catch(async (error) => {
      throw new Error(`Mounting confirmation: ${await panel.getByRole("status").textContent()}`, {
        cause: error,
      });
    });
  const featureFields = panel.getByRole("group", { name: "Connector and button openings" });
  const fill = async (fields) => {
    for (const [label, value] of Object.entries(fields))
      await featureFields.getByLabel(label, { exact: true }).fill(String(value));
  };
  const feedback = panel.getByRole("status");
  const waitNotice = async (message) => {
    await feedback
      .filter({ hasText: message })
      .waitFor({ timeout: 20000 })
      .catch(async (error) => {
        throw new Error(
          `Expected ${message}. Component panel says ${await feedback.textContent()}`,
          { cause: error },
        );
      });
  };
  const featurePose = (x, y, z, width, height) =>
    fill({
      "Functional face local X (mm)": x,
      "Functional face local Y (mm)": y,
      "Functional face local Z (mm)": z,
      "Measured envelope width or diameter (mm)": width,
      ...(height ? { "Measured envelope height (mm)": height } : {}),
      "Horizontal or radial clearance per side (mm)": 0.35,
    });

  await featurePose(45, 9, 1, 13, 15);
  await featureFields.getByLabel("Target base wall").selectOption("enclosure.base.wall.front");
  await button("Preview opening in 3D").click();
  await waitNotice("functional axis");
  await featureFields.getByLabel("Target base wall").selectOption("");
  await button("Preview opening in 3D").click();
  await waitNotice("Showing Pi 4 USB 3 stack opening");
  await button("Cancel opening preview").click();
  assert(await button("Create connector opening").isDisabled());
  await button("Pick wall in viewport").click();
  await page.keyboard.press("Escape");
  await waitNotice("Wall picking cancelled");
  await button("Pick wall in viewport").click();
  assert(await button("Create connector opening").isDisabled());
  await canvas.scrollIntoViewIfNeeded();
  const wallX = floor.x + (55 + DEFAULT_ENCLOSURE.wallThicknessMm) / mm;
  await page.mouse.click(...screen(wallX, floor.y + 8 / mm, floor.z));
  await waitNotice("Showing Pi 4 USB 3 stack opening");
  assert.equal(
    await featureFields.getByLabel("Target base wall").inputValue(),
    "enclosure.base.wall.right",
  );
  await button("Create connector opening").click();
  await waitNotice("Attachment applied");

  await panel.getByLabel("Component preset").selectOption("devkit");
  await button("Insert component").click();
  await panel.getByLabel("Attach to enclosure part").selectOption(base);
  await yField.fill("-2");
  await zField.fill("-18");
  await rotatedY.fill("90");
  await button("Apply placement").click();
  await featurePose(0, 3, 25, 8, 4);
  await featureFields.getByLabel("Vertical clearance per side (mm)").fill("0.4");
  await button("Preview opening in 3D").click();
  await waitNotice("Showing DevKitC Micro USB opening");
  await button("Create connector opening").click();
  await waitNotice("Attachment applied");

  await panel
    .getByLabel("Project component")
    .selectOption({ label: "Generic 6 × 6 mm tactile switch · 2" });
  await panel.getByLabel("Attach to enclosure part").selectOption(base);
  await zField.fill("30");
  await panel.getByLabel("Rotation X (degrees)").fill("90");
  await button("Apply placement").click();
  await featurePose(0, 4.5, 0, 3.3);
  await button("Preview opening in 3D").click();
  await waitNotice("actuator travel");
  await featureFields.getByLabel("Include printable button plunger").check();
  await fill({
    "Measured actuator travel (mm)": 0.5,
    "Usable inward actuator depth (mm)": 1,
    "Cap diameter (mm)": 8,
    "Cap height (mm)": 2,
    "Shaft diameter (mm)": 4,
    "Shaft length (mm)": 3 + DEFAULT_ENCLOSURE.wallThicknessMm + 0.5,
  });
  await button("Preview opening in 3D").click();
  await waitNotice("Showing Tactile button opening");
  await button("Create opening and printable plunger").click();
  await waitNotice("Attachment applied");
  await page.locator("#project-menu-toggle").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .locator("#project-menu")
      .getByRole("button", { name: "Download .form", exact: true })
      .click(),
  ]);
  const bytes = await readFile(await download.path());
  const result = openSculptProject(Uint8Array.from(bytes).buffer);
  assert.deepEqual(
    result.displayPreferences.components.map((item) => item.preset),
    ["pcb", "tactile", "pi4", "devkit"],
  );
  const pi = result.displayPreferences.components[2];
  assert.equal(pi.hostId, base);
  assert(Math.abs(result.displayPreferences.components[0].positionMm[0]) > 1);
  assert.equal(pi.gapMm, 5.5);
  const part = result.layerStack.get(base).assemblyPart.enclosure;
  assert.equal(part.features[0].definition.heightMm, 5.5);
  assert.deepEqual(part.features[0].definition.centresMm, [
    [-39, -24.5],
    [-39, 24.5],
    [19, -24.5],
    [19, 24.5],
  ]);
  assert.deepEqual(
    part.features.slice(1).map(({ definition }) => definition.anchor),
    ["enclosure.base.wall.right", "enclosure.base.wall.right", "enclosure.base.wall.front"],
  );
  assert(result.layerStack.layers.find((layer) => layer.name === "Button plunger")?.assemblyPart);
  await page.context().close();
  const reopened = await newPage();
  await open(reopened, bytes);
  const reopenedComponents = reopened.locator("#component-panel");
  await reopenedComponents
    .getByLabel("Project component")
    .locator("option")
    .filter({ hasText: "Raspberry Pi 4 Model B ·" })
    .waitFor({ state: "attached" });
  assert.equal(
    await reopenedComponents.getByLabel("Project component").locator("option").count(),
    4,
  );
  const componentRows = reopened.getByRole("region", { name: "Component references" });
  const switchRow = componentRows.getByRole("button", { name: /tactile switch/ });
  const sculptLayers = reopened.locator(".hierarchy-palette [data-node-id]");
  const sculptCount = await sculptLayers.count();
  await switchRow.click();
  assert.equal(await switchRow.getAttribute("aria-pressed"), "true");
  assert(await reopenedComponents.locator(".reference-card.is-selected").isVisible());
  assert.equal(
    await reopenedComponents.getByLabel("Project component").inputValue(),
    await switchRow.getAttribute("data-component-id"),
  );
  reopened.once("dialog", (dialog) => dialog.dismiss());
  await reopened.keyboard.press("Backspace");
  assert(await switchRow.isVisible());
  reopened.once("dialog", (dialog) => dialog.accept());
  await reopened.keyboard.press("Delete");
  await switchRow.waitFor({ state: "detached" });
  assert.equal(await sculptLayers.count(), sculptCount);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: component picking, constrained free and snapped drags, interrupted gestures, mounting preview, measured USB and button cutouts, separate plunger, native reopen and component selection/deletion through Layers",
  );
} finally {
  await browser?.close();
  server.kill();
}
