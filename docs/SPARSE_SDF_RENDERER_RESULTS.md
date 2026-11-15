# Phase 8.3b.8 — Paced renderer comparison

2026-11-12 (Australia/Melbourne). Desktop WebGL follow-up to the
[cost-aware CPU slice study](SPARSE_SDF_COST_CUTOFF_RESULTS.md).

## Fixture

The local fixture replays the 268-edit metre branch trace from 8.3b.7
with resident 8³ exact pages and 1 mm spacing. It uses changed-sample
dirty coverage and the same eight-chunk, soft 2 ms queue. The comparison
alternates exact FIFO and recent-cost FIFO. The output is displayed in
a fixed 900 × 600 WebGL canvas. All runs start from empty. Three paired
trials per cadence alternate backend order and reuse the renderer.
The fixture checks final field and ordered position/normal checksums
across all runs.

Each stroke has a monotonic due time at 45 or 90 edits/s. Each real
animation callback may publish up to three due edits and service one
queue slice. A full queue holds the prepared edit for retry and leaves
later edits waiting. This measures an offered cadence, so accepted
edits can lag. The latest available exact revision is submitted for
each chunk. A superseded intermediate revision can be coalesced.

The brush-local metric measures from due time until the first new
revision of a dirty chunk centered within 12 mm of the endpoint reaches
its Three.js draw callback. It counts a submitted revision at least as
new as the edit. Exact catch-up is the first render call at which all
dirty chunks for the edit have reached that revision or newer, including
removals. Release drain starts at the actual last commit and ends after
the last exact draw. The end of the render call supplies the timestamp.
These are draw-submission proxies. Occlusion, pixel presentation,
GPU completion and headset compositor timings are outside the
instrumentation.

## Results

Installed desktop Chrome 156 on the Apple M5 Pro completed all 12 runs.
Each run submitted a brush-local revision for all 268 edits and ended
with 461,818 triangles and matching field and ordered mesh checksums.
No run blocked on queue admission. Browser animation callbacks arrived
at 8.3 ms median and 9.0–9.3 ms p95. This cadence differs from the
90-slot/s model in the CPU replay.

Table values are the median of three trial metrics at each policy and
cadence. Overrun fractions pool all nonempty slices. Times are in ms.

| Offered edits/s | Policy | Input-to-commit p95 | Input-to-local draw p95 | Input-to-exact catch-up p95 | Release drain median | Slice p95 | Slices over 2 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 45 | FIFO | 9.13 | 12.33 | 33.06 | 19.40 | 2.20 | 376 / 2,060 (18.3%) |
| 45 | Recent cost | 9.10 | 12.47 | 35.30 | 19.30 | 2.10 | 106 / 2,082 (5.1%) |
| 90 | FIFO | 8.83 | 53.57 | 78.47 | 51.90 | 2.20 | 204 / 1,090 (18.7%) |
| 90 | Recent cost | 9.00 | 56.38 | 83.89 | 52.50 | 2.10 | 56 / 1,091 (5.1%) |

At 90 edits/s, recent cost reduced the overrun rate by about 14 percentage
points. Its median trial local p95 was 2.81 ms later and exact catch-up
p95 was 5.42 ms later. Median release drain differed by 0.60 ms. Per-trial
frame callback CPU p95 was 4.0–4.2 ms across the matrix. The draw call
itself had CPU p95 of 1.6–1.8 ms. The fixed camera and material omit the
application's other work. These CPU intervals do not measure GPU time.

## Decision

**Keep FIFO as the exact latency baseline. Production 8.3c remains gated.**
Recent cost still offers a lower exact-slice overrun rate with a small
catch-up penalty in this desktop fixture. Both policies took more than
50 ms at brush-local draw p95 under the 90 edits/s trace. That makes a
seam-safe, fine-detail-aware 2 mm preview worth testing against FIFO in
this same fixture. Measure when the preview reaches a draw and when the
exact mesh replaces it. A pixel or user study would be needed to establish
the perceived benefit.

Focused tests passed 56/56 and quick tests passed 21/21. Full check
passed format, lint, strict types and build, then 1,746/1,751 tests
passed. Five loopback tests failed on sandbox `listen EPERM`.

## Reproduce

```sh
node scripts/benchmark-paced-renderer.mjs
```

Open the generated `work/paced-renderer/fixture.html` in foreground
desktop Chrome. Select **Run paced comparison** and keep the tab visible.
Use **Download JSON** after PASS. The local evidence is
`work/paced-renderer/report.json`. The fixture uses a prior completed
8.3b.7 growth JSON as input. To regenerate it, run the cost suite from
the prior report and pass the completed baseline growth JSON as the
second positional argument after the HTML output path.
