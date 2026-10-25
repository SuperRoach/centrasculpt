# Phase 1.6 — Independent Sculpting Layers

Implemented in the existing workspace. Each layer owns independent SDF voxel storage, resolution/bounds/transform metadata, chunk meshes, material and voxel history. Overlap is allowed and never causes automatic union, subtraction, intersection, baking, merging, spatial offsets or cross-layer resampling.

## Protection

The workspace is not a Git checkout and Git initialization remains unavailable under its filesystem permissions. A source checkpoint was created before edits: `phase-1-5-before-1-6.tar.gz`, with `phase-1-5-before-1-6.sha256`. The checksum was verified. Original project files and older outputs were retained. No dependencies were added.

## Delivered functionality

- Layers panel: create at 64³/128³/192³, active selection, rename, independent copy, confirmed deletion, reorder, visibility, locking, per-layer resolution display and viewport colour picker. At least one valid layer remains.
- New layers begin as independent spheres at the origin, allowing immediate surface sculpting. Copy has exact independent voxel storage, a new ID and fresh history; bounds/pose/flags are copied. No placement or overlap correction is automatic.
- Add, Subtract and Smooth pick and edit only the active layer's meshes/volume. Hidden/locked layers reject voxel commands. Other layers' bytes, buffers and history do not change.
- Each layer has its own runtime, mesher, chunk render group, material and sparse history. Local dirty chunk extraction and shared-grid seam/normal behavior are preserved.
- The model rejects aliased volume objects or dense buffers. Runtime identity guards reject out-of-band volume replacement rather than letting meshing/history target a different store.
- Resolution changes affect only the selected layer. IDs/name/pose/flags/preferences remain stable; only that layer's history is invalidated. Capacity failures keep the current project intact and report an error.
- Clay mode uses the original neutral material. Layer Colours mode uses per-ID material colours and a sensible default palette, all held outside the project model. Preferences are session-only and never serialized or baked into SDF data.
- All layers save/load in native v3 with separate packed payloads, names/order, flags, dimensions/bounds/spacing and transforms. v1/v2 single-volume files still migrate to Base. The schema remains v3; aggregate capacity is expanded to support multiple high-resolution layers.
- GLB export creates separate geometry/nodes per visible nonempty layer. Chunk geometry may be flattened within its own layer only. Nodes keep layer names, stable-ID extras and position/rotation/scale. Materials remain neutral; viewport colours and vertex-colour attributes are not exported.
- Transform metadata is applied to independent render groups, world picking converts into the target layer's local coordinates, and exported nodes retain transforms. No gizmos or interactive pose manipulation were implemented.

## Undo/redo policy

A project-wide chronological timeline coordinates per-layer sparse histories. Undo/redo uses the original target ID, selects that layer, and never redirects into another selection. Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z remain supported. Hidden/locked targets block replay with a message; their data/timeline stay unchanged until made editable.

Each continuous drag is one action. Reset is also a voxel history action. A new nonempty stroke/reset invalidates redo globally. Empty clicks preserve redo. Copy creates fresh history; deletion removes only the deleted layer's entries; resampling drops only its target entries. Other layers retain valid undo/redo. The timeline accounts for per-layer sparse-history eviction.

Structural layer management (create/copy/delete/rename/order/flags) and display preferences are not undoable in this phase. Delete requires confirmation and cannot remove the last layer. History is session-only and not included in native files.

## Validation

- `npm run build`: passed strict TypeScript and Vite production build. Main bundle approximately 596 kB / 154 kB gzip. The existing bundle-size warning remains non-blocking.
- `npm test`: **62 passed, 0 failed**. All 47 Phase 1.5 tests remain, plus 15 independent-layer cases.
- New tests cover overlapping-volume independence, all active-target brushes and unchanged inactive buffers, hidden/locked guards, chronological cross-layer history/redo invalidation, independent resolution and history invalidation, exact non-aliased copies, safe deletion/last-layer retention, stable names/order/colours, colour-free exact native serialization, multi-resolution/legacy load, unbaked transforms, separate actual GLB nodes/meshes/materials, resource input validation, history eviction and alias rejection.
- Earlier tests still cover SDF stability, Phase 1.4 golden brush values, VolumeStore equivalence, watertight chunk seams/continuous normals, local remeshing, hardness and Smooth, all supported resolutions, serialization validation and shape-definition contracts.
- Browser checks created 64³ and 128³ layers, sculpted both independently, changed viewport colours, hid/showed and locked/unlocked layers, renamed/reordered, copied and confirmed deletion, replayed strokes across targets, then resampled only Fine detail to 192³ while Base remained 64³ and kept its history.
- The actual saved browser project was reopened successfully with 64³/192³ layers, names/order/locks and independent data. Native metadata inspection confirmed no viewport colour/mode fields. The downloaded GLB was inspected and contains **two separate named layer meshes/nodes and one neutral material**. Raw verification is in `phase-1-6-file-verification.json`.

## Performance

Same CPU pattern as earlier phases, now with a second inactive 64³ layer present. 16³-cell chunks, radius 0.22, strength 0.35, hardness 0.5, dt 1/60. Brush measurements include layer routing, ownership/policy guards, coordinate conversion, sparse recording and dirty marking. Meshing excludes rendering/GPU upload, picking and UI. Local figures are warm medians; full mesh is the active layer's initial build.

| Active samples | Full mesh | Local mesh | Add / Smooth | Dirty / total chunks | Inactive data/buffers |
| --- | ---: | ---: | ---: | ---: | --- |
| 64³ | 71.4 ms | 16.6 ms | 0.37 / 0.12 ms | 8 / 64 | unchanged |
| 128³ | 242.6 ms | 10.8 ms | 0.42 / 0.43 ms | 8 / 512 | unchanged |
| 192³ | 699.7 ms | 11.0 ms | 1.15 / 1.15 ms | 12 / 1728 | unchanged |

Compared with Phase 1.5 local medians (15.3 / 11.8 / 12.7 ms), the latest 64³ row is about 1.3 ms / 8.5% higher, while the other rows are lower in this sample. Treat these as observations, not a statistically controlled regression claim or a frame-rate guarantee. Multiple visible layers add GPU draw calls and overdraw that this CPU benchmark does not measure. Raw output: `phase-1-6-benchmarks.json`.

## Changed files

New:

- `src/independent-layers.ts`: runtime ownership, editing/history coordinator, safe management/resampling and independent-node export.
- `src/display-preferences.ts`: session-only per-ID viewport mode and colour preferences.
- `tests/independent-layers.test.mjs`: independent-layer regression suite.
- `vite.config.ts`: exclude generated work/output/test/script changes from dev-server reloads.

Adapted:

- `src/layers.ts`: insert/remove with last-layer retention and shared-storage rejection.
- `src/history.ts`: safe redo-payload discard for global redo invalidation.
- `src/project.ts`: multi-layer application resource policy, unchanged v3 layout, larger aggregate voxel/file budget.
- `src/surface.ts`: optional layer-local chunk flattening so GLB nodes retain transforms.
- `src/main.ts`: layer coordinator integration, active-only picking/edits, panel handlers, global history, multi-layer import/export.
- `src/ui.ts`, `src/style.css`: Layers panel, view modes/colours, confirmations, responsive layout and active-resolution messaging.
- `scripts/compile-core.mjs`, `scripts/benchmark.mjs`: new-module compilation and independent-layer benchmark with unchanged-inactive verification.
- `README.md`: current behavior, policies, limits and validation.

Core SDF brush mathematics, VolumeStore, chunk extraction, resampling mathematics, transform helpers and shape foundation modules remain unchanged.

## Known limitations

1. Eight layers maximum, with an aggregate voxel budget equivalent to two 192³ grids (14,155,776 samples). This permits two 192³ layers, but not arbitrary eight-layer high-resolution combinations. There is no implicit downgrade; failed operations leave existing data intact.
2. Native save/load still enforces the one-million-triangle aggregate limit and now an approximately 54.1 MiB maximum file size. Older app versions may reject larger multi-layer v3 files due to their older limits.
3. Dense CPU storage and synchronous initialization/meshing/resampling/serialization remain. Two 192³ SDF/scratch pairs alone occupy 108 MiB; geometry, GPU buffers, per-layer history, old/new conversion volumes and exports add memory. Hidden layers still occupy memory.
4. Each layer retains at most 100 actions with a 32 MiB soft payload budget; aggregate history across layers can therefore be larger. Active-stroke map overhead is additional memory.
5. Overlapping surfaces remain separate, including coincident interiors. A small viewport-only polygon depth bias stabilizes exact ties by order without moving voxel/mesh data. Hide layers to inspect occluded surfaces. There is no Boolean compositor, Merge or Bake command.
6. Viewport colours/mode are session preferences. They can survive reopening the same stable-ID project in the same page, but reset on refresh/new sessions. Native data and GLB materials remain neutral/colour-free.
7. Structural management is not undoable. Delete requires confirmation; project loading starts fresh history. No autosave is included.
8. Transform metadata is preserved, but there are no gizmos or interactive movement/rotation/scale controls. Brush radius is layer-local; the prior indicative cursor/conservative field limitation remains for nonuniform scaling.
9. No shape stamping/UI, sparse octrees, GPU compute or WebXR/PCVR interaction was added.

Run from the existing workspace:

```sh
npm test
npm run build
npm run benchmark
npm run dev
```

The app is available at http://localhost:5173/.
