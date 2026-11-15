# Phase 8.3b.12 — Progressive metre-branch Undo

2026-11-12 (Australia/Melbourne). Offline Mac follow-up to the
[resident-page lifecycle study](SPARSE_SDF_LIFECYCLE_RESULTS.md).

## Fixture

Three fresh workers each run three passes through four policies on the
same 268-edit, 1 mm metre branch. Undo prepares a replacement map of
existing immutable exact pages. After preparation the fixture publishes
the new field and mesh generation and moves the history entry in one
synchronous call. Geometry then rebuilds in FIFO slices of up to eight
chunks and a soft 2 ms cutoff. The feeder keeps at most 192 keys in the
active queue and retains a separate bounded plan of up to 16,000 keys.
The event loop gets a turn between slices.

The interrupted cases start Undo after three slices of a full erase.
All edits during the erase are excluded by this fixture. It compares
conservative dirty coverage, a saved list of previously occupied chunks,
and a plan containing only missing chunks. The last plan relies on the
fact that the surviving buffers still represent the exact state being
restored. A fourth case drains the erase completely and restores from
the saved surface-key list. The list stores keys. Full exact rebuild
parity is checked by SHA-256 over ordered positions and normals.

Before retry, the harness injects a staging error after 257 copied
references. It checks that the field, visible CPU mesh, history, active
queue and generation still match the state before the failed Undo.
After a successful field commit, an empty mesh result prepared against
the previous erase generation is rejected. The first extraction attempt
then fails before mesh publication. Its key stays pending for retry.
All variants drain to the original exact mesh and field. Progressive
Redo returns to empty.

The first-geometry metric ends when the first missing surface chunk
returns to the CPU mesh map. Timings separate page preparation, commit
and retry drain. The combined timing excludes deliberate failure and
correctness probes. Yielding uses the Node event loop. CPU duration
and logical slices leave renderer draw, visible latency and headset
frame pacing unmeasured. The memory estimate charges exact pages,
history, CPU mesh replacement, dirty plan and active queue allowances.
Whole-worker RSS includes fixtures and topology verification.

## Results

All 36 restores passed field and ordered mesh hash checks. The 27
interrupted cases each had 1,462 older removal keys pending. All staged
failures preserved the pre-Undo state, all old-generation mesh results
were refused, and all failed first extractions retried to parity.
The fully erased cases repeated the same failure probes with the old
removal queue already drained.

| Starting state and plan | Dirty keys | Active peak | Slices, median | Prepare / commit median (ms) | First CPU mesh after retry, median (ms) | Full host completion, p50 / p95 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Interrupted, conservative | 9,943 | 192 | 1,268 | 0.51 / 0.01 | 2.40 | 578.33 / 587.15 |
| Interrupted, known surface | 1,486 | 192 | 211 | 0.21 / <0.01 | 2.33 | 444.09 / 451.38 |
| Interrupted, reuse surviving meshes | 24 | 24 | 4 | 0.13 / <0.01 | 2.31 | 8.36 / 10.29 |
| Fully erased, known surface | 1,486 | 192 | 212 | 0.13 / <0.01 | 2.31 | 447.40 / 449.39 |

Fully erased restore ran at 2.43 ms p95 per slice. 1,446 of 1,902
slices crossed the soft 2 ms cutoff. The number of slices matters
independently of the 447 ms host completion. A one-slice-per-frame
policy would take many more frames than the Node event-loop drain.
The fixture has no frame or draw submission measurements.

Peak modeled working memory was 46.91 MiB on conservative restore,
44.84 MiB with known surfaces, 44.27 MiB with reuse, and 44.66 MiB
from fully erased. Whole-worker peak RSS reached 339.25 MiB.
The model allows old per-key mesh buffers to coexist with each
replacement and scratch. It excludes GPU allocation.

## Decision

**Go for an isolated renderer bulk-Undo comparison. Production 8.3c
remains gated.** The exact field can publish promptly, and the first CPU
mesh returns quickly. Reuse surviving meshes when the restored revision
is known to be identical. A fully erased branch still needs 1,486 exact
rebuilds and a paced renderer test for visible latency and responsive
input. This fixture uses one synchronous publication point and rejects
a synthetic delayed result. It leaves production threading, GPU resource
lifetime and failure inside the final publication call open.

Focused tests passed 56/56 and quick tests passed 21/21. Full check
passed format, lint, strict types and build, then 1,750/1,755 tests
passed. Five loopback tests hit sandbox `listen EPERM`.

## Reproduce

```sh
node scripts/benchmark-resident-lifecycle.mjs work/resident-lifecycle/bulk-final work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json --bulk
node scripts/research/bulk-undo-summary.mjs work/resident-lifecycle/bulk-final
npm test -- bulk-revision dirty-chunk-queue narrow-band dense-growth history-project
npm run test:quick
npm run check
```

Raw checkpointed runs and summary are in `work/resident-lifecycle/bulk-final`.
Each worker has a 180-second deadline and a 448 MiB V8 old-space cap.
