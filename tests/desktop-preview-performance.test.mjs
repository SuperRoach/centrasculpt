import assert from "node:assert/strict";
import test from "node:test";
import { DesktopPreviewPerformance } from "../work/test-build/desktop-preview-performance.mjs";

const frames = (feedback, count, milliseconds) => {
  for (let i = 0; i < count; i++) feedback.observeFrame(milliseconds);
  return feedback.resolution;
};
test("draft quality drops under sustained frame pressure and recovers gradually", () => {
  const feedback = new DesktopPreviewPerformance();
  assert.equal(feedback.resolution, 64);
  assert.equal(frames(feedback, 40, 25), 48);
  assert.equal(frames(feedback, 20, 50), 24);
  assert.equal(frames(feedback, 64, 16), 24);
  assert.equal(frames(feedback, 128, 16), 32);
  assert.equal(frames(feedback, 192, 16), 48);
  assert.equal(frames(feedback, 192, 16), 64);
});
test("fast displays stay capped at 64; short spikes, pauses and hidden tabs do not lower detail", () => {
  const feedback = new DesktopPreviewPerformance();
  frames(feedback, 365, 1000 / 120);
  assert.equal(feedback.resolution, 64);
  feedback.observeFrame(5000);
  feedback.observeFrame(100, false);
  feedback.observeFrame(Number.NaN);
  assert.equal(feedback.resolution, 64);
  frames(feedback, 60, 1000 / 120);
  feedback.observeFrame(100);
  assert.equal(feedback.resolution, 64);
});

test("sustained very low frame rate reaches the 18 cubed floor", () => {
  const feedback = new DesktopPreviewPerformance();
  assert.equal(frames(feedback, 10, 100), 18);
  assert.equal(frames(feedback, 20, 200), 18);
});
