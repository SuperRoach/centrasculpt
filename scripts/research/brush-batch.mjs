import { changedChunks } from "./changed-chunks.mjs";
import { stageStroke } from "./narrow-band.mjs";

/** Prepare an admissible prefix without exposing staged field edits to the mesher. */
export function prepareBrushBatch(field, staging, edits, queue, hasMesh, budgetMs = 4) {
  const pages = new Map();
  const keys = new Set();
  const items = [];
  let newPages = 0;
  const overlay = {
    bins: field.bins,
    read: field.read,
    edits: {
      get: (key) => pages.get(key) ?? field.edits.get(key),
      get size() {
        return field.edits.size + newPages;
      },
    },
  };
  const start = performance.now();
  for (const { a, b, mode } of edits) {
    const patch = stageStroke(overlay, staging, a, b, mode);
    const dirty = changedChunks(
      patch,
      (key) => hasMesh(key) || queue.pending.has(key) || keys.has(key),
    );
    const merged = new Set([...keys, ...dirty]);
    if (!queue.canAdmit([...merged])) return { items, keys: [...keys], blocked: true };
    for (const key of dirty) keys.add(key);
    items.push({ patch, keys: dirty, b });
    for (const [key, values] of patch.after) {
      if (!pages.has(key) && !field.edits.has(key)) newPages++;
      pages.set(key, values);
    }
    if (performance.now() - start >= budgetMs) break;
  }
  return { items, keys: [...keys], blocked: false };
}
