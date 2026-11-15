/** Run independent bounded trials serially with resumable JSON checkpoints. */
import "./compile-core.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { build } from "esbuild";
import { researchChunkAdapter } from "./research/narrow-band-perf-bundle.mjs";

const output = resolve(
  process.argv[2] ?? `work/narrow-band-perf/${new Date().toISOString().replaceAll(":", "-")}`,
);
const suite = process.argv[3] ?? "all";
assert(
  [
    "all",
    "compact",
    "growth",
    "masters",
    "scheduled",
    "priority",
    "paced",
    "preview",
    "cost",
  ].includes(suite),
);
mkdirSync(output, { recursive: true });
const bundle = resolve(output, "worker.mjs");
await build({
  entryPoints: ["scripts/research/narrow-band-perf-worker.mjs"],
  platform: "node",
  bundle: true,
  format: "esm",
  outfile: bundle,
  plugins: [researchChunkAdapter],
});

const manifestPath = resolve(output, "manifest.json");
const identity = {
  bundleSHA256: createHash("sha256").update(readFileSync(bundle)).digest("hex"),
  runtime: process.version,
  cpu: cpus()[0]?.model,
};
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : { identity, cases: {} };
assert.deepEqual(
  manifest.identity,
  identity,
  "Use a fresh output directory for changed benchmark code or host",
);
const compact = ["dense", "baseline", "linear-2", "linear-3", "linear-4", "paged-3"];
const growth = [
  "baseline-2",
  "linear-2",
  "baseline-3",
  "linear-3",
  "paged-3",
  "baseline-4",
  "linear-4",
];
const masters = ["128", "192"];
const jobs = [];
function addJobs(name, variants, repeats) {
  if (suite !== name && suite !== "all") return;
  for (let trial = 0; trial < repeats; trial++) {
    const shift = trial % variants.length;
    for (const variant of [...variants.slice(shift), ...variants.slice(0, shift)])
      jobs.push([name, variant, trial + 1]);
  }
}
addJobs("compact", compact, 6);
addJobs("growth", growth, 3);
addJobs("masters", masters, 3);
if (suite === "scheduled") {
  for (let trial = 0; trial < 3; trial++) {
    const variants = ["linear-3", "exact-3", "exact-3-scheduled"];
    for (const variant of [...variants.slice(trial), ...variants.slice(0, trial)])
      jobs.push(["growth", variant, trial + 1]);
  }
}

if (suite === "priority") {
  for (let trial = 0; trial < 3; trial++) {
    const variants = ["exact-3-scheduled", "exact-3-narrow", "exact-3-priority"];
    for (const variant of [...variants.slice(trial), ...variants.slice(0, trial)])
      jobs.push(["growth", variant, trial + 1]);
  }
}

if (suite === "paced") {
  for (let trial = 0; trial < 3; trial++) {
    const variants = [1, 2].flatMap((pace) =>
      ["narrow", "occupancy", "deadline"].map((policy) => `exact-3-${policy}-${pace}`),
    );
    for (const variant of [...variants.slice(trial), ...variants.slice(0, trial)])
      jobs.push(["growth", variant, trial + 1]);
  }
}

if (suite === "preview") {
  for (let trial = 0; trial < 3; trial++) {
    const variants = [1, 2].flatMap((pace) => [
      ...[4, 8, 16].map((cap) => `exact-3-narrow-cap${cap}-${pace}`),
      `exact-3-preview-cap16-${pace}`,
    ]);
    for (const variant of [...variants.slice(trial), ...variants.slice(0, trial)])
      jobs.push(["growth", variant, trial + 1]);
  }
}

if (suite === "cost") {
  for (let trial = 0; trial < 3; trial++) {
    const variants = [1, 2].flatMap((pace) =>
      ["narrow", "recent", "classified"].map((policy) => `exact-3-${policy}-cap8-${pace}`),
    );
    for (const variant of [...variants.slice(trial), ...variants.slice(0, trial)])
      jobs.push(["growth", variant, trial + 1]);
  }
}

function run(args) {
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      ["--expose-gc", "--max-old-space-size=448", bundle, ...args],
      { stdio: "inherit" },
    );
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 120_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      done({ error: error.message });
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      done({ code, signal, timedOut });
    });
  });
}

console.log(output);
for (const [name, variant, trial] of jobs) {
  const id = `${name}-${variant}-${trial}`;
  const file = resolve(output, `${id}.json`);
  if (manifest.cases[id]?.code === 0 && existsSync(file)) continue;
  const result = await run([name, variant, String(trial), file]);
  manifest.cases[id] = result;
  writeFileSync(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2));
  renameSync(`${manifestPath}.tmp`, manifestPath);
  console.log(id, result.code === 0 ? "complete" : JSON.stringify(result));
}
if (
  jobs.some(([name, variant, trial]) => manifest.cases[`${name}-${variant}-${trial}`]?.code !== 0)
)
  process.exitCode = 1;
