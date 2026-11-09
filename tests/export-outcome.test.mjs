import assert from "node:assert/strict";
import test from "node:test";
import { exportFailure, exportInterruption } from "../work/test-build/export-outcome.mjs";

test("planar optimisation failures retain their cause and stage and are errors", () => {
  for (const aborted of [false, true]) {
    const result = exportFailure(
      new Error("Compact Boolean export exceeds the memory budget."),
      "Optimising planar regions",
      aborted,
    );
    assert.equal(result.error, true);
    assert.match(result.text, /^Export failed during Optimising planar regions:/);
    assert.match(result.text, /exceeds the memory budget/);
    assert.match(result.text, /Source sculpture kept/);
  }
});
test("only a requested cancellation is presented as cancelled; source changes remain explicit failures", () => {
  assert.deepEqual(exportFailure(new Error("Export cancelled."), "packing", true, "user"), {
    error: false,
    text: "Export cancelled by request. Source sculpture kept.",
  });
  assert.equal(exportFailure(new Error("Export cancelled."), "packing", false).error, true);
  const stale = exportFailure(new Error("Export cancelled: source changed."), "sampling", false);
  assert.equal(stale.error, true);
  assert.match(stale.text, /source changed/);
  assert.match(exportFailure("unknown failure", "encoding", false).text, /unknown failure/);
});

test("automatic lifecycle interruptions never claim a user cancellation", () => {
  assert.equal(exportInterruption("blur"), undefined);
  assert.equal(exportInterruption("page hidden"), undefined);
  for (const event of ["pagehide", "freeze", "error", "unhandledrejection"]) {
    const interruption = exportInterruption(event);
    assert(interruption instanceof Error);
    const result = exportFailure(
      new Error("Export cancelled."),
      "Optimising planar regions",
      true,
      interruption,
    );
    assert.equal(result.error, true);
    assert.match(result.text, /^Export interrupted during Optimising planar regions:/);
    assert(result.text.includes(interruption.message));
  }
  assert.equal(exportFailure(new Error("Export cancelled."), "meshing", true).error, true);
  const race = exportFailure(new Error("Invalid topology."), "validation", true, "user");
  assert.match(race.text, /Export failed.*Invalid topology/);
});
