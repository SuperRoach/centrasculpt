import { Box3, MeshStandardMaterial, type WebGLRenderer } from "three";
import type { IndependentLayers } from "./independent-layers";
import type { SdfLayer } from "./layers";
import { IncrementalMesher } from "./mesh";
import {
  capturePersonalShape,
  compressPersonalShape,
  encodePersonalShape,
  PersonalShapeLibrary,
} from "./personal-shapes";
import { captureProjectThumbnail } from "./project-thumbnail";
import { exportShapeBackup, previewShapeBackup, shapeMerge } from "./shape-backup";
import { ChunkSurface } from "./surface";
import { transformMatrix } from "./transform";

export function installPersonalShapes(
  getLayers: () => IndependentLayers,
  renderer: WebGLRenderer,
  changed: () => void,
) {
  const library = new PersonalShapeLibrary(),
    dialog = document.createElement("dialog");
  dialog.className = "project-library-dialog";
  dialog.setAttribute("aria-label", "Personal Shapes");
  document.body.append(dialog);
  let abort: AbortController | undefined,
    master: SdfLayer | undefined,
    thumbnail: string | undefined;
  let dimensions: [number, number, number] = [0, 0, 0];
  const close = () => {
    abort?.abort();
    dialog.close();
    master = undefined;
  };
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  const button = (text: string, action: () => void | Promise<void>) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.onclick = () => {
      void Promise.resolve()
        .then(action)
        .catch((error) => {
          status.textContent = (error as Error).message;
        });
    };
    return b;
  };
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const heading = document.createElement("h2");
  heading.textContent = "Personal Shapes";
  const note = document.createElement("p");
  note.textContent =
    "Reusable evaluated geometry, without the original procedural history. Stored in this browser independently of projects. Clearing site data removes the library; use Export Library Backup to keep a portable copy. Move, rotate, resize and sculpt inserted copies normally.";
  const content = document.createElement("div");
  const saveButton = button("Save selected as Shape", async () => {
    const layers = getLayers();
    if (!layers.recoveryReady) throw new Error("Finish the current edit before saving a shape.");
    if (layers.selectedGroupId)
      throw new Error("Select a sculpt or a Boolean root. Group collections are deferred to 8.1.");
    if (layers.trackedBytes + layers.composite.trackedBytes + 192 ** 3 * 20 > 256 * 1024 ** 2)
      throw new Error(
        "Shape preparation exceeds the memory safety limit. Save a .form backup or use a smaller project; detail was not reduced.",
      );
    abort?.abort();
    abort = new AbortController();
    const signal = abort.signal;
    const revision = layers.sourceRevision;
    saveButton.disabled = true;
    status.textContent = "Preparing full-detail evaluated shape…";
    try {
      master = await capturePersonalShape(layers.project, layers.project.activeLayerId, signal);
      const mesher = new IncrementalMesher(master.volume),
        material = new MeshStandardMaterial({ color: "#c8b6a2" }),
        surface = new ChunkSurface(material);
      surface.group.applyMatrix4(transformMatrix(master.transform));
      try {
        while (mesher.pendingChunks) {
          if (signal.aborted) throw new Error("Save as Shape cancelled.");
          const update = mesher.rebuildChunks(2);
          if (update) {
            if (update.triangles > 1000000)
              throw new Error(
                "Shape preview exceeds the supported triangle budget. Keep a .form backup or split the object.",
              );
            surface.update(update.updates);
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        const bounds = new Box3().setFromObject(surface.group);
        if (bounds.isEmpty()) throw new Error("Selected sculpt has no evaluated surface.");
        const mm = layers.display.precision.millimetresPerUnit;
        dimensions = [
          bounds.max.x - bounds.min.x,
          bounds.max.y - bounds.min.y,
          bounds.max.z - bounds.min.z,
        ].map((v) => v * mm) as [number, number, number];
        thumbnail = await captureProjectThumbnail(renderer, surface.group);
        if (!thumbnail)
          throw new Error("Thumbnail capture failed. Shape was not saved; try again.");
        if (signal.aborted || getLayers() !== layers || layers.sourceRevision !== revision)
          throw new Error("Save cancelled or project changed.");
        content.replaceChildren();
        const image = document.createElement("img");
        image.src = thumbnail;
        image.alt = "Evaluated shape preview";
        image.width = image.height = 192;
        const name = document.createElement("input");
        name.value = master.name;
        name.maxLength = 80;
        name.setAttribute("aria-label", "Shape name");
        const pivot = document.createElement("select");
        pivot.setAttribute("aria-label", "Insertion pivot");
        for (const [value, label] of [
          ["centre", "Centre"],
          ["base", "Base centre"],
        ]) {
          const o = document.createElement("option");
          o.value = value;
          o.textContent = label;
          pivot.append(o);
        }
        const size = document.createElement("p");
        size.textContent = `${dimensions.map((v) => v.toFixed(2)).join(" × ")} mm`;
        const save = button("Save Shape", async () => {
          if (!master || !thumbnail || signal.aborted) return;
          save.disabled = true;
          try {
            const offset = bounds.getCenter(bounds.min.clone());
            if (pivot.value === "base") offset.y = bounds.min.y;
            const copy = master;
            const position = [...copy.transform.position] as [number, number, number];
            copy.transform.position = copy.transform.position.map(
              (v, i) => v - offset.getComponent(i),
            ) as [number, number, number];
            const encoded = (() => {
              try {
                return encodePersonalShape(
                  layers.project,
                  copy,
                  name.value,
                  thumbnail,
                  dimensions,
                  mm,
                  pivot.value as "centre" | "base",
                );
              } finally {
                copy.transform.position = position;
              }
            })();
            const { record, data } = encoded;
            const packed = await compressPersonalShape(record, data);
            await library.put(packed.record, packed.data, null, signal);
            master = undefined;
            await browse();
            status.textContent = "Shape saved at full master detail.";
          } finally {
            save.disabled = false;
          }
        });
        content.append(image, name, pivot, size, save);
        status.textContent = "Review the evaluated preview, name and insertion pivot.";
      } finally {
        mesher.dispose();
        material.dispose();
        surface.clear();
      }
    } finally {
      saveButton.disabled = false;
    }
  });
  async function browse() {
    abort?.abort();
    master = undefined;
    content.replaceChildren();
    status.textContent = "Loading personal shapes…";
    const records = await library.shapes();
    if (!dialog.open) return;
    status.textContent = records.length
      ? ""
      : "No personal shapes yet. Select a sculpt, then Save selected as Shape.";
    for (const record of records) {
      const row = document.createElement("section"),
        title = document.createElement("h3"),
        detail = document.createElement("p");
      title.textContent = record.name;
      detail.textContent = `${record.dimensionsMM.map((v) => v.toFixed(2)).join(" × ")} mm · ${new Date(record.created).toLocaleDateString()}`;
      if (record.thumbnail) {
        const img = document.createElement("img");
        img.src = record.thumbnail;
        img.alt = record.name;
        img.width = img.height = 128;
        row.append(img);
      }
      row.append(
        title,
        detail,
        button("Insert", async () => {
          abort?.abort();
          abort = new AbortController();
          const signal = abort.signal,
            layers = getLayers();
          status.textContent = "Loading full-detail master…";
          if (
            layers.trackedBytes + layers.composite.trackedBytes + record.masterBytes * 6 >
            256 * 1024 ** 2
          )
            throw new Error(
              "Loading this master would exceed memory limits. Use a smaller project or keep a .form backup; detail was not reduced.",
            );
          const { record: metadata, layer } = await library.master(record.id);
          if (signal.aborted || layers !== getLayers()) throw new Error("Insertion cancelled.");
          await layers.insertPersonalShape(
            layer,
            metadata.millimetresPerUnit / layers.display.precision.millimetresPerUnit,
            signal,
          );
          changed();
          status.textContent =
            "Independent sculpt inserted. Use Move controls to position each copy. Undo removes this insertion.";
        }),
        button("Rename", () => {
          const input = document.createElement("input");
          input.value = record.name;
          input.maxLength = 80;
          input.setAttribute("aria-label", "New shape name");
          const apply = button("Confirm rename", async () => {
            await library.metadata(record.id, record.revision, { name: input.value });
            await browse();
          });
          row.append(input, apply);
          input.focus();
        }),
        button("Delete", () => {
          const confirm = button(`Confirm delete ${record.name}`, async () => {
            await library.delete(record.id, record.revision);
            await browse();
          });
          row.append(
            confirm,
            button("Keep shape", () => {
              confirm.remove();
            }),
          );
          confirm.focus();
        }),
      );
      content.append(row);
    }
  }
  const backupExport = button("Export Library Backup", async () => {
    abort?.abort();
    abort = new AbortController();
    const signal = abort.signal;
    status.textContent = "Validating and preparing library backup…";
    const blob = await exportShapeBackup(library, signal);
    const count = blob.shapeCount;
    if (signal.aborted) throw new Error("Backup cancelled.");
    content.replaceChildren();
    status.textContent = `${count} shapes · ${(blob.size / 1024 ** 2).toFixed(2)} MiB. Ready to download.`;
    content.append(
      button("Download Library Backup", () => {
        if (signal.aborted) throw new Error("Backup cancelled.");
        const url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download = "centra-shapes.cshapes";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        status.textContent = "Backup download requested. Keep the file somewhere safe.";
      }),
    );
  });
  const backupImport = button("Import Library Backup", () => {
    abort?.abort();
    abort = new AbortController();
    const signal = abort.signal;
    content.replaceChildren();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".cshapes";
    input.setAttribute("aria-label", "Library backup file");
    input.oncancel = () => {
      status.textContent = "Import cancelled. Existing shapes kept.";
    };
    input.onchange = () => {
      void (async () => {
        const file = input.files?.[0];
        if (!file) return;
        status.textContent = "Validating backup masters, thumbnails and integrity…";
        const layers = getLayers();
        if (layers.trackedBytes + layers.composite.trackedBytes > 32 * 1024 ** 2)
          throw new Error("Open a smaller project before restoring: memory safety limit.");
        const preview = await previewShapeBackup(file, signal);
        const estimate = await navigator.storage?.estimate();
        if (
          estimate?.quota !== undefined &&
          estimate.usage !== undefined &&
          estimate.quota - estimate.usage < preview.bytes * 2
        )
          throw new Error("Insufficient available browser storage. Existing shapes kept.");
        const existing = await library.shapes(),
          merge = shapeMerge(existing, preview);
        if (
          existing.length + merge.additions.length > 100 ||
          existing.reduce((n, r) => n + r.bytes, 0) +
            merge.additions.reduce((n, e) => n + e.data.byteLength, 0) >
            512 * 1024 ** 2
        )
          throw new Error("Library storage limit reached. Existing shapes kept.");
        if (signal.aborted) throw new Error("Import cancelled. Existing shapes kept.");
        content.replaceChildren();
        status.textContent = `${preview.entries.length} shapes · ${(preview.bytes / 1024 ** 2).toFixed(2)} MiB: ${merge.additions.length} new copies, ${merge.conflicts} identifier conflicts, ${merge.duplicates} duplicates skipped. Existing shapes will be preserved.`;
        for (const { record } of merge.additions) {
          const row = document.createElement("p");
          row.textContent = record.name;
          content.append(row);
        }
        const confirm = button("Confirm Import Library Backup", async () => {
          confirm.disabled = true;
          try {
            const result = await library.restore(preview, signal);
            await browse();
            status.textContent = `Restored ${result.imported} shapes; ${result.duplicates} duplicates skipped. Existing shapes preserved.`;
          } finally {
            confirm.disabled = false;
          }
        });
        content.append(
          confirm,
          button("Cancel Import", async () => {
            await browse();
            status.textContent = "Import cancelled. Existing shapes kept.";
          }),
        );
      })().catch((error) => {
        status.textContent = (error as Error).message;
      });
    };
    content.append(input);
    status.textContent =
      "Choose a .cshapes backup to validate and preview. Nothing is imported until confirmation.";
  });
  dialog.append(
    heading,
    note,
    saveButton,
    backupExport,
    backupImport,
    button("Browse", browse),
    button("Close / Cancel", close),
    status,
    content,
  );
  const open = button("Personal Shapes…", async () => {
    if (!dialog.open) dialog.showModal();
    await browse();
  });
  open.id = "personal-shapes";
  document.querySelector(".project-buttons")?.after(open);
}
