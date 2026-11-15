# Phase 8.3b.3 — Resident exact pages and scheduled dirty meshing

2026-11-12 (Australia/Melbourne). Offline follow-up to the
[packed-master study](SPARSE_SDF_EXACT_PAGES_RESULTS.md).

## Scope and method

New sculpts start with an empty field whose untouched samples are exactly
+12 mm. Edited 8³ Float32 pages supply brush and mesh reads. The existing
two-sample halo gathers straight from those pages, removing the separate
derived band cache and its classification work. The construction brush,
Jacobi Smooth, Subtract, page budgets, four-patch history and exact
reference remain the same as the 8.3b.1 growth replay.

Nine fresh workers rotate three variants over three trials each. The
variants are the 3-voxel band with synchronous halo, exact-only with
synchronous halo, and exact-only with bounded dirty extraction. Each
runs curved tube, branch and five-island sculpts at nominal 100, 500 and
1,000 mm spans. Spacing is 1 mm. Negative and positive growth, exact
ordered position/normal buffers, welded topology, Undo while work is
pending, prepublication cancellation and Redo are checked. A focused
queue test exercises refusal before commit. Publication remains synchronous
and interruption during publication is outside the prototype.

The sparse scheduler coalesces pending chunk keys and services them in
FIFO order. It admits at most 192 pending keys, with up to four chunks
per slice and a soft 2 ms cutoff checked between chunks. Each stroke
requests one slice. If its patch cannot fit, additional slices run before
commit. A slice advances one logical tick. Age measures first enqueue to
service, including coalescing and backpressure. It measures dirty work
waiting in the CPU harness. Renderer upload, headset cadence and elapsed
input-to-visible time require separate tests.

## Growth results

Measured synchronous CPU stage, publication and dirty rebuild. Times
are p50 / p95 in ms. Resident bytes model exact pages, directory,
history, mesh and scratch. No dense metre-scale allocations were made.

| Shape | Span mm | 8.3b.1 band + halo | Exact pages + halo | Exact resident MiB |
| --- | ---: | ---: | ---: | ---: |
| Tube | 100 | 10.78 / 20.00 | 10.16 / 16.26 | 3.49 |
| Tube | 500 | 10.93 / 13.80 | 9.37 / 12.48 | 15.84 |
| Tube | 1,000 | 10.69 / 13.05 | 9.42 / 11.23 | 30.38 |
| Branch | 100 | 9.63 / 14.07 | 8.28 / 12.71 | 4.50 |
| Branch | 500 | 9.50 / 11.91 | 8.17 / 10.30 | 20.26 |
| Branch | 1,000 | 9.61 / 12.57 | 8.30 / 11.03 | 40.99 |
| Islands | 100 | 8.67 / 13.37 | 7.42 / 12.09 | 3.02 |
| Islands | 500 | 8.84 / 13.51 | 7.44 / 12.55 | 3.03 |
| Islands | 1,000 | 8.41 / 13.11 | 7.24 / 12.02 | 2.99 |

At the metre branch checkpoint, removing the derived band reduced
median staging from 1.67 to 0.36 ms and modeled resident bytes from
48.00 to 40.99 MiB. All variants agreed on exact-reference geometry,
normals and closed topology. The tube and branch retain one component
each. The islands retain five components.

| Scheduled shape | Peak pending | CPU slice p50 / p95 / max ms | Pending age p50 / p95 ticks |
| --- | ---: | ---: | ---: |
| Tube | 192 | 0.40 / 1.84 / 3.96 | 41 / 47 |
| Branch | 192 | 0.38 / 1.34 / 2.90 | 41 / 47 |
| Islands | 190 | 0.07 / 1.51 / 2.58 | 26 / 45 |

At the metre branch checkpoint, Undo started with up to 188 chunks
pending. The burst replay required up to 1,882 cumulative extra
backpressure slices by then, even with roughly 7,700 coalesced invalidations
per trial. Queue storage adds a modeled 48 KiB at 256 bytes per entry.
Mesh verification and instrumentation add process memory beyond the
resident model. Scheduled edit-local samples in the raw files observe
incomplete meshes while the queue drains, so those samples cannot
establish a working-memory peak.

## Admitted dense comparison

Four fresh paired compact-bust trials at 129³ alternate backend order.
They use the same production incremental extractor, at most four chunks
and a soft 2 ms cutoff, with all slices drained before each next action.
All seven field/mesh checkpoints match across dense and exact pages.
Dense Smooth edit plus complete drain took 12.72/18.63 ms p50/p95, and
exact pages took 14.15/19.96 ms. Dense individual slices were 2.52/3.92 ms
and exact-page slices were 2.53/3.98 ms. The soft cutoff allows a single
chunk to exceed 2 ms. Modeled working high-water was 28.13 MiB dense and
12.76 MiB exact-page sparse. This compact control isolates the admitted
CPU path. It drains per action and leaves cross-action queue age to the
large replay.

## Decision

**Go for further isolated resident-page research. No-go for production
8.3c.** The new-from-empty path preserves tested fidelity and avoids
duplicate band storage. FIFO scheduling saturates and keeps dirty chunks
pending across too many logical ticks. Test narrower invalidation from
actual changed samples and prioritize brush-local chunks, with a
starvation bound. Re-run the same burst and dense comparison before
advancing. Existing arbitrary imported masters and production
persistence remain separate dependencies.

Focused tests passed 51/51 and quick tests passed 21/21. Full
`npm run check` passed format, lint, strict types and build, then
1,739/1,744 tests passed. Five sandboxed loopback listeners failed
with `listen EPERM`. No tests were skipped.

## Reproduction

```sh
node scripts/benchmark-narrow-band-perf.mjs work/narrow-band-perf/exact-scheduled scheduled
node scripts/benchmark-scheduled-compact.mjs work/narrow-band-perf/exact-scheduled-compact
node scripts/research/narrow-band-perf-summary.mjs work/narrow-band-perf/exact-scheduled
node scripts/research/scheduled-summary.mjs work/narrow-band-perf/exact-scheduled work/narrow-band-perf/exact-scheduled-compact
npm test -- dirty-chunk-queue narrow-band exact-pages dense-growth history-project
npm run test:quick
npm run check
```

The growth runner resumes completed workers via its bundle-checked manifest.
Workers have a 120-second timeout and 448 MiB V8 old-space cap. Compact
pairs have a 90-second timeout and 384 MiB V8 old-space cap. Raw reports
are in the directories above. Use fresh directories for changed code.
