import "./compile-core.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const bulk = process.argv[4] === "--bulk";
const dir = resolve(process.argv[2] ?? "work/resident-lifecycle");
const trace = resolve(
  process.argv[3] ?? "work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json",
);
mkdirSync(dir, { recursive: true });
const bundle = resolve(dir, "worker.mjs");
await build({
  entryPoints: ["scripts/research/resident-lifecycle.mjs"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: bundle,
});
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const identity = JSON.stringify({
  bundle: digest(bundle),
  trace: digest(trace),
  runtime: process.version,
  bulk,
});
const identityPath = resolve(dir, "identity.json");
if (existsSync(identityPath)) assert.equal(readFileSync(identityPath, "utf8"), identity);
else writeFileSync(identityPath, identity);
let failed = false;
for (let trial = 1; trial <= 3; trial++) {
  const report = resolve(dir, `trial-${trial}.json`);
  if (existsSync(report) && JSON.parse(readFileSync(report)).complete) continue;
  const result = spawnSync(
    process.execPath,
    [
      "--expose-gc",
      "--max-old-space-size=448",
      bundle,
      trace,
      report,
      ...(bulk ? ["3", "bulk"] : ["6"]),
    ],
    {
      stdio: "inherit",
      timeout: 180_000,
      killSignal: "SIGKILL",
    },
  );
  console.log(report, result.status, result.error?.message ?? "");
  failed ||= result.status !== 0;
}
if (failed) process.exitCode = 1;
