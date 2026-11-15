import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The hook exists only in this disposable build. The source and production
// bundle retain the original IncrementalMesher path.
const injection = "  const positions: number[] = [],";
export const researchChunkAdapter = {
  name: "research-chunk-adapter",
  setup(plugin) {
    plugin.onLoad({ filter: /[/]src[/]mesh\.ts$/ }, ({ path }) => {
      const source = readFileSync(path, "utf8");
      assert.equal(source.split(injection).length, 2);
      return {
        loader: "ts",
        contents: source.replace(
          injection,
          `  const adapter = (volume as VolumeStore & { researchRegion?: (b: Bounds) => VolumeStore }).researchRegion?.(bounds);
  if (adapter) return extractRegion(adapter, { min: [0, 0, 0], max: adapter.dimensions.map(n => n - 1) as Point });
${injection}`,
        ),
      };
    });
  },
};
