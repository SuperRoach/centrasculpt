# Phase 1.5 — completion report

Implemented the layer-ready architecture and shape-definition foundation behind the existing Phase 1.4 application. The UI and default single-volume appearance are unchanged. No layer controls, multi-layer renderer/compositor, shape picker, stamping, previews, controller interaction, sparse octree or GPU compute were added.

## Protection

The workspace was not a Git repository. Git initialization failed with `Operation not permitted` for `.git`, so a checksummed source archive was made before edits instead. `phase-1-4-before-1-5.tar.gz` and `phase-1-4-before-1-5.sha256` are included in the outputs directory. The archive contains original source, scripts, tests, configuration, documentation and deliverables, excluding dependencies/build caches and scratch work. No existing source files were deleted. Restore into a separate empty directory when inspecting the checkpoint.

## Architecture

- **VolumeStore:** local/world SDF sampling, dimensions, physical local voxel spacing, bounds, validated region reads/writes, brush editing/dirty bounds, normals and history replay. Dense SDFVolume implements the contract. Meshing and resampling retain their dense fast path; a generic store without a linear view also passes tests.
- **SculptProject / LayerStack / SdfLayer:** one Base layer in the running application, with stable ID/name, independent volume/grid metadata, positive-scale Euler XYZ transform, visible/locked flags, Boolean operation metadata and order. Active-layer routing guards brush edits, reset and resolution changes. IDs/metadata survive resampling and save/load.
- **History:** sparse stroke-level deltas now carry target layer ID and action kind. Replay stays bound to the original volume and respects locking/visibility. Reset remains undoable; project load and resolution change still clear history.
- **Native v3 serialization:** preserves project identity, active layer selection, settings/camera, all layer metadata and exact Float32 voxel values. v1/v2 migrate to a Base layer without changing voxel data; hardness is preserved or defaults to zero for v1. Packed offsets, spacing, IDs/order, transforms, values and resource bounds are validated before replacement. The codec supports bounded future data-only records, but the application rejects multi-layer files explicitly.
- **Shape contracts:** sphere, box/cube, triangular prism and pyramid definitions, with transforms/dimensions, target layer ID, Add/Subtract operation and validated identities. Future kernel/preview interfaces, one-stamp intent/history kind and normalized analogue scale inputs are prepared as pure data contracts. There is no geometry mutation or controller implementation.
- **Rendering/export:** the existing local dirty-chunk mesher, shared-grid seam triangulation, gradient normals, camera controls, performance instrumentation and combined visible-chunk GLB path remain in use.

## Changed files

New:

- `src/volume-store.ts`
- `src/transform.ts`
- `src/layers.ts`
- `src/shapes.ts`
- `tests/layer-foundation.test.mjs`
- `tests/fixtures/phase14-volume-golden.json`

Adapted:

- `src/sdf.ts`, `src/mesh.ts`, `src/stroke.ts`, `src/resolution.ts`: storage contract and sampling/region integration; dense hot paths retained.
- `src/history.ts`: layer-targeted transaction metadata and edit guards.
- `src/project.ts`: v3 codec, metadata/resource validation and legacy migration; compatibility APIs retained.
- `src/main.ts`: single Base project ownership and active-layer command routing; single-layer import guard; transform/visibility presentation.
- `scripts/compile-core.mjs`, `scripts/benchmark.mjs`: compile the new modules and benchmark the real Base-layer command path without overwriting the Phase 1.4 measurements.
- `README.md`: architecture, contracts, formats, scope, limitations and validation.

`src/ui.ts`, `src/style.css`, `src/surface.ts`, package dependencies and the existing regression tests remain unchanged.

## Validation

- `npm run build`: passed strict TypeScript and Vite production build. The existing bundle-size warning remains; current main bundle is approximately 582 kB / 150 kB gzip, versus approximately 571 kB / 147 kB gzip before this phase.
- `npm test`: **47 passed, 0 failed**. All 32 original tests remain, plus 15 foundation tests.
- Golden field hashes from the pre-change source prove bit-exact Add/Subtract/Smooth results and matching dirty bounds for three grid sizes.
- Tests cover transformed/local sampling, region isolation and atomic validation, no-dense-view fallback, stable IDs/metadata/independent grid spacing, selection/order, hidden/locked edit guards, layer-targeted history, legacy migration, v3 metadata/payload validation, v3 64³/128³/192³ round trips, all four shape definitions and future analogue event validation.
- Existing tests still cover watertight chunk boundaries, continuous normals, local remeshing and untouched buffer identity, hardness/Smooth behavior, history, dense stability, all resolution options and actual binary GLB accessor/vertex counts.
- Browser checks: unchanged UI, all three brushes, hardness, Cmd+Z/Cmd+Shift+Z, v3 Save/Open with restored settings, 128³ resampling with history clearing, undoable reset and combined GLB export. The actual downloaded native file was inspected and contains version 3, project/active layer IDs, one Base record, dimensions/voxel size and the saved hardness.

## Benchmarks

Same CPU benchmark pattern as Phase 1.4: 16³-cell chunks, radius 0.22, strength 0.35, hardness 0.5, stationary pole stroke, dt 1/60. The new run includes active-Base command routing, world-to-local conversion and sparse history recording. GPU upload/rendering, raycasting and UI work are excluded.

| Samples | Previous local mesh | Current local mesh | Current full mesh | Add / Smooth | Dirty / total chunks |
| --- | ---: | ---: | ---: | ---: | ---: |
| 64³ | 15.3 ms | 15.3 ms | 79.3 ms | 0.12 / 0.14 ms | 8 / 64 |
| 128³ | 11.6 ms | 11.8 ms | 278.7 ms | 0.47 / 0.58 ms | 8 / 512 |
| 192³ | 12.6 ms | 12.7 ms | 751.1 ms | 1.29 / 1.26 ms | 12 / 1728 |

Local remeshing remains effectively at the previous 12–15 ms baseline (0%, +1.7%, +0.8% versus the recorded rows). Cold full meshing was about 5–11% slower in this single-run comparison. Resampling from 64³ to 128³ / 192³ measured 68.0 / 216.7 ms versus 65.6 / 213.4 ms previously. These single-run initial/conversion differences are observations, not proof of a statistically significant regression; there is no frame-rate guarantee. The dense resampler now borrows one linear view outside its inner loop to avoid repeated storage checks.

Raw results are saved in `phase-1-5-benchmarks.json`; `phase-1-4-benchmarks.json` remains unchanged.

## Known limitations and next steps

1. The application still renders/edits one Base layer. Multi-record round trips are data-model groundwork only; opening such a project in the app reports an explicit unsupported-feature error and keeps the current sculpture.
2. Layer Boolean operation metadata is stored but never composited. Independent visual layers belong to Phase 1.6; Boolean evaluation belongs to Phase 1.7.
3. Shape interfaces/definitions/input intents are not executable tools. Procedural kernels, previews and one-action stamping belong to Phase 1.8.
4. Dense grids remain uniform and cubic. Different layers can have different resolutions/extents/voxel sizes, but anisotropic/non-cubic storage is not implemented.
5. Transform metadata uses positive scale and Euler XYZ rotation in radians. Uniform scale has correct distance scaling; nonuniform world SDF sampling is conservative, not exact Euclidean distance. The cursor is indicative for nonuniform transforms, and this phase exposes no transform editor.
6. History is still session-only, per-volume, with the previous 100-action / 32 MiB soft payload limit. IDs prepare transactions for future project-wide coordination; structural layer edits and serialized history are not implemented.
7. Meshing, initialization, resampling, validation and serialization remain synchronous CPU work. At 192³, SDF plus scratch alone uses 54 MiB; geometry, GPU buffers, history, conversion and export add memory. Existing aggregate file/sample/triangle limits remain enforced.
8. Version 3 files require the newer application. Older files remain readable; the legacy v2 writer is retained only for compatibility callers/tests.

Run from the existing workspace:

```sh
npm run build
npm test
npm run benchmark
npm run dev
```

No additional dependency installation was required. The dev server remains available at http://localhost:5173/.
