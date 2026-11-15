import { deflateRawSync, inflateRawSync } from "node:zlib";

export class ExactPages {
  decoded = new Map();
  edits = new Map();
  misses = 0;

  constructor(values, blockBytes, slots) {
    if (
      values.byteLength > 32 * 1024 ** 2 ||
      ![16384, 65536].includes(blockBytes) ||
      ![4, 16].includes(slots)
    )
      throw new Error("Exact page research budget");
    this.blockBytes = blockBytes;
    this.slots = slots;
    this.length = values.length;
    const count = Math.ceil(values.byteLength / blockBytes);
    this.offsets = new Uint32Array(count + 1);
    this.raw = new Uint8Array(count);
    const blocks = [];
    const scratch = new Uint8Array(blockBytes);
    const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
    for (let i = 0; i < count; i++) {
      const block = bytes.subarray(i * blockBytes, (i + 1) * blockBytes);
      const words = block.length / 4;
      for (let j = 0; j < block.length; j++) scratch[(j & 3) * words + (j >> 2)] = block[j];
      const compressed = deflateRawSync(scratch.subarray(0, block.length), { level: 1 });
      this.raw[i] = Number(compressed.length >= block.length);
      const payload = this.raw[i] ? block : compressed;
      blocks.push(payload);
      this.offsets[i + 1] = this.offsets[i] + payload.length;
    }
    this.payload = new Uint8Array(this.offsets[count]);
    for (const [i, block] of blocks.entries()) this.payload.set(block, this.offsets[i]);
  }

  page(id) {
    const edit = this.edits.get(id);
    if (edit) return edit;
    let page = this.decoded.get(id);
    if (page) this.decoded.delete(id);
    else {
      this.misses++;
      if (this.decoded.size === this.slots) this.decoded.delete(this.decoded.keys().next().value);
      const payload = this.payload.subarray(this.offsets[id], this.offsets[id + 1]);
      const bytes = new Uint8Array(
        Math.min(this.blockBytes, this.length * 4 - id * this.blockBytes),
      );
      if (this.raw[id]) bytes.set(payload);
      else {
        const shuffled = inflateRawSync(payload, { maxOutputLength: this.blockBytes });
        if (shuffled.length !== bytes.length) throw new Error("Invalid exact block size");
        for (let j = 0; j < bytes.length; j++)
          bytes[j] = shuffled[(j & 3) * (bytes.length / 4) + (j >> 2)];
      }
      page = new Float32Array(bytes.buffer);
    }
    this.decoded.set(id, page);
    return page;
  }

  read(index) {
    const words = this.blockBytes / 4;
    return this.page(Math.floor(index / words))[index % words];
  }

  stage(indices, update) {
    const before = new Map(),
      after = new Map();
    const words = this.blockBytes / 4;
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0 || index >= this.length)
        throw new Error("Invalid edit index");
      const id = Math.floor(index / words);
      if (!after.has(id)) {
        if (after.size === 16 || (!this.edits.has(id) && this.edits.size + after.size >= 64))
          throw new Error("Edit page budget");
        before.set(id, this.edits.get(id));
        after.set(id, this.page(id).slice());
      }
      const page = after.get(id);
      page[index % words] = update(page[index % words], index);
    }
    return { before, after };
  }

  publish(patch, undo = false) {
    for (const [id, page] of undo ? patch.before : patch.after) {
      if (page) this.edits.set(id, page);
      else this.edits.delete(id);
    }
  }

  footprint() {
    const bytes = (pages) => [...pages.values()].reduce((n, page) => n + page.byteLength, 0);
    return {
      packed: this.payload.byteLength + this.offsets.byteLength + this.raw.byteLength,
      decoded: bytes(this.decoded),
      edited: bytes(this.edits),
      directoryAllowance: 256 * (this.decoded.size + this.edits.size),
      codecScratchAllowance: this.blockBytes * 3,
    };
  }
}
