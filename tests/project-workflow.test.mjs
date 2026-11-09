import assert from "node:assert/strict";
import test from "node:test";
import { openSculptProject } from "../work/test-build/project.mjs";
import { leaveForProject, newProjectData } from "../work/test-build/project-workflow.mjs";

const settings = {
  mode: "paint",
  radius: 0.22,
  strength: 0.35,
  hardness: 0,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
for (const resolution of [64, 128, 192])
  for (const contents of ["empty", "sphere"])
    test(`New Project ${resolution} ${contents} is a valid independent native project`, () => {
      const project = openSculptProject(newProjectData(resolution, contents, settings));
      assert.equal(project.layerStack.layers.length, 1);
      const layer = project.layerStack.layers[0];
      assert.equal(layer.volume.resolution, resolution);
      assert(layer.editable);
      assert.equal(project.settings.mode, "add");
      assert.equal(settings.mode, "paint");
      assert.equal(
        layer.volume.values.some((v) => v < 0),
        contents === "sphere",
      );
      assert.equal(layer.procedural, undefined);
    });
test("New Project rejects malformed choices before allocating", () => {
  for (const [r, c] of [
    [512, "empty"],
    [64, "invalid"],
    [NaN, "sphere"],
  ])
    assert.throws(() => newProjectData(r, c, settings));
});
for (const environment of ["studio", "passthrough"])
  test(`${environment} project handoff waits for exit and rechecks busy state`, async () => {
    let shown = 0,
      finish;
    const session = {
      state: "presenting",
      exit: () =>
        new Promise((resolve) => {
          finish = () => {
            session.state = "ready";
            resolve();
          };
        }),
    };
    const pending = leaveForProject(
      session,
      () => true,
      () => shown++,
    );
    assert.equal(shown, 0);
    finish();
    await pending;
    assert.equal(shown, 1);
    await assert.rejects(
      leaveForProject(
        { state: "presenting", exit: async () => {} },
        () => true,
        () => shown++,
      ),
    );
    await assert.rejects(
      leaveForProject(
        { state: "ready", exit: async () => {} },
        () => false,
        () => shown++,
      ),
    );
    assert.equal(shown, 1);
  });
test("recovery entry owns its confirmation and retains one dialog through restore and VR entry", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("src/main.ts", "utf8");
  assert.match(source, /!replacementConfirmed\s*&&\s*!libraryOpen\s*&&\s*projectBrowser\.dirty/);
  assert.match(source, /record\.projectId,\s*false,\s*true,?\s*\)/);
  const flow = source.slice(
    source.indexOf('entryRecoveryDialog.querySelector("form")!.addEventListener("submit"'),
    source.indexOf("function interruptSession"),
  );
  assert.match(flow, /event.preventDefault\(\)/);
  assert.match(flow, /await restoreCheckpoint\(/);
  assert.match(flow, /entryRecoveryStatus.textContent\s*=\s*message\(error\)/);
  assert.doesNotMatch(flow, /window.confirm|confirm-recovery.*click/);
  assert.match(flow, /entryRecoveryDialog.close\(\);\s*void xrExperience!\.session.enter\(\)/);
});

test("Quest print/export handoff opens the export dialog after XR exit without starting a download", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("src/main.ts", "utf8");
  const handoff = source.slice(
    source.indexOf("projectAction: async (action)"),
    source.indexOf("    lighting,", source.indexOf("projectAction: async (action)")),
  );
  assert.match(handoff, /await leaveForProject\(/);
  assert.match(handoff, /export: "open-export",\s*print: "open-export"/);
  assert.match(handoff, /action === "print" \? "stl" : "glb"/);
  assert.match(
    handoff,
    /action === "new" \|\| action === "print" \|\| action === "export"\) target.click\(\)/,
  );
  assert.doesNotMatch(handoff, /exportSculpt|printDownload.click/);
  const shortcut = source.slice(
    source.indexOf("projectPrintSize.onclick"),
    source.indexOf("printLabel.append(projectPrintSize)"),
  );
  assert.doesNotMatch(shortcut, /ui.modalOpen/);
  assert.match(shortcut, /clearPreparedExport\(\)/);
});
