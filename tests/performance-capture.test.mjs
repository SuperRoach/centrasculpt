import assert from "node:assert/strict";
import test from "node:test";
import { PerformanceCapture } from "../work/test-build/performance-capture.mjs";

test("capture is opt in, bounded, resets and distinguishes queue age from CPU", () => {
  const c = new PerformanceCapture();
  c.tick(0, 4, 1, 1);
  assert.equal(c.snapshot().frames, 0);
  c.start("192 clay");
  for (let i = 0; i < 1900; i++) {
    c.tick(i * 1000, 4, 1, 1);
    c.sample(i * 1000, { pending: 2 });
  }
  const s = c.snapshot();
  assert.equal(s.rows.length, 1800);
  assert.equal(s.rows.at(-1).cpu.p99, 4);
  assert.equal(s.rows.at(-1).dirtyQueueAgeMs, 1899000);
  c.tick(1900000, 2, 1, 0);
  c.sample(1900000, {});
  assert.equal(c.snapshot().rows.at(-1).dirtyQueueAgeMs, 0);
  c.stop();
  c.tick(2000000, 2, 1, 1);
  assert.equal(c.snapshot().frames, 1901);
  c.start("new");
  assert.equal(c.snapshot().rows.length, 0);
});
test("capture defers resource snapshots until sampling is admitted and leaves unavailable input unsampled", () => {
  const c = new PerformanceCapture();
  let calls = 0;
  const detail = () => {
    calls++;
    return { mode: "desktop" };
  };
  c.sample(0, detail);
  assert.equal(calls, 0);
  c.start("desktop");
  c.tick(0, 1, NaN, 0);
  c.sample(0, detail);
  c.sample(1, detail);
  assert.equal(calls, 1);
  assert.equal(c.snapshot().rows[0].input.count, 0);
  assert.equal(c.snapshot().rows[0].details.mode, "desktop");
});
