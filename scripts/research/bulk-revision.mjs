import { DirtyChunkQueue } from "./dirty-chunk-queue.mjs";

export function stagePageMap(current, changes, afterPage = () => {}) {
  const next = new Map(current);
  let processed = 0;
  for (const [key, page] of changes) {
    if (page) next.set(key, page);
    else next.delete(key);
    afterPage(++processed);
  }
  return next;
}

/** CPU-only versioned mesh publication with a bounded active queue. */
export class BulkMeshRebuild {
  revision = 0;

  constructor(extract, install, capacity = 192) {
    this.extract = extract;
    this.install = install;
    this.capacity = capacity;
  }

  begin(keys) {
    if (keys.length > 16_000) throw new Error("Bulk dirty plan limit");
    const revision = this.revision + 1;
    const queue = new DirtyChunkQueue(
      this.capacity,
      ([key]) => {
        this.publish(revision, key, this.extract(key));
      },
      8,
      2,
    );
    this.revision = revision;
    this.keys = keys;
    this.offset = 0;
    this.queue = queue;
  }

  publish(revision, key, mesh) {
    if (revision !== this.revision) return false;
    this.install(key, mesh);
    return true;
  }

  get pending() {
    return this.keys.length - this.offset + this.queue.pending.size;
  }

  slice() {
    const room = this.capacity - this.queue.pending.size;
    const keys = this.keys.slice(this.offset, this.offset + room);
    this.queue.publish(keys, () => {});
    this.offset += keys.length;
    this.queue.slice();
  }
}
