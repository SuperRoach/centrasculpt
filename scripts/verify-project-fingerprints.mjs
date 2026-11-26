import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, firefox, webkit } from "@playwright/test";
import "./compile-core.mjs";
import { LayerStack, SculptProject, SdfLayer } from "../work/test-build/layers.mjs";
import { evaluatePrimitive } from "../work/test-build/parametric-primitive.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";

const directory = "work/phase-8-9a";
const origin = process.env.CENTRA_FINGERPRINT_ORIGIN ?? "http://127.0.0.1:5289";
const fixture = `${directory}/primitive-fingerprints.form`;
const enclosure = `${directory}/electronics-default-20-compact.form`;
const url = `${origin}/scripts/fixtures/project-fingerprint.html?file=/${fixture}&file=/${enclosure}`;

if (process.argv[2] === "--prepare") {
  mkdirSync(directory, { recursive: true });
  const primitives = [
    { kind: "box", width: 0.4, height: 0.3, depth: 0.5 },
    { kind: "box", width: 0.4, height: 0.3, depth: 0.5, cornerRadius: 0.04 },
    { kind: "cylinder", diameter: 0.4, height: 0.5, topDiameter: 0.25 },
    { kind: "sphere", diameter: 0.43 },
    { kind: "capsule", diameter: 0.3, height: 0.6 },
    { kind: "torus", majorRadius: 0.3, tubeDiameter: 0.14 },
  ];
  const layers = primitives.map((primitive, order) => {
    const evaluation = evaluatePrimitive(primitive, 63, 63 ** 3);
    let step = evaluation.next();
    while (!step.done) step = evaluation.next();
    return new SdfLayer(step.value, { primitive, order, id: `primitive-${order}` });
  });
  const project = new SculptProject(
    new LayerStack(layers),
    {
      mode: "add",
      radius: 0.12,
      strength: 0.5,
      hardness: 0.5,
      camera: { position: [2, 2, 3], target: [0, 0, 0] },
    },
    "Cross-engine source fixtures",
    "cross-engine-source-fixtures",
  );
  writeFileSync(fixture, new Uint8Array(saveSculptProject(project)));
  for (const path of [fixture, enclosure]) {
    const input = readFileSync(path);
    const output = saveSculptProject(openSculptProject(Uint8Array.from(input).buffer));
    assert.deepEqual(Buffer.from(output), input);
  }
  console.log(`Node ${process.version} verified both fixtures. Open ${url}`);
} else {
  const reports = {};
  const options = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {};
  const questCDP = process.env.CENTRA_QUEST_CDP;
  const engines = questCDP
    ? [["Quest", () => chromium.connectOverCDP(questCDP)]]
    : [
        ["Chromium", () => chromium.launch(options)],
        ["Firefox", () => firefox.launch()],
        ["WebKit", () => webkit.launch()],
      ];
  let failed = false;
  for (const [name, connect] of engines) {
    let browser;
    try {
      browser = await connect();
    } catch (error) {
      reports[name] = { unavailable: error.message.split("\n")[0] };
      continue;
    }
    try {
      const page = questCDP ? await browser.contexts()[0].newPage() : await browser.newPage();
      await page.goto(url);
      await page.waitForFunction(() => globalThis.fingerprintReport);
      const report = await page.evaluate(() => globalThis.fingerprintReport);
      assert(!report.error, report.error);
      assert.deepEqual(
        report.fixtures.map((row) => row.fingerprintedLayers),
        [6, 20],
      );
      reports[name] = { version: browser.version(), ...report };
    } catch (error) {
      reports[name] = { error: error.message };
      failed = true;
    } finally {
      await browser.close();
    }
  }
  console.log(JSON.stringify(reports, null, 2));
  if (failed || !Object.values(reports).some((report) => report.fixtures)) process.exitCode = 1;
}
