# Phase 9.2 · Interactive sparse performance

2026-11-28 (Australia/Melbourne). Baseline `261627d` includes Boolean
optimisation `e94789c`. The sparse backend remains an opt-in for new empty
sculpts. Phase 9.1's dense admission reserve, brush limits, v24 and recovery
roundtrip, and existing operation support still apply.

The sparse status line and opt-in VR performance panel show active-layer page
count and lattice spacing, project tracked memory, project sparse queue depth
and oldest pending chunk age, and the last active-layer brush and mesh CPU
times. The desktop line refreshes at most five times per second. Tracked memory
uses sparse resident pages and scratch, includes published mesh buffers, Undo
mesh snapshots and estimated pending history, and still reserves dense storage
for dense layers. This is an accounting estimate. JS object overhead, transient
extraction allocations, Boolean display buffers and GPU memory require separate
measurement. The estimate is separate from the admission budget.

Sparse queues keep one entry per chunk and retain its original timestamp when
more samples invalidate it. Released work takes one bounded slice from the
layer with the oldest pending chunk, after the frame's brush/controller work.
Open strokes retain their existing live mesh budgets. The queue coalesces
identical cell/gradient coverage during exact history replay and invalidates
that cache after mesh publication. Halo gather walks page intersections with a
single page lookup per intersection and reuses the existing Float32 tile. The
cell and gradient sampling arithmetic is shared with the Phase 9.1 extractor.

A local gather-only probe compared exact 21³ tiles against Phase 9.1, with
seven alternating runs of 10,000 gathers per case. Median gather cost went
from 38.1 to 0.8 µs for an empty tile and from 27.7 to 13.2 µs with all
overlapping pages resident. This isolates page lookup and copying, so the
savings are smaller than the multi-millisecond cost of extracting populated
chunks. The probe and results are in `work/phase-9.2-halo-check.mjs` and
`work/phase-9.2-halo.log`.

## Desktop editor

Apple M5 Pro, headless Chrome, 1440 × 1000, about 60 Hz callback cadence.
The replay uses the full compact bust at 129³ and 1 mm spacing, and the
Phase 8.3 tube, branch and islands at the editor-admitted 192³ and 5.65 mm
spacing. It injects layer-local brush coordinates into the editor's animation
callback and uses real Clay transactions, release, Undo, Redo, mesh publication
and renderer submission. Each action drains before the next starts.
It bypasses physical pointer sampling and raycasts. Undo mesh caching is on.

| Fixture | Backend | Callback interval p95 / p99 (ms) | Edit CPU p95 / p99 (ms) | Queue drain p95 / p99 (ms) | Tracked finish (MiB) |
| --- | --- | ---: | ---: | ---: | ---: |
| Compact bust | Dense | 50.0 / 50.1 | 39.5 / 45.6 | 0 / 0 | 26.78 |
| Compact bust | Sparse | 16.7 / 16.8 | 9.6 / 17.4 | 166.7 / 183.4 | 11.54 |
| Metre tube | Dense | 16.7 / 16.8 | 3.5 / 4.2 | 0 / 0 | 55.11 |
| Metre tube | Sparse | 16.8 / 16.8 | 3.2 / 3.7 | 33.3 / 33.4 | 1.34 |
| Metre branch | Dense | 16.7 / 16.8 | 3.0 / 3.9 | 0 / 0 | 55.35 |
| Metre branch | Sparse | 16.8 / 16.8 | 3.5 / 3.9 | 16.7 / 33.2 | 1.86 |
| Metre islands | Dense | 16.7 / 16.7 | 6.8 / 6.8 | 0 / 0 | 54.11 |
| Metre islands | Sparse | 33.3 / 33.3 | 7.5 / 7.5 | 33.4 / 33.4 | 0.24 |

Queue drain is measured from the action's callback timestamp until a subsequent
callback observes an empty queue. Dense pays its synchronous remesh in edit
CPU. Intervals measure scheduling, and edit CPU excludes later slices and
renderer time. Islands had only seven dense and eight sparse intervals.

Compact sparse had one interval over 25 ms in 861, versus 67 in 134 for dense.
Phase 9.1 sparse had one in 863, with the same compact drain p95/p99 and a
9.6/18.3 ms edit CPU p95/p99. The desktop comparison does not show a
material compact release-latency improvement over 9.1. The timed compact
run sampled 21.96 MiB sparse versus 36.65 MiB dense with the Undo cache on,
using one-second memory samples. The four replay pairs matched final triangle
counts of 109,432, 10,816, 13,804 and 1,016.

## Physical Quest 3

Quest Browser over USB loopback, using an empty 64³ sparse project at 0.05079
model units per sample. The user drove the controller session. The capture
recorded 153 immersive samples across about 154 seconds, covering 12,264
callbacks between the first and last immersive samples.

| Observed metric | Result |
| --- | ---: |
| Highest sampled rolling frame interval p95 / p99 | 26.4 / 102.7 ms |
| Highest sampled rolling callback CPU p95 / p99 | 22.0 / 39.5 ms |
| Highest sampled last brush / mesh CPU | 1.6 / 16.9 ms |
| Deepest sampled queue / oldest pending age | 7 chunks / 142 ms |
| Highest sampled tracked memory / page count | 5.77 MiB / 97 |
| End of capture | 2.90 MiB tracked, zero queued chunks |

Frame and CPU summaries use rolling windows of 240 callbacks with snapshots
about once per second. High percentiles in the table are the maxima across
those snapshots. The session includes active editing and idle time. Queue
depth, queue age and memory can peak between samples. The headset run shows
long frames during the trial and individual mesh slices above the soft budget.
This session did not replay the fixtures on-headset or run a paired dense
control. It does not measure controller-to-photon time or compositor misses.

## Exactness and regression checks

The Node integration replay validated 88 checkpoints across both backends
and both run orders. Whole-field Float32 and ordered chunk position/normal
hashes matched Phase 9.1 at every checkpoint, including Undo and Redo.
The isolated repeat measured compact sparse slice p95/p99 at 5.32/6.37 ms,
versus 5.17/6.28 ms in the recorded 9.1 run. The gather-only improvement has
yet to show an end-to-end win in the compact extraction tails.
The focused suite passed all four sparse tests, covering cache replay,
cancellation, admission refusal, v24 reopen, recovery, and age-preserving
coalescing across a partial publication. Quick checks passed 21/21.
`npm run check` passed formatting, lint, strict TypeScript, the production
build and all 1,821 tests with localhost listeners available.

## Remaining gates

Keep dense as the default. Promotion still needs a paired physical dense/sparse
run at matched detail, stroke-to-visible and release tails, compositor misses,
isolated working-memory peaks with the live Undo cache, and the original
1 mm metre-scale gate. Sparse exact meshing can still exceed the frame budget
for one chunk, and compact desktop release latency remains about 167 ms p95.

## Reproduce

```sh
TRACE=work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json
node scripts/profile-sparse-editor.mjs "$TRACE" work/phase-9.2-editor-before.json 261627d
node scripts/profile-sparse-editor.mjs "$TRACE" work/phase-9.2-editor-after.json
node scripts/benchmark-sparse-integration.mjs "$TRACE" work/phase-9.2-sparse.json
npm test -- sparse-sdf
npm run check
```

The browser script uses Playwright Chromium or the browser specified by
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`. The existing Phase 8.3 trace lives under
ignored `work/`. The desktop report, exact replay and Quest JSON from this
run also live under `work/`.

For a manual Quest capture, enter the sparse editor on the headset using
[USB localhost](QUEST_WEBXR.md#reliable-quest-development-route-usb-localhost).
In the dedicated tab's remote console use
`centraPerformance.start("phase-9.2-quest-physical")` before entering,
then read `centraPerformance.snapshot()` when the session finishes and stop
the capture with `centraPerformance.stop()`.
