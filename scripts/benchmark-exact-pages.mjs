import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const output = resolve(
  process.argv[2] ?? `work/exact-pages/${new Date().toISOString().replaceAll(":", "-")}`,
);
mkdirSync(output, { recursive: true });
const bundle = resolve(output, "trial.mjs");
await build({
  entryPoints: ["scripts/research/exact-pages-trial.mjs"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: bundle,
});
console.log(output);
const configurations = [
  [16384, 4],
  [16384, 16],
  [65536, 4],
  [65536, 16],
];
let failed = false;
for (let trial = 0; trial < 3; trial++) {
  for (const [block, slots] of [
    ...configurations.slice(trial),
    ...configurations.slice(0, trial),
  ]) {
    const file = resolve(output, `${block}-${slots}-${trial}.json`);
    if (existsSync(file) && JSON.parse(readFileSync(file)).complete) continue;
    const result = spawnSync(
      process.execPath,
      ["--expose-gc", "--max-old-space-size=384", bundle, block, slots, trial, file],
      {
        stdio: "inherit",
        timeout: 120_000,
        killSignal: "SIGKILL",
      },
    );
    console.log(block, slots, trial, result.status, result.error?.message ?? "");
    failed ||= result.status !== 0;
  }
}
if (failed) process.exitCode = 1;
