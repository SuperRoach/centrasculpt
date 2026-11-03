import type { ExportProgress, ExportQuality, ExportSource } from "./export-mesh";
import { EXPORT_MEMORY_LIMIT, ExportWork, exportAdmission } from "./export-mesh";
import type { GlbExportResult } from "./glb-export";
import { encodeExport } from "./glb-export";
import { encodeSTL, type PrintReport } from "./stl-export";

let generation = 0;
/** Snapshot committed mesher buffers cooperatively; never transfer/detach source data.
 * Terminate on cancellation; worker errors retain the original sculpture and retry path. */
export async function exportGlbAsync(
  sources: ExportSource[],
  quality: ExportQuality,
  options: {
    signal?: AbortSignal;
    maxBytes?: number;
    progress?: (p: ExportProgress) => void;
    stlMM?: number;
  } = {},
): Promise<GlbExportResult & { report?: PrintReport }> {
  const signal = options.signal ?? new AbortController().signal,
    maxBytes = options.maxBytes ?? EXPORT_MEMORY_LIMIT,
    current = () => sources.every((s) => !s.current || s.current()),
    work = new ExportWork(signal, current, options.progress),
    admission = exportAdmission(sources, quality, maxBytes);
  if (
    options.stlMM !== undefined &&
    (!Number.isFinite(options.stlMM) ||
      options.stlMM < 0.1 ||
      options.stlMM > 10000 ||
      admission.corners / 3 > 300_000 ||
      admission.corners * 320 > maxBytes)
  )
    throw new Error(
      "STL target dimension or validation memory/triangle safety limit exceeded. Use 0.1–10,000 mm and export fewer parts.",
    );
  work.check();
  if (typeof Worker === "undefined" && admission.corners / 3 > 10_000)
    throw new Error(
      "Background export requires Web Workers for this sculpture. Use a supported browser; source kept.",
    );
  const copies: ExportSource[] = [];
  for (const source of sources) {
    const chunks: ExportSource["chunks"] = [];
    for (const c of source.chunks) {
      const positions = new Float32Array(c.positions.length),
        normals = new Float32Array(c.normals.length),
        colours = c.colours ? new Float32Array(c.colours.length) : undefined;
      for (let offset = 0; offset < positions.length; offset += 16384) {
        positions.set(c.positions.subarray(offset, offset + 16384), offset);
        normals.set(c.normals.subarray(offset, offset + 16384), offset);
        if (c.colours) colours!.set(c.colours.subarray(offset, offset + 16384), offset);
        await work.pause("Snapshotting committed surface", offset, positions.length);
      }
      chunks.push({ positions, normals, colours });
    }
    copies.push({
      name: source.name,
      layerId: source.layerId,
      transform: {
        position: [...source.transform.position],
        rotation: [...source.transform.rotation],
        scale: [...source.transform.scale],
      },
      step: source.step,
      chunks,
    });
  }
  work.check();
  if (typeof Worker === "undefined")
    return options.stlMM === undefined
      ? encodeExport(copies, quality, maxBytes, work)
      : encodeSTL(copies, quality, maxBytes, options.stlMM, work);
  const id = ++generation,
    worker = new Worker(new URL("./export-worker.ts", import.meta.url), { type: "module" });
  let cleanup = () => {};
  try {
    return await new Promise<GlbExportResult & { report?: PrintReport }>((resolve, reject) => {
      const abort = () => reject(new Error("Export cancelled.")),
        timer = setInterval(() => {
          try {
            work.check();
          } catch (error) {
            reject(error);
          }
        }, 16);
      cleanup = () => {
        clearInterval(timer);
        signal.removeEventListener("abort", abort);
      };
      signal.addEventListener("abort", abort, { once: true });
      worker.onerror = (e) =>
        reject(
          new Error(
            `Export worker failed: ${e.message}. Source kept; retry with Fast or fewer layers.`,
          ),
        );
      worker.onmessage = ({ data: d }) => {
        if (d.id !== id) return;
        try {
          work.check();
          if (d.error) throw new Error(d.error);
          if (d.progress) {
            options.progress?.(d.progress);
            return;
          }
          if (!(d.result?.data instanceof ArrayBuffer))
            throw new Error("Invalid export worker response.");
          resolve(d.result);
        } catch (error) {
          reject(error);
        }
      };
      const transfer = copies.flatMap((s) =>
        s.chunks.flatMap((c) => [
          c.positions.buffer,
          c.normals.buffer,
          ...(c.colours ? [c.colours.buffer] : []),
        ]),
      );
      worker.postMessage(
        { id, sources: copies, quality, maxBytes, stlMM: options.stlMM },
        transfer,
      );
    });
  } finally {
    cleanup();
    worker.terminate();
  }
}
