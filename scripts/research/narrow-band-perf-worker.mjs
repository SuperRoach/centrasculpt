import { renameSync, writeFileSync } from "node:fs";
import { compact } from "./narrow-band-perf-compact.mjs";
import { growth } from "./narrow-band-perf-growth.mjs";
import { masters } from "./narrow-band-perf-masters.mjs";

const [suite, variant, trial, file] = process.argv.slice(2);
function checkpoint(report) {
  writeFileSync(
    `${file}.tmp`,
    JSON.stringify({ suite, variant, trial: Number(trial), ...report }, null, 2),
  );
  renameSync(`${file}.tmp`, file);
}

const memory = () => ({ ...process.memoryUsage(), maxRSSKiB: process.resourceUsage().maxRSS });
const start = memory();
const report =
  suite === "compact"
    ? await compact(variant, memory)
    : suite === "growth"
      ? growth(variant, checkpoint, memory)
      : masters(Number(variant), Number(trial), checkpoint);
checkpoint({ ...report, start, end: memory(), complete: true });
