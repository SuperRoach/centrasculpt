# Phase 9.1 · Experimental sparse SDF sculpting

2026-11-28 (Australia/Melbourne), based on Boolean optimisation `e94789c`.

Choose **Empty scene (experimental sparse)** in New Project or **Empty clay
volume (experimental sparse)** in Layers. Dense remains the default. The trial
uses the editor's existing 64³, 128³ and 192³ admission limits. It supports Clay
and Smooth on a fixed lattice. Clay refuses a stroke that would need to grow
the lattice. Shape Stamp, Move reconstruction and Plane Cut still require dense.

The backend stores exact Float32 samples in resident 8³ pages indexed by
numeric coordinates. An absent page reads as the exact empty field. Dense and
sparse share the brush, interpolation and normal arithmetic. The brush
preflights its local scratch and missing pages before publishing voxel changes.
Scratch is capped at 8 MiB. The project still reserves the dense allocation
estimate for admission. Pages touched by an edit remain allocated after
cancellation, Undo or erasure so history replay can restore voxels without
allocating pages.

Changed samples dirty the chunks that may observe the edit through their
cells or gradient stencils. The existing deduplicating FIFO has at most one
pending entry per chunk, capped by the lattice at 1,728 per 192³ layer. Each
sparse rebuild gathers a contiguous core and
two-sample halo into a reusable Float32 tile. Release, cancellation, Undo and
Redo drain over bounded slices. The editor uses a four-chunk ceiling and a
soft 2 ms cutoff for that drain, with the existing XR brush budget during
live strokes. Undo reuses the existing eligible mesh snapshot and publishes
it in slices. If a new edit invalidates the snapshot, queued chunks rebuild
from the current exact field.

Native v24 saves and recovery snapshots preserve the full exact sample field.
Reopen uses dense storage through the existing codec and admission path.
The trial selection and Undo history are session state. Native save and
recovery still stage dense buffers.

## Measured results

Apple M5 Pro, macOS, Node v26.8.1. Two dense/sparse CPU pairs per workload with
backend order reversed in the second pair. Each edit was followed by a full
drain using production chunk extraction in slices of up to four chunks with
a soft 2 ms cutoff. The timing includes brush, history and CPU drain, with
no frame waits, renderer submission or headset sampling. Undo and Redo in the
benchmark measure extraction and field replay. The editor regression also
exercises cached Undo. The two compact Undo runs measured 14.70/22.89 ms
p50/p95 dense and 23.14/24.00 ms sparse. Redo measured 14.29/22.89 ms
dense and 23.14/23.71 ms sparse.

The 129³ compact run reuses all 132 strokes of the Phase 8.3 compact bust with
the production empty value and 1 mm spacing. The metre run reuses the 143 tube,
268 branch and five island strokes. It keeps their physical coordinates and
radii and uses 192³ at 5.65 mm spacing. The editor cannot admit the original
1 mm metre lattice. Use the metre results to compare the two implementations
at the admitted detail, with the original 1 mm quality gate still open.

| Fixture and edit | Dense CPU p50 / p95 / p99 (ms) | Sparse CPU p50 / p95 / p99 (ms) |
| --- | ---: | ---: |
| Compact constructive Clay | 37.49 / 58.26 / 66.65 | 29.52 / 42.92 / 44.71 |
| Compact surface Clay | 18.85 / 29.37 / 31.96 | 22.79 / 30.68 / 34.39 |
| Compact Smooth | 20.18 / 29.03 / 30.33 | 22.99 / 30.25 / 31.75 |
| Metre tube constructive Clay | 3.30 / 4.84 / 5.39 | 3.11 / 4.82 / 5.68 |
| Metre branch constructive Clay | 2.08 / 4.04 / 5.32 | 1.98 / 3.56 / 4.06 |
| Metre islands constructive Clay | 1.76 / 4.74 / 4.74 | 1.46 / 4.39 / 4.39 |

| Fixture | Identical triangles at finish | Peak queued chunks, dense / sparse | Tracked buffers at finish, dense / sparse |
| --- | ---: | ---: | ---: |
| Compact bust | 109,432 | 36 / 20 | 23.94 / 8.71 MiB |
| Metre tube | 10,804 | 8 / 8 | 54.75 / 0.98 MiB |
| Metre branch | 13,796 | 8 / 8 | 54.96 / 1.46 MiB |
| Metre islands | 1,016 | 8 / 8 | 54.10 / 0.23 MiB |

Every checkpoint matched in whole-field Float32 bits and ordered chunk
position and normal bytes, including Undo and Redo. Compact sparse needed
at most 13 slices per edit versus 24 dense. Compact slice p95/p99 were
5.17/6.28 ms sparse and 4.75/5.69 ms dense. The cutoff is checked between
chunks, so a single extraction can exceed the slice target.

Tracked finish buffers include voxel pages or dense values, brush scratch,
halo, four-action history and CPU mesh arrays. Directory objects, transient
history, the editor Undo mesh snapshot and renderer allocations are outside
these totals. Whole-process max RSS was 424.36 MiB for the combined run,
including both backends, hashing and fixtures. It cannot isolate peak memory
by backend.

## Acceptance gates still open

The Phase 8.3 thresholds remain 50% working-memory savings versus dense
values plus scratch and 25% versus values alone, with no case over dense
values plus scratch. Warm lookup median remains at most
2× dense with no case over 3×, and transformed sampling at most 1.5× dense.
Geometry thresholds remain bit-exact band samples, zero sign drift,
interpolation deviation at most 1e-6 model units, normal component
deviation at most 1e-4, and no topology loss. Identical samples and stencils
require identical meshes. The independent deviation gate for approximate
geometry remains 0.01 voxel with thin-feature probes. Full master, project,
backup, recovery and Undo
roundtrips remain exact acceptance requirements. See the [8.3a gates](SPARSE_SDF_83A_RESULTS.md)
and [8.3b performance report](SPARSE_SDF_83B_PERF_RESULTS.md).

The CPU replays pass exact geometry for their sampled traces. They leave
isolated peak working memory, transformed lookup, Boolean and Stamp coverage
open. Compact surface Clay and Smooth miss dense p95/p99 in this CPU replay.
The physical Quest 3 comparison must still measure stroke-to-visible
p95/p99, missed frames, release drain and peak memory with the live Undo
cache. The original 1 mm metre-scale runs, lattice growth and recovery with
full production memory pressure remain blockers for promotion beyond opt-in.

## Regression validation

Format, lint, strict TypeScript and production build passed. The full suite
passed 1,815 of 1,820 tests in the sandbox. The five failures were localhost
listeners denied with `listen EPERM`. All five passed in the 36-test
localhost-enabled rerun. Quick tests passed 21/21. The sparse editor tests
covered dense default, exact Clay and Smooth, cached Undo, Redo, cancellation
with a pending queue, admission refusal, native reopen and recovery snapshot
persistence. A production-build Chromium smoke test passed sparse New
Project, dense empty layer creation and sparse empty layer creation.

## Reproduce

Use the existing metre-scale trace from the Phase 8.3 cost-aware run.

```sh
node scripts/benchmark-sparse-integration.mjs \
  work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json \
  work/phase-9.1-sparse.json
npm test -- sparse-sdf
npm run check
```

The JSON contains the exact signatures, per-action timings and queue samples.
