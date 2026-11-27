# Phase 9.5 · Experimental native sparse persistence and growth

2026-11-28 (Australia/Melbourne). Baseline `9956ab790fa8dd0a60af06b839deca23a5d27d86`.
Sparse remains an opt-in layer and project choice. Dense and analytic projects
keep v24. A project with any sparse layer writes v25, including mixed scenes.
The v1–24 reader remains available.
[Native archive layout](NATIVE_PROJECT_FORMAT.md#version-25-sparse-layers)

## Persistence and growth

Native save and open, Library import and duplication, and recovery worker
snapshots use resident Float32 pages directly. Archive records have stable
signed lattice coordinates, an explicit implicit distance, exact padding,
and fixed offsets. The decoder validates archive bounds, resident page and
channel admission, signed page order, and the aggregate triangle budget.
Sparse mesh preparation starts from cell blocks that can see a negative
page. The existing transactional Library writes and checksummed recovery
checkpoints retain the previous payload on failure. Undo stays session-local.

Clay stages growth before rebinding the live field, mask and paint channels,
their timeline snapshots, voxel Undo/Redo and the chunk layout. Spacing,
pose, old sample bits, and signed page and chunk keys stay fixed. Unaffected
chunk geometry and cached Undo chunks can be reused. Chunks with changed
boundary stencils rebuild. Newly admitted samples use the exact implicit
default. Beyond the new boundary, sampling still extends the positive
boundary by distance. Clay refuses growth across a non-default moving face
or when voxel history could restore non-default face values. This covers
Stamp and Boolean results that write positive far-field distances to the
outer samples. Existing positive distances remain exact in v25. Cancelling
or undoing a Clay stroke replays its values. Validated extra capacity and
allocated pages can remain resident for reuse.

The logical ceiling is 1,153 samples per axis and 32,768 16-cell chunks per
sparse layer. The active directory still has an entry per logical chunk.
The 13,824-page resident limit is separate. Project admission estimates
resident pages, page and chunk overhead, scratch, channels, CPU geometry and
history. Growth additionally budgets candidate pages and layout, channel
remaps and voxel history indices. The current upper memory estimate is
256 MiB. Per-brush scratch remains capped at 8 MiB. Archive and Stamp
transient limits still apply. These estimates do not measure process or GPU
peak memory.

### Index-based operations

- Clay, local resampling tools, mask, paint, mesh invalidation and
  voxel/channel replay use current dimensions. Personal Stamp sampling
  captures detached pages and a fixed lattice. Boolean sampling uses each
  source's current grid and existing derived-work limits.
- Analytic and Personal Shape Stamp still have a bounded exact scan.
  Add must fit the current lattice. Operations whose candidate scan would
  exceed the existing project voxel-work cap refuse before staging.
- Move-family and Plane Cut still require dense sources. Resolution
  resampling, Reset, layer duplication and dense Personal Shape master
  creation/insertion explicitly refuse expanded sparse volumes. Project
  Library duplication handles the full v25 project.
- Pages remain pinned while resident, including pages referenced by active
  writes or history. Page reclamation remains a separate lifetime change.

## Resident-page and future OPFS boundary

The page key belongs to the immutable sample lattice, with project and layer
IDs forming the outer namespace. A page directory can use the same signed
keys for durable records. Current reads have a synchronous resident fast path.
The directory exposes implicit, resident-clean and resident-dirty states.
Decoded pages start clean and writes or new allocations mark pages dirty.
Current saves encode all resident records and dirty tracking remains
conservative until reopen.

For asynchronous paging, add a durable directory entry for every persisted
page and distinguish evicted and loading states from implicit absence.
Prefetch the complete brush, mask/paint, interpolation, mesh halo or replay
footprint before granting a synchronous read lease. Keep active transactions,
history references, captured sources and checkpoint generations pinned until
released. A known nonresident page must suspend or refuse the operation if
it was not prefetched. It cannot substitute an implicit value. Stable
checkpoint generations should stage independently addressed records, verify
their sizes and checksums, and publish one manifest or root reference only
after all required records are durable. Keep the previous committed
generation readable until publication succeeds. Acknowledge a clean page
only if its write generation matches the committed record. OPFS storage,
eviction, async prefetch, and reclamation are outside this implementation.
Indexed live geometry remains a separate mesh experiment.

## 1 mm CPU replay

Apple M5 Pro, macOS arm64, Node v26.8.1. The table shows one isolated
CPU replay per fixture. The earlier run produced the same mesh hashes.
The compact bust uses the established 132 strokes. Tube, branch and islands
use the Phase 8.3 trace at 100, 500 and 1,000 mm nominal spans. The longer
fixtures start from 65³ and grow in the editor. The replay drives consecutive
layer-local input samples from the recorded endpoints, then completes mesh
drain before the next stroke. The timers include CPU extraction with no
frame waits or GPU submission. Save and open measure the codec alone. Open
excludes the subsequent verification remesh. The tracked figure is the
highest sampled completed-stroke estimate, including enabled Undo mesh
caching. All ten saved states, including the two partial runs, matched
resident Float32 pages, lattice coordinates and the ordered position and
normal bytes keyed by chunk. Undo followed by Redo reproduced the final mesh.
The highest sampled edit queue was 20 chunks.

| Fixture | Edits | Logical lattice | Resident pages | Triangles | Archive MiB | Save / open ms | Edit p50 / p95 / p99 ms | Tracked MiB |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Compact bust | 132/132 | 129×129×129 | 502 | 109,432 | 0.99 | 75.6 / 77.8 | 20.7 / 35.2 / 51.6 | 22.17 |
| Tube 100 mm | 15/15 | 129×65×65 | 225 | 40,264 | 0.44 | 25.0 / 26.5 | 14.2 / 23.0 / 23.0 | 7.15 |
| Tube 500 mm | 72/72 | 577×65×65 | 1,125 | 193,696 | 2.21 | 74.5 / 80.3 | 15.2 / 29.0 / 41.4 | 34.52 |
| Tube 1,000 mm | 143/143 | 1057×65×65 | 2,155 | 376,388 | 4.23 | 150.0 / 153.9 | 14.9 / 39.6 / 46.4 | 63.77 |
| Branch 100 mm | 27/27 | 129×129×129 | 409 | 49,720 | 0.80 | 29.9 / 36.3 | 13.6 / 20.7 / 24.4 | 9.99 |
| Branch 500 mm | 134/134 | 577×321×385 | 1,917 | 236,994 | 3.77 | 123.5 / 120.0 | 14.3 / 38.7 / 40.6 | 52.14 |
| Branch 1,000 mm | 156/268 | 641×417×481 | 2,267 | 279,190 | 4.45 | 145.6 / 143.4 | 14.4 / 43.4 / 51.3 | 65.81 |
| Islands 100 mm | 5/5 | 145×129×129 | 200 | 33,116 | 0.39 | 38.0 / 16.9 | 15.1 / 17.5 / 17.5 | 3.50 |
| Islands 500 mm | 5/5 | 561×385×417 | 204 | 33,116 | 0.40 | 35.9 / 34.2 | 13.3 / 23.9 / 23.9 | 13.89 |
| Islands 1,000 mm | 3/5 | 577×369×417 | 108 | 19,908 | 0.21 | 10.8 / 10.9 | 12.0 / 18.7 / 18.7 | 13.39 |

The branch and islands reached the logical directory ceiling before exhausting
their resident page budgets. This leaves the metre-scale fixture gate open.
The replay compares each archive with its live field and does not claim
cross-implementation parity with the separate Phase 8.3 research kernel.
Physical Quest timing and isolated CPU/GPU peak memory remain unmeasured.

## Verification

Quick checks passed 21/21. The focused storage, growth, brick-volume,
Library and recovery checks passed 138/138. The final localhost-enabled
`npm run check` passed formatting, lint, strict TypeScript, the production
build and all 1,851 tests. The first full run caught a dense grown-lattice
normal regression. Dense retained its original arithmetic and the corrected
implementation passed the full rerun.

Production Chromium opened a signed sparse project through Library import,
saved it, downloaded a byte-exact sparse field and restored it from autosave
after reload. A second production smoke covered sparse analytic and Personal
Stamp, Bake and Undo/Redo. The automated tests also covered malformed page
records, mixed files, cancellation, storage quota, source boundary refusal,
both growth directions and cached Undo.
The scoped Chromium and stdio MCP smoke passed browser approval, sparse
Boolean Bake and Undo. The editor uses its existing render hold while
that MCP Bake computes. Earlier broad MCP attempts stopped at a
history-panel assertion and a Bake deadline. A portable-download click
in the MCP fixture did not yield a browser download event. The separate
production Stamp/Bake smoke passed v25 download and validated the active
page descriptor. The production Library/recovery smoke compared complete
page values after download. Earlier broad MCP attempts used the script's
default ignored diagnostics directory, `work/phase-7-3`. Phase 9.5's
scoped run uses `work/phase-9.5-agent`.

```sh
TRACE=work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json
node scripts/benchmark-sparse-persistence.mjs "$TRACE" work/phase-9.5-benchmark.json
npm test -- sparse-sdf dense-growth analytic-project project-library project-workflow recovery
npm run check
node scripts/sparse-persistence-browser-smoke.mjs
node scripts/sparse-csg-browser-smoke.mjs
AGENT_SMOKE_HOST=127.0.0.1 AGENT_SMOKE_REPORT=work/phase-9.5-agent npm run test:agent:browser -- --sparse-bake
```
