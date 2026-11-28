import { Group, Mesh } from "three";
import type { MoveProgress, MoveWork } from "./deformation-reconstruction";
import { reconstructMove } from "./deformation-reconstruction";
import type { RadialMoveField } from "./move-field";
import { sculptMask } from "./sculpt-mask";
import type { SDFVolume } from "./sdf";
import { type SparsePageSnapshot, SparseSDFVolume } from "./sparse-sdf";

let generation = 0;
/** Browser worker owns copies only. Node/unsupported environments use the cooperative path.
 * Worker startup/runtime failures reject without retrying expensive work on the render thread. */
export async function reconstructMoveAsync(
  surface: Group | readonly Mesh[],
  next: SDFVolume | SparseSDFVolume,
  field: RadialMoveField,
  work: MoveWork,
  maxBytes: number,
  progress: (p: MoveProgress) => void,
): ReturnType<typeof reconstructMove> {
  if (typeof Worker === "undefined")
    return reconstructMove(surface, next, field, work, maxBytes, progress);
  const id = ++generation,
    positions: Float32Array[] = [];
  const objects = surface instanceof Group ? surface.children : surface;
  const dense = next.getDenseView();
  let snapshotBytes =
    (next instanceof SparseSDFVolume ? next.pageMemoryBytes * 2 : dense!.byteLength * 2) +
    sculptMask(next).memoryBytes * 2;
  for (const o of objects)
    if (o instanceof Mesh) snapshotBytes += o.geometry.getAttribute("position").count * 12;
  // Preserve existing large-volume support when worker duplication exceeds the cap.
  let vertices = 0;
  for (const o of objects)
    if (o instanceof Mesh) vertices += o.geometry.getAttribute("position").count;
  if (snapshotBytes + vertices * 48 >= maxBytes)
    return reconstructMove(surface, next, field, work, maxBytes, progress);
  const values = dense && new Float32Array(dense.length);
  let sparse: SparsePageSnapshot | undefined;
  const fieldBuffers: ArrayBufferLike[] = [];
  if (dense && values) {
    fieldBuffers.push(values.buffer);
    for (let i = 0; i < values.length; i += 65536) {
      values.set(dense.subarray(i, i + 65536), i);
      await work.pause();
    }
  } else if (next instanceof SparseSDFVolume) {
    sparse = { defaultValue: next.defaultValue, pages: new Map() };
    for (const [id, page] of next.residentPages()) {
      const copy = page.slice();
      sparse.pages.set(id, copy);
      fieldBuffers.push(copy.buffer);
      if (sparse.pages.size % 128 === 0) await work.pause();
    }
  }
  for (const o of objects)
    if (o instanceof Mesh) {
      const a = o.geometry.getAttribute("position"),
        copy = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) {
        copy[i * 3] = a.getX(i);
        copy[i * 3 + 1] = a.getY(i);
        copy[i * 3 + 2] = a.getZ(i);
        if (i % 2048 === 2047) await work.pause();
      }
      positions.push(copy);
    }
  work.check();
  work.backend = "worker";
  work.workerSnapshotBytes = snapshotBytes;
  const worker = new Worker(new URL("./move-reconstruction-worker.ts", import.meta.url), {
    type: "module",
  });
  let cleanup = () => {};
  try {
    return await work.wait(
      new Promise((resolve, reject) => {
        const abort = () => reject(new Error("Move cancelled · source or session changed."));
        const poll = setInterval(() => {
          try {
            work.check();
          } catch (error) {
            reject(error);
          }
        }, 16);
        cleanup = () => {
          clearInterval(poll);
          work.signal.removeEventListener("abort", abort);
        };
        work.signal.addEventListener("abort", abort, { once: true });
        worker.onerror = (e) => {
          cleanup();
          reject(new Error(`Move worker failed: ${e.message}`));
        };
        worker.onmessage = ({ data: d }) => {
          if (d.id !== id) return;
          try {
            work.check();
            if (d.error) throw new Error(d.error);
            if (d.progress) {
              progress(d.progress);
              return;
            }
            cleanup();
            resolve(d.result);
          } catch (error) {
            cleanup();
            reject(error);
          }
        };
        const transfer = [...fieldBuffers, ...positions.map((p) => p.buffer)];
        work.workerInputBytes = transfer.reduce((bytes, buffer) => bytes + buffer.byteLength, 0);
        const started = performance.now();
        worker.postMessage(
          {
            id,
            positions,
            values,
            sparse,
            mask: sculptMask(next).snapshot(),
            resolution: next.resolution,
            extent: next.extent,
            layout: { dimensions: next.dimensions, latticeMin: next.latticeMin },
            maxBytes: maxBytes - snapshotBytes,
            field: {
              center: field.center.toArray(),
              radius: field.radius,
              falloff: field.falloff,
              mode: field.mode,
              stiffness: field.stiffness,
              delta: field.delta.toArray(),
              interaction: field.interaction,
              axis: field.axis.toArray(),
              angle: field.angle,
              mirror: field.mirror,
            },
          },
          transfer as ArrayBuffer[],
        );
        work.workerPostMs = performance.now() - started;
      }),
    );
  } finally {
    cleanup();
    worker.terminate();
  }
}
