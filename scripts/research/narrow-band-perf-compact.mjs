import { compareCompactSculpts, runCompactSculpt } from "./compact-sculpt/benchmark.mjs";
import { createHalo, PerfCache } from "./narrow-band-perf.mjs";

export async function compact(variant, snapshot) {
  const kind = variant === "dense" ? "dense" : "sparse";
  const prepareSparse =
    variant === "baseline" || kind === "dense"
      ? undefined
      : (field, _, volume) => {
          const [directory, width] = variant.split("-");
          const cache = new PerfCache(
            Number(width),
            1,
            (x, y, z) => field.read(x, y, z),
            true,
            directory,
          );
          const halo = createHalo(cache, [-64, -64, -64], [64, 64, 64], 16);
          volume.researchRegion = ({ min, max }) => halo.region(min, max);
          return { cache, ...halo };
        };
  return runCompactSculpt(kind, { prepareSparse, snapshot });
}

export { compareCompactSculpts };
