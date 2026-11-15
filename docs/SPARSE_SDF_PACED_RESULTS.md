# Phase 8.3b.5 — Paced dirty meshing, occupancy and deadline priority

2026-11-12 (Australia/Melbourne). Offline follow-up to the
[changed-sample queue comparison](SPARSE_SDF_DIRTY_PRIORITY_RESULTS.md).

## Design

The resident exact-page growth fixture replays curved tubes, branches and
five separated islands at 100, 500 and 1,000 mm with 1 mm spacing. The
matrix rotates three policies at two cadences, with three fresh workers
per configuration. All policies use the existing changed-sample dirty
coverage, 192-key capacity, four serviced keys per slice and a soft
2 ms CPU cutoff checked between keys.

- **Narrow FIFO** is the previous baseline.
- **Occupancy FIFO** screens the current authoritative 9³ core using
  the same inclusive sign test and zero tolerance as extraction. Uniform
  chunks bypass halo gathering and extraction. Any old mesh for a uniform
  chunk is removed. Mixed chunks use the existing exact halo and extractor.
- **Occupancy + deadline** chooses the nearest chunk until the oldest
  pending key reaches four ticks. It then chooses FIFO until the oldest
  falls below that age. Coalescing preserves first-enqueue age. The
  threshold changes service order. Service capacity determines how late
  a chunk can ultimately be.

Virtual scheduling uses a 90-slot/s scale. A stroke requests one slice.
The 45-edit/s configuration gets one additional slice before the next
stroke. Admission backpressure inserts extra service slices and delays
the next offered edit. The replay models closed-loop input and records
those extra slices. It does not use timers or simulate an external
input backlog. Release drains pending work without new edits, before
the existing Undo, staged cancellation and Redo checks. Queue age and
release drain use logical slots. CPU times come from the host monotonic
clock. These measurements leave rendering, compositor timing and Quest
latency open.

## Results

All 18 workers completed. Across 7,668 strokes, final ordered positions,
normals and welded topology agreed with the exact reference at every
checkpoint. Undo, discarded staging, budget refusal and Redo passed.
The narrowed baseline and both alternatives used the same field and
dirty-key coverage.

| Branch policy | Offered edits/s | Peak queue | All / near-brush p95 age (slots) | Median release drain at 100 / 500 / 1,000 mm (slots) | Extra admission slices by 1,000 mm, median | Metre release CPU, median ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Narrow FIFO | 90 | 192 | 47 / 47 | 22 / 45 / 45 | 37 | 47.60 |
| Occupancy FIFO | 90 | 192 | 47 / 47 | 22 / 45 / 45 | 37 | 47.83 |
| Occupancy + deadline | 90 | 192 | 47 / 46 | 22 / 45 / 45 | 39 | 47.46 |
| Narrow FIFO | 45 | 92 | 19 / 17 | 14 / 14 / 16 | 0 | 16.82 |
| Occupancy FIFO | 45 | 92 | 19 / 17 | 14 / 14 / 16 | 0 | 17.10 |
| Occupancy + deadline | 45 | 92 | 19 / 17 | 13 / 14 / 16 | 0 | 17.09 |

Near-brush age is sampled within 12 mm of the current endpoint at service
time. In the branch, occupancy FIFO skipped 51 of 5,209 services at 90
edits/s and 51 of 7,128 at 45 edits/s, pooled across three workers.
On islands it skipped 162 of 1,131 at either rate. Screening left island
release slots unchanged relative to narrow FIFO. The four-tick threshold
selected the oldest item for more than 93% of branch services at both
cadences. It offered little brush-local improvement and left release drain
at 45 or 16 slots at the metre checkpoint.

At 45 edits/s, narrow FIFO peaked at 66 tube and 62 island keys and drained
the metre checkpoints in seven and 15 slots. No configuration needed extra
admission slices at that cadence. At 90 edits/s, tube and branch still
saturated the queue. No measured stroke-call CPU interval exceeded the
11.11 ms slot scale. The branch still needed 45 additional logical
service slots after release. The individual call metric leaves that
pending work out.

## Decision

**Keep narrow FIFO as the research baseline. Production 8.3c remains a
no-go.** The occupancy prepass duplicates sign scanning for most branch
jobs. The age policy is already predominantly FIFO under sustained load.
Test service capacity next by sweeping the four-key ceiling upward under
the same CPU cutoff and replaying the same cadence matrix. Compare any
additional throughput with slice overruns, admitted input, near-brush
age and release drain before changing scheduling policy.

Focused tests passed 55/55 and quick tests passed 21/21. Full check
passed format, lint, strict types and build. The suite passed
1,743/1,748, with five sandboxed loopback failures on `listen EPERM`
and zero skips.

## Reproduce

```sh
node scripts/benchmark-narrow-band-perf.mjs work/narrow-band-perf/paced-deadline paced
node scripts/research/paced-summary.mjs work/narrow-band-perf/paced-deadline
node scripts/research/narrow-band-perf-summary.mjs work/narrow-band-perf/paced-deadline
npm test -- chunk-occupancy changed-chunks dirty-chunk-queue narrow-band exact-pages dense-growth history-project
npm run test:quick
npm run check
```

The growth runner resumes completed workers via its bundle-checked
manifest. It bounds each worker at 120 seconds and 448 MiB V8 old space.
Raw per-stroke CPU, queue ages and checkpoint records are under the
output directory above.
