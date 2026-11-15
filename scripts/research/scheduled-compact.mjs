import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { IncrementalMesher } from "../../src/mesh";
import { compareCompactSculpts, runCompactSculpt } from "./compact-sculpt/benchmark.mjs";
import { FAR } from "./narrow-band.mjs";
import { createHalo, PerfCache } from "./narrow-band-perf.mjs";

const [output, first] = process.argv.slice(2);
const original = IncrementalMesher.prototype.rebuildChunks;
const results = {};
for (const kind of first === "dense" ? ["dense", "sparse"] : ["sparse", "dense"]) {
  const batches = [];
  let active = false;
  // Preserve the compact fixture's one-action-at-a-time checksums while
  // measuring the same bounded production extraction calls for both readers.
  IncrementalMesher.prototype.rebuildChunks = function () {
    if (!active) return original.call(this);
    const updates = [];
    const slices = [];
    let last;
    for (;;) {
      const start = performance.now();
      const next = original.call(this, 4, 2);
      if (!next) break;
      slices.push({ chunks: next.updates.length, ms: performance.now() - start });
      updates.push(...next.updates);
      last = next;
    }
    batches.push(slices);
    return last && { ...last, updates, stats: { ...last.stats, chunks: updates.length } };
  };
  const run = await runCompactSculpt(kind, {
    beforeStroke: () => {
      active = true;
    },
    prepareSparse(field, cache, volume) {
      cache.entry = () => undefined;
      const exactSource = new PerfCache(FAR, 1, (x, y, z) => field.read(x, y, z), true, "linear");
      exactSource.entries = field.edits;
      const halo = createHalo(exactSource, [-64, -64, -64], [64, 64, 64], 16);
      volume.researchRegion = ({ min, max }) => halo.region(min, max);
      return { cache, ...halo };
    },
  });
  results[kind] = { ...run, batches };
}
IncrementalMesher.prototype.rebuildChunks = original;
compareCompactSculpts(results.dense, results.sparse);
assert(results.sparse.haloStats.tiles > 0);
writeFileSync(output, JSON.stringify(results, null, 2));
