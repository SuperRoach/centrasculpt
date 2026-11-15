# Phase 8.3b.13 — Bulk Undo renderer comparison

2026-11-12 (Australia/Melbourne). Desktop WebGL follow-up to the
[progressive CPU Undo experiment](SPARSE_SDF_BULK_UNDO_RESULTS.md).

## Fixture

Nine runs rotate three policies on the same fully grown 1 mm metre branch.
The synchronous control erases the whole branch and restores all known
surface chunks in one callback. The progressive case restores the same
keys with one slice per animation callback, up to eight chunks and a soft
2 ms cutoff. The interrupted case begins Undo after three erase slices
and reuses the still-valid meshes. All policies restore the same exact
page field. The renderer records the first and last restored mesh reaching
a draw callback. Final geometry has 461,818 triangles and all field and
ordered position/normal checksums match.

A local timer offers synthetic camera updates at 60 Hz. An event handler
records dispatch time and the next animation callback draws the newest
camera pose. Coalesced requests share the timestamp of that draw.
Scheduled-to-draw latency includes time waiting for a blocked main
thread to dispatch the timer. Dispatch-to-draw starts when the handler
runs. These metrics measure the synthetic fixture path and draw
submission. They leave physical input, pixels presented, GPU timing
and headset responsiveness open.

The Mac desktop was locked, so this run used headless Chromium 158 at
900 × 600. The progressive runs had roughly 33 ms median callback
spacing. This cadence is specific to the headless run.

## Results

The table reports the median of three per-run metrics.

| Policy | Restored chunks | Rebuild frames | First draw (ms) | Full draw (ms) | Camera scheduled-to-draw p95 (ms) | Camera dispatch-to-draw p95 (ms) | Frame CPU p95 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Synchronous full | 1,486 | 1 | 288.10 | 288.10 | 364.43 | 1.10 | 288.10 |
| Progressive full | 1,486 | 190 | 2.30 | 5,197.90 | 73.03 | 11.20 | 2.80 |
| Interrupted, reuse surviving meshes | 24 | 3 | 3.40 | 99.20 | 82.53 | 3.20 | 3.40 |

Field publication took 0.2–0.3 ms across the fixture. The progressive
full run reached draw almost immediately and lowered scheduled camera
delay substantially, while spreading completion over about 190
callbacks. Full draw ranged from 5,181 to 5,238 ms. Interrupted Undo
reused 1,462 exact meshes and drew all 24 replacements in 99–147 ms.
There are only five to eight camera requests per interrupted run.
The synchronous path's small dispatch-to-draw delay omits the period
when the main thread blocked delivery. The scheduled metric includes it.

## Decision

**Keep progressive publication and survivor reuse as research paths.
Production 8.3c remains gated.** One slice per callback makes complete
restore strongly cadence-dependent. The next comparison should test
a byte-capped cache of the latest bulk Undo mesh against the progressive
fallback. The previous CPU audit counted about 32 MiB of position and
normal buffers for the branch. Measure the retained cost and restoration
draws before considering worker extraction.

Focused tests passed 56/56 and quick tests passed 21/21. Full check
passed format, lint, strict types and build, then 1,750/1,755 tests
passed. Five loopback tests hit sandbox `listen EPERM`.

## Reproduce

```sh
node scripts/benchmark-bulk-undo-renderer.mjs
```

Open `work/paced-renderer/bulk-undo.html` in a foreground browser or
load it in a local Playwright Chromium session with WebGL enabled.
Select **Run bulk Undo comparison** and download JSON after PASS.
The measured report is `work/paced-renderer/bulk-undo-report.json`.
The generator optionally takes an output HTML path and a completed
branch fixture JSON path. The default trace comes from the cost-cutoff
matrix.
