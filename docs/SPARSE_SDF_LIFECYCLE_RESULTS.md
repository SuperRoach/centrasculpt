# Phase 8.3b.11 — Resident-page editing lifecycle

2026-11-12 (Australia/Melbourne). Mac follow-up to the
[resident exact-page and scheduler study](SPARSE_SDF_SCHEDULED_RESULTS.md)
while the [Quest fixture](SPARSE_SDF_QUEST_FIXTURE.md) awaits room tracking.

## Method

Three fresh serial workers each replay six grow, remove and regrow
cycles from an empty field. Each growth uses the established 268-edit
metre branch at 1 mm, including construction, local subtraction and
Jacobi Smooth. After growth the harness removes the positive tail,
checks regional Undo/Redo and staged cancellation, restores the branch,
then removes all pages. Full-removal Undo must restore the exact field
and mesh hashes, and Redo must return both to empty. Two pairs of small
construction and removal actions then displace the large reset from
the four-action history. The next cycle rebuilds from empty and must
match the original exact field and ordered mesh hashes.

Removal explicitly resets a set of whole pages to the implicit +12 mm
background, with a cap of 4,096 pages per reset. This is a research
operation. Ordinary subtraction preserves its exact results, including
positive far-field magnitudes. A brush page can be removed only when
every value is exactly the implicit background. A discarded staged edit
and two budget refusals are checked per cycle. Exact CPU remeshing is
synchronous here to isolate storage lifetime. Renderer allocation,
pending queue recovery and atomicity under mid-publication failure
remain separate tests.

Each grown checkpoint independently compares ordered position and
normal bytes with exact reference extraction and checks welded closure.
The first and final tail-removal checkpoints in each worker also
receive that audit. Checkpoints and measured process snapshots are
recorded immediately after an explicit GC request and again after two
event-loop yields and a second GC request. The table uses settled
snapshots.

Typed exact and mesh buffers use their byte lengths. Unique history-only
pages count once even when multiple patches share them. The retained
model adds the reusable halo and allowances for live directories,
patch references and dirty keys. The working model also charges staged
pages, directory growth and per-chunk mesh replacement scratch. Whole
process RSS includes benchmark verification and allocator reserve.
The page model and process RSS measure different scopes.

## Results

All three workers completed six cycles each. They recorded 4,860 brush
edits, 18 discarded staged edits, and 36 prepublication budget refusals.
Every regrown branch matched the same exact field and ordered mesh
hashes. All regional and full-removal Undo/Redo checks passed.

| Checkpoint | Live exact pages | History-only pages | CPU mesh MiB | Modeled retained MiB | Settled ArrayBuffers MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial empty | 0 | 0 | 0 | 0.01 | 0.15 |
| Metre branch grown | 3,909 | 67 | 31.71 | 40.86 | 39.62 |
| Positive tail removed | 2,935 | 1,029 | 23.86 | 33.75 | 31.75 |
| Entire branch removed, Undo available | 0 | 3,964 | 0 | 12.13 | 7.89 |
| Large Undo entry evicted | 0 | 54 | 0 | 0.24 | 0.25 |

Values are medians across checkpoint observations. The remaining 54
history pages belong to the small replacement actions. Settled
ArrayBuffers at every post-eviction checkpoint round to 0.25 MiB.
The immediate post-GC sample still showed 39.50 MiB at the median
at the same checkpoint. Event-loop settling matters when measuring
reclaimed typed arrays.

Peak modeled working footprint was 48.18 MiB. Observed whole-worker
maxRSS reached 317.91 MiB. At post-eviction checkpoints, RSS ranged
from 248.78 to 262.63 MiB and settled heap used was 5.89 MiB at the
median. RSS stayed well above the initial 61–62 MiB while the
tracked buffers returned to the same post-eviction level in every
cycle. This establishes bounded reuse over the tested six-cycle
windows. Longer sessions and renderer memory remain open.

Full reset and exact CPU remesh took 132.43/146.75 ms p50/p95.
Restoring the whole branch through Undo and rebuilding the CPU mesh
took 556.06/576.95 ms. These are synchronous offline operation
times. They expose a bulk Undo publication and mesh scheduling
problem that memory reclamation alone cannot solve.

## Decision

**Resident exact pages pass this bounded lifecycle replay. Production
8.3c remains gated.** The next offline test should exercise bulk
Undo with bounded dirty admission, staged publication and injected
failure while older mesh work is pending. Check that the visible
revision, exact field and history remain consistent, and measure
progressive rebuild after restoring the metre branch.

Focused tests passed 55/55 and quick tests passed 21/21. Full check
passed format, lint, strict types and build, then 1,748/1,753 tests
passed. Five loopback tests hit sandbox `listen EPERM`.

## Reproduce

```sh
node scripts/benchmark-resident-lifecycle.mjs work/resident-lifecycle/settled
node scripts/research/resident-lifecycle-summary.mjs work/resident-lifecycle/settled
npm test -- narrow-band exact-pages dense-growth history-project dirty-chunk-queue
npm run test:quick
npm run check
```

The runner checkpoints each worker and resumes with a bundle and trace
hash check. Each worker has a 180-second deadline and a 448 MiB V8
old-space cap. Raw reports are in the output directory above.
