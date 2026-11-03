/** STL is unitless. Imported coordinates are reference data only. */
export const STL_LIMITS = { bytes: 6 * 1024 ** 2, triangles: 100_000 };
export function parseSTL(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength < 15 || bytes.byteLength > STL_LIMITS.bytes)
    throw new Error("STL must be nonempty and at most 6 MiB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = bytes.length >= 84 ? view.getUint32(80, true) : 0;
  let positions: Float32Array;
  if (bytes.length >= 84 && 84 + count * 50 === bytes.length) {
    if (!count || count > STL_LIMITS.triangles) throw new Error("STL triangle limit: 100,000.");
    positions = new Float32Array(count * 9);
    for (let f = 0; f < count; f++)
      for (let k = 0; k < 12; k++) {
        const v = view.getFloat32(84 + f * 50 + k * 4, true);
        if (!Number.isFinite(v) || Math.abs(v) > 1e9)
          throw new Error("STL contains nonfinite or excessive coordinates/normals.");
        if (k >= 3) positions[f * 9 + k - 3] = v;
      }
  } else {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("Invalid binary STL length or ASCII encoding.");
    }
    const lines = text.trim().split(/\r\n|\n|\r/);
    if (!/^solid(?:\s.*)?$/i.test(lines.shift() ?? ""))
      throw new Error("Invalid STL header or binary length.");
    const values: number[] = [];
    let i = 0,
      ended = false;
    const number = "[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?";
    const vector = (line: string, prefix: string) => {
      const m = line
        .trim()
        .match(new RegExp(`^${prefix}\\s+(${number})\\s+(${number})\\s+(${number})$`, "i"));
      if (!m) throw new Error("Malformed ASCII STL facet.");
      const v = m.slice(1).map(Number);
      if (v.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e9))
        throw new Error("STL contains nonfinite or excessive data.");
      return v;
    };
    while (i < lines.length) {
      const line = lines[i++].trim();
      if (!line) continue;
      if (/^endsolid(?:\s.*)?$/i.test(line)) {
        ended = true;
        break;
      }
      vector(line, "facet\\s+normal");
      if (lines[i++]?.trim().toLowerCase() !== "outer loop")
        throw new Error("Missing STL outer loop.");
      if (values.length / 9 >= STL_LIMITS.triangles)
        throw new Error("STL triangle limit: 100,000.");
      for (let k = 0; k < 3; k++) values.push(...vector(lines[i++] ?? "", "vertex"));
      if (
        lines[i++]?.trim().toLowerCase() !== "endloop" ||
        lines[i++]?.trim().toLowerCase() !== "endfacet"
      )
        throw new Error("Incomplete STL facet.");
    }
    if (!ended || !values.length || lines.slice(i).some((l) => l.trim()))
      throw new Error("Incomplete STL or trailing data.");
    positions = new Float32Array(values);
  }
  if (!positions.every(Number.isFinite)) throw new Error("STL coordinates overflow.");
  return positions;
}
