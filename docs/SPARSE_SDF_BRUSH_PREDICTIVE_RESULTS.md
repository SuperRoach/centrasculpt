# Phase 8.3b — Predict the next exact chunk cost

2026-11-12 (Australia/Melbourne). Follow-up to
[adaptive exact meshing](SPARSE_SDF_BRUSH_ADAPTIVE_RESULTS.md).

Quest 3 Browser panel, same 268 ordered edits on a 1 m branch at 1 mm
spacing. Fixed 4 ms and adaptive FIFO are controls. The predictive
variant uses the same adaptive 2–4 ms cutoff during the offered input
window and the same 6 ms cutoff after it. It estimates the next chunk
cost from the previous chunk geometry's vertex count using four
buckets: empty, 1–191, 192–575, and at least 576 vertices. The
moving estimate uses a 15% margin and 0.03 ms allowance. If the next
estimated chunk would cross the budget, it defers that chunk after at
least one has run. The first chunk always runs to preserve progress.
The predictor is disabled after the last offered edit.

Each policy has three runs at 45 and 90 offered edits/s in rotating
order. The 192 pending cap, eight-chunk per-callback cap, and draw
submission path are shared. Counts of predicted stops and first chunks
above the adaptive slice budget refer only to the active input window.
The 11.11 ms CPU threshold is a reference for frame work. Immersive
frame pacing and GPU completion remain unmeasured.

## Reproduce

```sh
node scripts/benchmark-paced-renderer.mjs work/paced-renderer/brush-predictive.html work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json --predictive
npm test -- brush-batch guarded-preview dirty-chunk-queue changed-chunks narrow-band
npm run check
```

The Quest runner, raw report and summary script are in
`work/paced-renderer/brush-predictive.HLhGUr/`.

## Results

All 18 trials matched exact field and ordered mesh checksums with
461,818 triangles. Values are medians of three trial metrics.

| Edits/s | Policy | Local draw p95 (ms) | Last offered edit to exact (ms) | Active CPU p95 (ms) | Active CPU above 11.11 ms | Full replay callback p95 (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 45 | Fixed 4 ms | 236 | 347 | 15.4 | 39.2% | 22.2 |
| 45 | Adaptive | 355 | 405 | 13.6 | 33.1% | 22.2 |
| 45 | Predictive | 918 | 822 | 11.9 | 9.6% | 11.2 |
| 90 | Fixed 4 ms | 1,407 | 1,621 | 14.1 | 29.4% | 22.2 |
| 90 | Adaptive | 1,153 | 1,268 | 12.5 | 21.6% | 22.2 |
| 90 | Predictive | 1,807 | 1,943 | 11.3 | 7.2% | 22.2 |

At 45 edits/s, prediction cut callback interval p95 in half, while
p95 local draw rose by 563 ms versus adaptive and admission blocked
on a median 110 callbacks. At 90 edits/s, it cut active CPU p95 by
1.2 ms and added 675 ms from last offered edit to exact. The
post-commit drain differed by only 7 ms at that rate, consistent
with the extra queue wait during the active input window. Prediction
stopped a median 413 and 214 slices early at 45 and 90 edits/s.
A median 10 and two first chunks respectively exceeded the active
slice budget by themselves.

**Stop tuning panel cutoffs as the next step.** Keep adaptive as
the catch-up candidate and prediction as an optional CPU-focused
comparison in a tracked run. The next gate is tracked immersive
stroke-to-visible latency and callback cadence. After a passing
tracked run, use an opt-in app trial to verify Undo, Redo,
cancellation, and retained/peak memory before any default change.
The wider sparse storage and save compatibility gates remain
separate.

Focused tests passed 13/13. The sandboxed full check passed
1,755/1,760. All 30 tests in the affected loopback files passed
with localhost binding enabled.
