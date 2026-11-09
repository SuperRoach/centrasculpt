// Orthographic raster diagnostics only: resolution-limited silhouettes cannot prove surface distance.
import { deflateSync } from "node:zlib";

const size = 300;
export function silhouetteMasks(positions, longest) {
  if (!(longest > 0) || positions.length % 9) throw new Error("Invalid silhouette input");
  return [0, 1, 2].map((axis) => {
    const mask = new Uint8Array(size * size),
      a = (axis + 1) % 3,
      b = (axis + 2) % 3;
    for (let i = 0; i < positions.length; i += 9) {
      const x = [0, 1, 2].map((k) => 150 + (positions[i + k * 3 + a] / longest) * 260);
      const y = [0, 1, 2].map((k) => 150 - (positions[i + k * 3 + b] / longest) * 260);
      const edge = (a, b, px, py) => (x[b] - x[a]) * (py - y[a]) - (y[b] - y[a]) * (px - x[a]);
      const area = edge(0, 1, x[2], y[2]);
      if (Math.abs(area) < 1e-12) continue;
      for (
        let py = Math.max(0, Math.floor(Math.min(...y)));
        py <= Math.min(size - 1, Math.ceil(Math.max(...y)));
        py++
      )
        for (
          let px = Math.max(0, Math.floor(Math.min(...x)));
          px <= Math.min(size - 1, Math.ceil(Math.max(...x)));
          px++
        ) {
          const e = [
            edge(0, 1, px + 0.5, py + 0.5),
            edge(1, 2, px + 0.5, py + 0.5),
            edge(2, 0, px + 0.5, py + 0.5),
          ];
          if (e.every((v) => v >= 0) || e.every((v) => v <= 0)) mask[py * size + px] = 1;
        }
    }
    return mask;
  });
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name),
    length = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, crc]);
}
export function silhouettePNG(masks) {
  const width = size * 3,
    raw = Buffer.alloc((width * 3 + 1) * size, 255);
  for (let y = 0; y < size; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++)
      if (masks[Math.floor(x / size)][y * size + (x % size)]) {
        const offset = y * (width * 3 + 1) + 1 + x * 3;
        raw[offset] = 45;
        raw[offset + 1] = 75;
        raw[offset + 2] = 90;
      }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
