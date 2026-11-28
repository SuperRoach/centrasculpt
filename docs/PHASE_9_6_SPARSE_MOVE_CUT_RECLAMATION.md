# Phase 9.6 · Sparse Move, Plane Cut and page reclamation

2026-11-29 (Australia/Melbourne). Baseline `55f9e29`. Sparse remains opt-in
and uses native v25. Dense remains the default.

## Editor support

| Operation | Experimental sparse coverage |
| --- | --- |
| Move, Elastic, Rotate, Twist and Free Move | Separate Layers, editable clay, and a settled source mesh. Uses the existing live-radius gesture and combined pull plus wrist twist. Mask protection and paint transport use the existing Move rules. |
| Move with Mirror | Refuses while Mirror is enabled. The current Move preview has a single influence. |
| Move growth | Fixed spacing and signed page/chunk keys. Both moving faces and retained voxel history must admit the exact implicit extension. Oversized footprints, resident pages or candidate memory refuse atomically. |
| Plane Cut | Active editable clay layer, including grown sparse volumes and transformed layers. Both capped pieces keep their sparse lattices. Masks and paint are clipped using the existing two-voxel distance rule. Cut All with multiple eligible layers requires dense sources. |
| Reclamation | Idle service drops exact implicit geometry pages after active readers and retained voxel history release them. Positive non-default distances, including those with no surface, remain resident. |

Move copies resident pages into an immutable reconstruction input. Existing
radial deformation and the signed-distance worker evaluate a bounded
source/destination footprint plus a three-voxel halo. The worker receives
detached page records and source triangle positions in stable lattice order.
It uses the complete source surface for nearest-distance and sign queries.
Combined index and patch work must fit the memory estimate. A cooperative
route is available when worker snapshots would exceed the worker allowance
or workers are unavailable. New pages, channel remaps, history and the
replacement mesh are staged before publication. Growth keeps the Phase 9.5
face restrictions. Undo and Redo replay exact voxels at the grown capacity.
The benchmark enables the existing brush Undo mesh cache. Move uses its
existing history replay, with no separate cached mesh for the Move action.

Plane Cut applies the same saturated half-space intersection to both
backends. Applying the formula to an implicit sample yields the same exact
Float32 background, so the sparse scan visits resident pages only. Positive
non-default samples may change on either side. The candidate pieces,
selection and one history entry publish together after memory and triangle
checks. Cancellation or refusal preserves the source and its redo branch.

Reclamation examines a limited number of candidate pages on idle frames.
Every sample, including page padding, must equal the implicit value. Voxel
Undo, Redo and pending actions pin conservatively using their affected
bounds. Reader leases protect live records during Move, Cut and recovery
capture. Captured sources own their detached buffers. Mask and paint use
independent copy-on-write pages with their own history snapshots, so SDF
reclamation leaves these channels intact. The resident directory revision
invalidates cached readers after a page disappears. A reclaimed key reads
as implicit. A future OPFS manifest will need explicit evicted and loading
states for keys that still have durable data. The native record layout and
the implicit, resident-clean and resident-dirty interface remain in use.

## Measurement

The paired Node replay builds the full 132-stroke compact bust at 129³
and 1 mm spacing, then applies Move gestures and a long combined pull and
twist that grows the lattice. Each pair reverses the order of dense and sparse
runs. The replay uses the production reconstruction worker module via Node
worker threads and drains the real CPU mesh queue. It hashes complete
Float32 fields and ordered per-chunk position and normal buffers at the
bust and edit checkpoints. Each Redo must reproduce its committed bytes.

macOS arm64, Node v26.8.1. Both pairs matched the complete field, ordered
positions and ordered normals at every checkpoint. Free Move grew from
129³ to 129 × 129 × 177 and changed 54,806 samples. The compact bust's
settled tracked memory was 34.23 MiB dense and 19.29 MiB sparse, with
completed-stroke peaks of 37.11 and 22.17 MiB.

| Gesture | Wall ms dense / sparse, both runs | Retained MiB dense / sparse | Peak accounting MiB dense / sparse | Worker input MiB dense / sparse |
| --- | --- | ---: | ---: | ---: |
| Move | 451–452 / 431–445 | 26.94 / 11.93 | 76.11 / 34.95 | 11.95 / 4.74 |
| Rotate | 499–504 / 517–524 | 27.07 / 12.09 | 68.88 / 27.75 | 11.97 / 4.83 |
| Twist | 398–400 / 399–410 | 27.10 / 12.12 | 68.95 / 27.84 | 11.97 / 4.84 |
| Free Move with growth | 731–745 / 732–740 | 34.53 / 13.70 | 81.63 / 29.16 | 15.02 / 4.84 |

Wall time covers copy, worker round trip, reconstruction, history and
meshing, including cooperative yields. The growth worker round trip took
665–672 ms dense and 656–663 ms sparse. The measured main-thread
`postMessage` call took 0.027–0.057 ms dense and 0.153–0.214 ms sparse
across all gestures. These measure different parts of the worker path.
The input column counts transferred pages or values and triangle positions.
The growth reply transferred 0.75 MiB of patch buffers in each backend.

Retained bytes come from the editor's buffer accounting, including
geometry, voxel history, sidecars and the brush Undo cache when present.
Peak accounting includes source and candidate, copied worker input,
index and patch buffers, history remaps and mesh staging allowances. The
highest progress callback samples for the growth edit were 59.84 MiB
dense and 24.38 MiB sparse. Worker scratch, JS heap, allocator residency
and renderer/GPU peaks require separate measurement.

The sparse queue peaked at 18 pending chunks and 28.7 ms oldest queued
age in the CPU replay, including construction and history replay. For
Free Move Undo/Redo, sparse drained in 7/9 slices with total action times
of 23.2–23.5/31.2–31.5 ms. Dense replay was synchronous and took
16.7–20.5/20.1–29.0 ms. The benchmark runs slices back-to-back, without
frame scheduling, renderer submission or physical controller timing.

## Verification

Focused suites exercise five Move-family modes, independent triangle
publication order, translated/rotated layer sampling, masks and paint,
negative signed pages, seams, exact growth, page and memory refusal,
pre-publication cancellation, history replay, eviction and redo discard,
and native/recovery serialization. The cut fixture checks a positive
far-field sample on a page outside the sculpt and compares the complete
reopened fields and meshes.

Quick checks passed 21/21 and the focused suites passed 190/190.
The localhost-enabled full check passed formatting, lint, strict
TypeScript, the production build and all 1,857 tests. Chromium exercised
the WebGL Move preview via simulated controller poses, the actual sparse
Move worker, Undo/Redo and v25 reopen. The desktop smoke imported a sparse
source through Library, cut it and decoded both sparse pieces from the
download. The production Library and recovery smoke restored exact signed
pages after reload. The scoped browser-approved stdio MCP regression passed
sparse Boolean Bake and Undo.

```sh
npm run test:quick
npm test -- sparse-move-cut sparse-sdf plane-cut move-worker project-library recovery dense-growth persistent-move rotation-move
npm run check
node scripts/benchmark-sparse-move.mjs work/phase-9.6-move.json
node scripts/sparse-move-browser-smoke.mjs
node scripts/sparse-persistence-browser-smoke.mjs
AGENT_SMOKE_HOST=127.0.0.1 AGENT_SMOKE_REPORT=work/phase-9.6-agent npm run test:agent:browser -- --sparse-bake
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an installed Chromium browser.
The benchmark JSON and check logs are under ignored `work/`.

## Phase 9.7 readiness handover

Carry forward paired physical Quest dense/sparse measurements at matched
detail, including controller-to-visible tails, missed frames and release
latency. Measure isolated peak CPU, renderer and GPU memory with the Undo
cache, reconstruction worker and autosave active. Repeat the full 1 mm
metre-scale suite. The Phase 9.5 tube reached one metre, while its branch
and islands reached the logical chunk ceiling. The compact replay does
not qualify those fixtures for production. OPFS paging and indexed live
geometry remain separate work.
