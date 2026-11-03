import assert from "node:assert/strict";
import test from "node:test";
import { applyTestConcurrency } from "../scripts/test-config.mjs";

test("test runner defaults to bounded concurrency four", () => {
  assert.deepEqual(applyTestConcurrency([], undefined), ["--test-concurrency=4"]);
});

test("test runner accepts a positive concurrency override", () => {
  assert.deepEqual(applyTestConcurrency(["--test-timeout=60000"], "2"), [
    "--test-timeout=60000",
    "--test-concurrency=2",
  ]);
});

test("explicit Node concurrency flags take precedence", () => {
  const flags = ["--test-concurrency=3"];
  assert.equal(applyTestConcurrency(flags, "2"), flags);
});

test("invalid environment concurrency fails clearly", () => {
  assert.throws(() => applyTestConcurrency([], "0"), /positive integer/);
  assert.throws(() => applyTestConcurrency([], "fast"), /positive integer/);
});
