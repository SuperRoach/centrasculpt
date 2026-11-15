import { brickCoords, brickKey, FAR } from "./narrow-band.mjs";

const negative = (value) => value < -Number.EPSILON * 32;

/** Invalidate only cells and gradient stencils that read changed samples. */
export function changedChunks(patch, mayHaveSurface) {
  const keys = new Set();
  for (const [owner, after] of patch.after) {
    const before = patch.before.get(owner);
    const [bx, by, bz] = brickCoords(owner);
    for (let i = 0; i < after.length; i++) {
      const old = before?.[i] ?? FAR;
      const next = after[i];
      if (Object.is(old, next)) continue;
      const x = bx * 8 + (i & 7);
      const y = by * 8 + ((i >> 3) & 7);
      const z = bz * 8 + (i >> 6);
      const crossingChanged = negative(old) !== negative(next);
      for (let cz = (z - 2) >> 3; cz <= (z + 1) >> 3; cz++)
        for (let cy = (y - 2) >> 3; cy <= (y + 1) >> 3; cy++)
          for (let cx = (x - 2) >> 3; cx <= (x + 1) >> 3; cx++) {
            const key = brickKey(cx, cy, cz);
            if (keys.has(key)) continue;
            const coreContainsSample =
              x >= cx * 8 &&
              x <= cx * 8 + 8 &&
              y >= cy * 8 &&
              y <= cy * 8 + 8 &&
              z >= cz * 8 &&
              z <= cz * 8 + 8;
            if ((crossingChanged && coreContainsSample) || mayHaveSurface(key)) keys.add(key);
          }
    }
  }
  return [...keys];
}
