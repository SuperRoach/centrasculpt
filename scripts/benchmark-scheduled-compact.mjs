import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { researchChunkAdapter } from "./research/narrow-band-perf-bundle.mjs";

const dir = resolve(process.argv[2] ?? "work/scheduled-compact");
mkdirSync(dir, { recursive: true });
const bundle = resolve(dir, "compact.mjs");
await build({
  entryPoints: ["scripts/research/scheduled-compact.mjs"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: bundle,
  plugins: [researchChunkAdapter],
});
for (let trial = 0; trial < 4; trial++) {
  const result = spawnSync(
    process.execPath,
    [
      "--max-old-space-size=384",
      bundle,
      resolve(dir, `trial-${trial}.json`),
      trial % 2 ? "sparse" : "dense",
    ],
    { stdio: "inherit", timeout: 90_000, killSignal: "SIGKILL" },
  );
  if (result.status !== 0) throw new Error(result.error?.message ?? "Compact trial failed");
}
