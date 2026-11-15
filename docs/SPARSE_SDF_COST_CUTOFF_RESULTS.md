# Phase 8.3b.7 — Cost-aware exact mesh slices

2026-11-12 (Australia/Melbourne). Offline follow-up to the
[eight-chunk service and preview study](SPARSE_SDF_PREVIEW_RESULTS.md).

## Design

Three fresh workers per configuration rotate the eight-chunk FIFO baseline,
one recent-cost estimate and a classified estimate at 45 and 90 modeled
edits/s. All policies use the same exact 1 mm pages, changed-sample dirty
coverage, 192-key queue and soft 2 ms budget. The tube, curved branch and
five separated islands reach nominal 100, 500 and 1,000 mm.

The baseline checks elapsed CPU after each chunk. The new policies also
check estimated fit before starting the next chunk. The recent-cost
policy uses an exponential moving average with 25% weight on the latest
rebuild and 0.03 ms of headroom. The classified policy separates absent
geometry and three buckets of prior triangle count, adds a 25% multiplier
and the same headroom. Unseen buckets use the global average. The first
chunk always runs to guarantee progress. An estimate can underpredict
and a single chunk can exceed the soft budget.

The replay uses the same closed-loop 90-slot/s model. Backpressure adds
service slots before edit publication. Release drains pending work before
Undo/Redo verification. Queue ages and release drain count logical
slots. CPU uses the host monotonic clock. No renderer or Quest timings
were gathered.

## Results

All 18 workers completed 7,668 strokes. Exact-reference ordered positions,
normals and welded topology matched at all 100, 500 and 1,000 mm
checkpoints. Undo, discarded staging, budget refusal and Redo passed.

| Branch policy | Offered edits/s | Peak pending | All / near-brush p95 age (slots) | Metre release slots, median / worst | Exact slice p95 (ms) | Slices over 2 ms | Slices over 2.5 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Eight-chunk baseline | 90 | 95 | 12 / 11 | 10 / 10 | 2.52 | 746 / 921 (81%) | 48 |
| Recent cost | 90 | 126 | 18 / 15 | 14 / 16 | 2.15 | 163 / 957 (17%) | 1 |
| Classified + margin | 90 | 140 | 22 / 22 | 20 / 21 | 2.06 | 82 / 995 (8%) | 4 |
| Eight-chunk baseline | 45 | 56 | 5 / 4 | 3 / 3 | 2.46 | 1,284 / 1,650 (78%) | 58 |
| Recent cost | 45 | 75 | 9 / 9 | 6 / 7 | 2.14 | 311 / 1,677 (19%) | 6 |
| Classified + margin | 45 | 76 | 11 / 12 | 7 / 8 | 2.06 | 147 / 1,691 (9%) | 5 |

Neither estimator required admission backpressure in any completed shape
and cadence. At 90 edits/s, median exact chunks per branch slice fell from
seven to six with recent cost and five with classification. Branch
stroke-call CPU p95 fell from 3.26 ms to 2.91 and 2.85 ms respectively.
These stroke calls can leave pending work.

The branch gains do not generalize to release drain across all shapes.
At 90 edits/s, the tube median release drain increased from eight slots
to 23 with recent cost and 27 with classification. Islands rose from
10 to 14 and 15. The recent-cost tube reduced the fraction of slices
over 2 ms from 89% to 16% and cut slice p95 from 2.60 to 2.14 ms, with
that release trade-off. Single expensive chunks can still overrun.
The focused clock-driven test verifies both the predicted stop and
first-chunk progress.

## Decision

**Keep eight-chunk FIFO as the throughput baseline and recent cost as a
comparison option. Production 8.3c remains gated.** Recent cost offers
a useful CPU trade-off for the metre branch. It carries a larger delay
on the tube. The classified variant adds delay in these traces for a
smaller reduction in slice p95.

The next comparison should run the two exact policies in a renderer
fixture with paced input and measure first visible brush-local update,
exact replacement and release drain. If visible lag warrants it,
add the local 2 mm preview with seam handling and a fine-detail fallback.
That comparison can resolve whether the lower CPU peaks or faster
exact updates matter more for interaction.

Focused tests passed 58/58 and quick tests passed 21/21. Full check
passed format, lint, strict types and build. The test suite passed
1,746/1,751, with five sandboxed loopback failures on `listen EPERM`
and zero skips.

## Reproduce

```sh
node scripts/benchmark-narrow-band-perf.mjs work/narrow-band-perf/cost-aware cost
node scripts/research/paced-summary.mjs work/narrow-band-perf/cost-aware
node scripts/research/narrow-band-perf-summary.mjs work/narrow-band-perf/cost-aware
npm test -- dirty-chunk-queue coarse-preview chunk-occupancy changed-chunks narrow-band exact-pages dense-growth history-project
npm run test:quick
npm run check
```

Raw reports and summaries are in the output directory above. The runner
uses a bundle-checked manifest and resumes completed workers. Each worker
has a 120-second deadline and 448 MiB V8 old-space cap.
