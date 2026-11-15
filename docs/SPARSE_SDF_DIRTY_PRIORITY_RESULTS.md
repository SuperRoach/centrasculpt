# Phase 8.3b.4 — Changed-sample invalidation and brush priority

2026-11-12 (Australia/Melbourne). Offline follow-up to the
[resident exact-page scheduler](SPARSE_SDF_SCHEDULED_RESULTS.md).

## Design

Nine fresh workers rotate conservative dirty bounds with FIFO, changed-sample
coverage with FIFO, and changed-sample coverage with brush priority. Each
runs the same tube, curved branch and five islands at 100, 500 and 1,000 mm
at 1 mm spacing. All three use resident exact 8³ pages and one reusable halo.

The narrowed path compares each staged Float32 page with its previous
contents, including implicit +12 mm samples. An incident chunk is dirty
when a core sample changes sign at the mesher's zero tolerance, or when a
changed sample intersects the crossing or normal stencil of a chunk with
existing geometry or a pending rebuild. Including pending chunks prevents
using a stale empty mesh to discard an update. Undo uses the same before
and after sample pairs. Publication still checks queue admission before
mutating the field.

Each configuration admits up to 192 keys, coalesces repeated invalidations,
and services up to four keys per slice with a soft 2 ms cutoff. The priority
variant alternates closest chunk center to the latest stroke endpoint and
oldest pending key. Each successful second service is FIFO. An existing key
can wait at most 384 successful chunk services at full capacity. The
bound counts services and excludes wall-clock time. Near-brush age below
uses chunks within 12 mm of the current endpoint **at service time**,
so the near-brush population can differ by policy. All ages start at
first enqueue and count logical slices.

## Results

All nine runs passed byte-for-byte exact position and normal comparisons
after queue drain and Undo/Redo, and the welded topology checks. Focused
fixtures cover a negative seam, normal-only invalidation, zero tolerance,
capacity refusal before publication and alternating FIFO service.

| Shape | Policy | Median keys per edit | Peak queue | All age p95 ticks | Near-brush age p95 ticks | Extra admission slices by 1,000 mm, median |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Tube | Conservative FIFO | 64 | 192 | 47 | 46 | 723 |
| Tube | Narrow FIFO | 20 | 192 | 45 | 47 | 3 |
| Tube | Narrow priority | 20 | 192 | 84 | 8 | 86 |
| Branch | Conservative FIFO | 64 | 192 | 47 | 47 | 1,878 |
| Branch | Narrow FIFO | 20 | 192 | 47 | 47 | 37 |
| Branch | Narrow priority | 20 | 192 | 86 | 16 | 263 |
| Islands | Conservative FIFO | 60 | 190 | 45 | 41 | 23 |
| Islands | Narrow FIFO | 18 | 78 | 17 | 18 | 0 |
| Islands | Narrow priority | 18 | 79 | 20 | 6 | 0 |

Branch p95 CPU work in the stroke call, including staging, admission and
the initial slice, was 10.88 ms with conservative FIFO, 3.49 ms with narrow
FIFO and 6.92 ms with narrow priority. These calls can leave pending work.
Per-slice branch p95 was 1.33, 1.92 and 2.05 ms respectively. The narrowed
queue spends more of each slice on chunks that contain geometry.
The branch Undo at 1,000 mm drained in 47, 45 and 48 ticks respectively,
including unrelated work already pending. Redo started after the queue
drained and took 12, 4 and 4 ticks. These are host CPU and logical replay
metrics. Renderer upload, visible latency and Quest performance remain
unmeasured.

## Compact dense control

Four paired replays of the established 129³ dense and resident exact-page
fixture matched all seven field/mesh checkpoints. Dense Smooth edit plus
full dirty drain was 13.01/18.68 ms p50/p95. Exact pages took
14.14/19.64 ms. This control uses the established per-action extraction
slices. The changed-coverage and priority comparison uses the burst
growth fixture above.

## Decision

**Carry narrow FIFO forward as the research baseline. Production 8.3c
remains a no-go.** Narrow coverage substantially reduces admission stalls,
while FIFO still reaches the cap for sustained connected geometry. The
alternating priority policy helps nearby chunks and raises whole-queue age
and admission stalls relative to narrow FIFO. A next isolated comparison
should test a deadline for old chunks, a faster occupancy filter for empty
chunks, and realistic arrival spacing with queue drain measured after release.

Focused tests passed 53/53 and quick tests passed 21/21. Full check
passed format, lint, strict types and build, then 1,741/1,746 tests
passed. Five sandboxed loopback tests failed with `listen EPERM`.
No tests were skipped.

## Reproduce

```sh
node scripts/benchmark-narrow-band-perf.mjs work/narrow-band-perf/changed-priority priority
node scripts/research/priority-summary.mjs work/narrow-band-perf/changed-priority
node scripts/research/narrow-band-perf-summary.mjs work/narrow-band-perf/changed-priority
node scripts/benchmark-scheduled-compact.mjs work/narrow-band-perf/changed-priority-compact
npm test -- changed-chunks dirty-chunk-queue narrow-band exact-pages dense-growth history-project
npm run test:quick
npm run check
```

The existing growth runner checkpoints each worker, resumes with a
bundle-checked manifest, and caps each worker at 120 seconds and 448 MiB
V8 old space. Raw reports are under the two output directories above.
