/** One revision-bound CPU snapshot. Capture shares typed arrays with the source mesh. */
export class LatestUndoMesh {
  bytes = 0;
  entry = null;

  constructor(limitBytes) {
    this.limitBytes = limitBytes;
  }

  clear() {
    this.entry = null;
    this.bytes = 0;
  }

  capture(revision, meshes) {
    this.clear();
    const buffers = new Map();
    const backing = new Set();
    let bytes = 0;
    for (const [key, { position, normal }] of meshes) {
      for (const { buffer } of [position, normal]) {
        if (backing.has(buffer)) continue;
        backing.add(buffer);
        bytes += buffer.byteLength;
      }
      if (bytes > this.limitBytes) return false;
      buffers.set(key, { position, normal });
    }
    this.entry = { revision, buffers };
    this.bytes = bytes;
    return true;
  }

  take(revision) {
    const entry = this.entry;
    if (!entry || entry.revision !== revision) return null;
    this.clear();
    return entry.buffers;
  }
}
