# Phase 1.9 — Explicit Merge / Bake Layers

Implemented an explicit, confirmed Bake workflow that creates a new independent editable SDF layer. Original layers are never deleted, merged in place, or resampled by Bake.

## Project protection

The workspace has no Git repository, and Git has been unavailable in this environment. A pre-edit source archive was created instead: `phase-1-8-before-1-9.tar.gz`. Its SHA-256 was verified against `phase-1-8-before-1-9.sha256`. Existing files and earlier phase outputs are retained.

## Workflow and architecture

- The Layers panel opens a Bake / Merge dialog with a result name, exact 64³/128³/192³ output choice, padded world bounds, world voxel spacing, approximate grid/scratch memory and a wire bounds preview.
- Hide contributing sources defaults to checked. Original hidden layers remain hidden. Locks, transforms, resolution, names, operation/order metadata and all original voxel arrays are preserved; legacy non-contiguous order values also survive Bake and replay.
- Keeping sources visible explicitly selects Separate Layers so the new approximation is not immediately recombined with the originals. The dialog warns that separate visible surfaces can overlap. Choosing Boolean Preview later is an explicit evaluation of all visible layers.
- Sampling directly reuses the ordered world-space Boolean evaluator, including inverse TRS, independent resolutions and uniform distance scaling. Union/Difference/Intersect and first-visible-layer initialization are unchanged. This is an SDF bake, not triangle-mesh concatenation.
- Destination bounds enclose all transformed source cubes with positive padding. A normalized local ±1.6 grid plus translation/uniform scale restores world bounds while keeping compatibility with the existing native format and sculpting stability range. Stored distances are world distance divided by destination scale. Far-field magnitudes saturate to ±6.4, preserving the zero surface; source samples are not changed.
- Fresh destination storage and mesh preparation occur off the project stack. Sampling yields every four slices, mesh generation every eight chunks. Cancel Bake and Escape abort safely. Empty sampled results, invalid/unreasonable bounds, memory/layer capacity and aggregate triangle failures leave the original project/history/flags intact.
- The prepared result commits once, appended/active/visible/unlocked with Union operation. It immediately supports Add, Subtract, Smooth, all transforms, naming, flags, independent resampling, native files and GLB.
- One Bake creation transaction retains the created runtime. Undo restores stack order/visibility, active ID and surface view; redo reuses destination voxel arrays and chunk geometry without resampling. Existing sparse stroke history still applies. Detached redo storage is released on branching and counts toward capacity while retained. Resampling updates the retained creation runtime safely.
- Native v3 is unchanged: a baked layer is an ordinary layer. Existing v1/v2 and v3 projects remain readable. Viewport colours, surface-view preference and undo history are excluded. Both export workflows remain available and neutral; hidden sources are excluded from geometry export.

## Changed files

| File | Change |
| --- | --- |
| `src/bake.ts` (new) | Typed options/plan/progress/stats; capacity/bounds/detail estimates; cooperative world-field sampling and cancellation |
| `src/independent-layers.ts` | Prepare/commit Bake, one-action creation replay, runtime retention/release, visibility/selection/view restoration, memory/triangle validation and busy guards; deferred/batched runtime meshing |
| `src/main.ts` | Confirmation workflow, wire bounds, progress/cancellation, timing messages, shared surface-view state and undo/load integration |
| `src/ui.ts` | Bake dialog, name/resolution/hide controls, estimates/warnings, progress and Cancel Bake |
| `src/style.css` | Bake button/dialog/progress layout |
| `scripts/compile-core.mjs` | Compile Bake module for tests and benchmarks |
| `scripts/benchmark-bake.mjs` (new) | Sampling/meshing/total/replay timing, source immutability and buffer reuse checks |
| `package.json` | Add `benchmark:bake`; no dependency changes |
| `tests/bake.test.mjs` (new) | 21 Bake regression tests |
| `README.md` | Controls, architecture, bounds/storage conventions, tests, benchmarks and limits |

The compositor, SDF brush mathematics, mesh algorithm, layer/native schema, project codec and export helper implementations were reused without changes.

## Validation

- `npm run build`: strict TypeScript and Vite production build passed. The existing bundle-size advisory remains (approximately 659 kB minified, 172 kB gzip).
- `npm test`: **121 passed, 0 failed**. All 100 earlier tests remain passing; no existing tests were removed or relaxed for this phase.
- New tests cover all Boolean operations and stack order, hidden/locked initialization, source immutability and destination buffer independence, mixed 64³/128³/192³ sources and output choices, translated/rotated/uniformly scaled sampling, padded bounds/positive boundaries/native compatibility, lower-resolution loss, empty/disjoint results, exact creation undo/redo and view/selection/flags restoration, kept-visible source behavior, continued Add/Subtract/Smooth and replay around Bake, redo invalidation/resource release, cancellation in sampling and meshing, edit gating, memory/triangle/layer errors, ordinary metadata/resampling and deletion safety, native/legacy round trips, separate/composite binary GLBs and non-contiguous legacy order preservation.

## Browser and downloaded-file checks

- Opened the existing 64³ Base / 128³ transformed Difference cutter example.
- Cancelled the configuration dialog: no history or layer changes. Started and cancelled a 192³ bake while sampling: no partial layer or visibility change.
- Confirmed the unchecked Hide sources path: both source/result stayed visible, the viewport selected Separate Layers, and the whole creation remained one Undo action.
- Completed **Baked subtraction**, 128³, default hide sources. New layer became active; both originals remained present and hidden. One Undo removed the new layer and restored source visibility/active selection; one Redo restored it.
- Sculpted the baked layer: a real Add stroke changed **2,759 destination voxels, zero Base voxels and zero cutter voxels**. It rebuilt **8/512 chunks** (12.7 ms in that browser sample); Undo restored the destination.
- Saved/reopened/resaved the baked project: **byte-identical** native files. All three independent voxel payloads, transforms, names/order/flags and active ID matched. The baked layer required no special file type or provenance metadata.
- Compared **all 2,097,152 destination samples** with direct ordered Boolean world sampling, divided by destination scale and stored as Float32: **maximum error 0**. Original source data and metadata matched the input, except the explicitly requested visibility change.
- Exported through both workflows after reloading: **one mesh node and 121,172 triangles** in each actual GLB. The separate node's matrix matched the baked native transform. Hidden sources were absent; materials were the existing neutral clay.

Detailed assertions are recorded in `phase-1-9-file-verification.json`. The screenshot `phase-1-9-dialog.png` shows the confirmation UI.

## Benchmark

Run `npm run benchmark:bake`. One run on this machine, Node v26.8.1, 64³ Union Base plus rotated/translated/scaled 128³ Difference cutter:

| Destination | Sampling CPU | Mesh CPU | Total including yields/commit | New grid + scratch | Undo | Redo |
| --- | --- | --- | --- | --- | --- | --- |
| 64³ | 32.5 ms | 51.7 ms | 115.5 ms | 2 MiB | 0.62 ms | 0.24 ms |
| 128³ | 140.3 ms | 229.3 ms | 486.7 ms | 16 MiB | 0.07 ms | 0.07 ms |
| 192³ | 389.5 ms | 676.4 ms | 1390.8 ms | 54 MiB | 0.06 ms | 0.06 ms |

Sources remained byte-identical, and redo reused voxel and geometry identities in every row. Total source-plus-output grid/scratch storage was 20 / 34 / 72 MiB. These measurements exclude initial source mesh creation, Boolean preview regeneration, rendering/GPU, picking and DOM. Sampling/meshing CPU timings exclude yields; total includes cooperative yielding and commit. Results are single local runs with normal machine variability, not frame-rate guarantees. Full JSON: `phase-1-9-benchmarks.json`.

## Manual acceptance

1. Run `npm run dev` and open http://localhost:5173.
2. Create a 128³ layer beside Base 64³. Move it to X .55 / Z .4, uniform scale .7, operation Subtract/Difference. Keep Base above it. Choose Boolean Preview.
3. Open Bake / Merge visible layers. Inspect bounds and memory; name it, choose 128³ or 192³, leave Hide sources checked and confirm. Verify three layers, hidden originals, selected editable baked result and one Undo action.
4. Sculpt Add/Subtract/Smooth; undo strokes independently, then undo the Bake. Source visibility, stack/selection and prior surface view should return. Redo Bake and confirm the result returns.
5. Try a bake with Hide sources unchecked: sources stay visible, and Surface View changes to Separate Layers. Undo restores the prior view/state. Try Cancel before confirmation and during progress.
6. Save/reopen. Verify independent source and destination resolutions, metadata and surfaces. Export Separate Layers and Boolean Result; hidden originals should not create duplicate geometry.
7. Run `npm test`, `npm run build` and `npm run benchmark:bake`.

## Known limitations

- Bake is a one-time finite-resolution approximation. Lower resolutions can lose fine detail in the new volume; sources keep their original data. Conservative cube bounds may include empty space. Surface creases and normals retain the existing interpolation behavior; no exact-distance reinitialization is added.
- Only positive uniform source transforms are supported. Destination centres/scales must fit existing ±1000 position and 0.001–1000 scale limits; unreasonable or too-small bounds reject rather than clip.
- Existing maximum eight live layers, aggregate voxel budget equivalent to two 192³ grids, and one-million-triangle native project limit remain. Hidden sources count. Retained undone Bake volumes also count toward capacity. Full projects may require a smaller destination or manually freed capacity; no source is silently deleted, downgraded or resampled.
- Grid estimates exclude preview caches, CPU/GPU meshes, histories and transient export/save buffers. A 192³ output adds 54 MiB grid/scratch. Cooperative work still runs on the main CPU thread; individual batches/allocations may briefly pause rendering.
- History is session-only. Structural create/delete commands remain outside history. Bake undo preserves later unrelated layers and skips originals explicitly deleted afterward; if every original was manually deleted, it refuses to remove the only remaining baked layer. Deleting a baked output discards its creation history.
- Kept-visible sources switch to Separate Layers immediately after Bake. Later explicit Boolean Preview selection evaluates all visible fields. Surface view is a session preference, not native metadata.
- Existing navigation/camera limits and viewport-only colours remain unchanged. No automatic reframing, shape library/stamps, VR controllers or deformation Move tools were added.
