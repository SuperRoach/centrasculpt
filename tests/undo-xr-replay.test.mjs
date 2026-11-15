import assert from "node:assert/strict";
import test from "node:test";
import { Group } from "three";
import { UndoXRReplay } from "../work/test-build/undo-xr-replay.mjs";

test("development XR replay finishes four identical strokes and waits for tracked submissions", async () => {
  const output = { setAttribute() {}, style: {}, textContent: "" };
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: () => output, body: { append() {} } };
  const session = new EventTarget();
  session.frameRate = 72;
  try {
    const replay = new UndoXRReplay();
    const tracking = new Group();
    const pose = {
      emulatedPosition: true,
      transform: { position: { x: 0, y: 1, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    };
    assert.equal(replay.frame(session, pose, tracking), false);
    pose.emulatedPosition = false;
    for (let frame = 0; frame < 400; frame++) {
      if (!replay.frame(session, pose, tracking)) break;
      replay.scene.traverse((object) => {
        if (object.isMesh) object.onAfterRender();
      });
      replay.afterDraw();
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.match(output.textContent, /^\{/);
    const report = JSON.parse(output.textContent);
    assert.deepEqual(
      report.results.map((result) => result.cache),
      [false, true, true, false],
    );
    assert(
      report.results.every(
        (result) => result.changedMeshes > 0 && result.fullSubmissionMs !== null,
      ),
    );
    assert(
      report.results.filter((result) => result.cache).every((result) => result.retainedBytes > 0),
    );
    assert.equal(replay.scene.children[0].children.length, 0);
  } finally {
    session.dispatchEvent(new Event("end"));
    globalThis.document = oldDocument;
  }
});
