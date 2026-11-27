# Phase 9.3 · Experimental sparse tool compatibility

2026-11-28 (Australia/Melbourne). Baseline `2443820`. Dense remains the
default. The fixed-lattice trial retains Phase 9.2's halo gather, queue
deduplication, age-ordered release drain and diagnostics. Native v24 and
recovery preserve the exact sample field and reopen through dense storage.

## Operation coverage

| Operation | Sparse trial status |
| --- | --- |
| Clay Add/Subtract, Smooth | Existing shared implementation. Add requires a safe fixed-lattice footprint. |
| Inflate, Flatten, Scrape | Existing shared local brush math. Verified with offset mirroring, negative model coordinates and a page seam. |
| Pinch, Crease | Existing shared Jacobi evaluation. Sparse dabs publish after history and page preflight. Verified cooperative cancellation, offset mirroring and exact history. |
| Mask and erase, Paint and erase | Existing lazy copy-on-write pages, independent of geometry storage. Verified sparse history, cancellation after partial channel writes, and v24 persistence. |
| Personal Shape as an immutable source for a dense stamp target | Sparse capture copies resident Float32 pages. Verified transformed, calibrated and mirrored add/subtract patches against a dense source after editing the sparse original. |
| Shape Stamp and Personal Shape Stamp into sparse | Dense target required. Analytic and personal CSG can change positive far-field values across the lattice. Exact sparse admission and bounded publication need separate validation. |
| Move, Elastic, Rotate, Twist sculpt reconstruction | Dense target required by worker input, reconstruction and replay. Object transforms use the existing layer transform path. |
| Plane Cut and automatic growth | Dense required. Sparse sample indices and page addresses remain stable. |

The local tool audit found that Inflate, Flatten, Scrape, Pinch, Crease,
mask, paint and local mirroring already enter through shared volume methods.
The change preserves interpolation and brush arithmetic. Each sparse geometry
dab counts newly tracked samples during evaluation, checks history capacity,
then reserves all missing pages before writing samples or invalidating
chunks. Pinch and Crease yield during evaluation and publish the completed
dab without a yield. Per-stroke history still rolls back earlier dabs if a
stroke is cancelled. The editor rejects overlapping samples and stops a
suspended sample if its stroke or path ends.

Mask and paint still write cooperatively during a stroke and restore their
copy-on-write snapshots on cancellation. Their history memory check remains
after sample evaluation. Geometry pages remain resident through cancellation,
erase and Undo so replay needs no allocation. Reclaiming exterior-only pages
requires a history-aware lifetime policy. Native save, recovery and explicit
dense layer duplication still stage full fields. Personal Shape source capture
uses exact resident pages and retains the shared interpolation and exterior
distance arithmetic.

## Compact bust CPU replay

On macOS arm64 with Node v26.8.1, the integration benchmark uses the full
129³ bust at 1 mm spacing, followed by 28 successful edits per local tool
per backend run. Placement uses
surface vertices near the bust's seven detail stroke endpoints. Two paired
runs alternate backend order. Timings include brush, history and complete CPU
mesh drain with no frame waits, GPU submission or renderer work. Field and
ordered position/normal hashes matched at all 12 checkpoints in each pair,
including Undo and Redo. Final geometry had 109,908 triangles.

| Tool | Dense CPU p50 / p95 / p99 (ms) | Sparse CPU p50 / p95 / p99 (ms) |
| --- | ---: | ---: |
| Inflate | 12.55 / 20.48 / 20.80 | 15.13 / 21.90 / 22.29 |
| Flatten | 12.48 / 21.08 / 21.97 | 15.34 / 22.11 / 23.45 |
| Scrape | 13.01 / 21.04 / 21.59 | 15.03 / 22.15 / 22.38 |
| Pinch | 12.88 / 20.82 / 21.16 | 15.24 / 21.62 / 23.94 |
| Crease | 13.40 / 20.22 / 20.78 | 15.28 / 21.78 / 21.99 |

Tracked buffers at finish were 23.96 MiB dense and 8.73 MiB sparse. The
highest sampled checkpoint totals were 24.04 and 8.80 MiB. These totals
include values or pages, scratch, halo, CPU mesh arrays and four-action voxel
history. They exclude transient allocations, JavaScript container overhead,
the live editor Undo mesh cache and GPU memory. Maximum queued chunks were
36 dense and 20 sparse. Extraction slices reached 5.71 ms dense and 6.64 ms
sparse at p99 across the combined workload. A single chunk can overrun the
soft 2 ms target. The baseline Clay and Smooth portions in the same run
measured dense/sparse p95 of 57.98/42.57 ms for constructive Clay,
28.38/29.80 ms for surface Clay and 28.58/29.80 ms for Smooth.

## Validation and remaining gates

The editor regression compares whole-field Float32 bits, ordered chunk
positions and normals, mask pages and paint pages at equal spacing. It
exercises sparse page/scratch and history refusal, stale cooperative work
during cancellation, staged geometry publication, cached Undo and Redo,
v24 reopen, and recovery. Personal Shape source tests compare exact
destination patches after changing the original sparse volume. Focused
tests passed 42/42, including the dense XR stroke-routing regression.
Production Chromium smoke verified sparse New Project, sparse empty-layer
creation and dense empty-layer creation. The repository's
browser/MCP smoke verified approval, read-only behavior, scene edits,
Undo/Redo and production isolation. `npm run check` passed formatting, lint,
strict TypeScript, the production build and all 1,837 tests.

Promotion still requires paired physical Quest tests at equal spacing with
stroke-to-visible and release tails and compositor misses, isolated actual
peak memory with the live Undo cache, and production support for 1 mm
metre-scale fields. Large-dab publication cost, transformed lookup
performance, sparse Stamp and Move-family reconstruction, and safe page
reclamation remain open. Phase 9.2 remains accepted for opt-in development.

```sh
node scripts/benchmark-sparse-integration.mjs - work/phase-9.3-compact.json --compact-tools
npm test -- sparse-sdf personal-stamp clay-steady
npm run check
```
