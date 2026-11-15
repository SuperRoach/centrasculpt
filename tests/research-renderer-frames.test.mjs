import assert from "node:assert/strict";
import test from "node:test";
import { frames } from "../scripts/research/renderer-frames.mjs";

test("immersive replay waits for an XR frame and rejects on session end", async () => {
  const session = new EventTarget();
  let loop;
  const nextFrame = frames({
    xr: {
      isPresenting: true,
      getSession: () => session,
      setAnimationLoop: (callback) => {
        loop = callback;
      },
    },
  });
  const frame = {};
  const drawn = nextFrame((time, received) => {
    assert.equal(time, 22);
    assert.equal(received, frame);
    return "drawn";
  });
  loop(11);
  loop(22, frame);
  assert.equal(await drawn, "drawn");
  const stopped = nextFrame(() => assert.fail("No frame should run after exit"));
  session.dispatchEvent(new Event("end"));
  await assert.rejects(stopped, /Immersive session ended/);
});
