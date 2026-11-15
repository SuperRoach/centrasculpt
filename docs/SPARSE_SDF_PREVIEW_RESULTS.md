# Phase 8.3b.6 — Service ceilings and coarse mesh preview

2026-11-12 (Australia/Melbourne). Offline follow-up to the
[paced queue replay](SPARSE_SDF_PACED_RESULTS.md).

## Design

Compare ceilings of 4, 8 and 16 exact chunks per slice, keeping the soft
2 ms CPU cutoff. A fourth policy adds a local coarse preview to the
16-chunk exact policy. Each configuration runs three fresh workers
at each of 45 and 90 offered edits/s, with 100, 500 and 1,000 mm tube,
branch and separated-island checkpoints. Dirty coverage, FIFO exact
service, edit admission and 1 mm exact sample pages are shared.

The preview point-samples every other exact lattice sample. It extracts
4³ coarse cells in each 8 mm chunk, alongside the 8³ exact-cell path.
After an edit commits, the replay can produce up to four preview chunks
nearest the stroke endpoint under a separate soft 1 ms budget. It
retains these buffers until the exact chunk becomes available. Exact
edits, history, reference checks and final mesh all use the original
1 mm field. A separate checkpoint audit extracts the entire surface at
2 mm to compare triangle count and coarse-only topology.

This is a CPU extraction and queue study. The buffer map stands in for
potential display. It leaves GPU upload, actual visible latency, LOD
seams and Quest performance for a renderer fixture. Cadences use the
same 90-slot/s model, with admission backpressure stretching input.
Both cutoffs are soft because a chunk is indivisible. Per-slice CPU
measures exact extraction. Per-stroke CPU includes extra preview work
where enabled.

## Results

All 24 workers completed. The 10,224-stroke matrix preserved exact
ordered positions, normals, topology and staged Undo/Redo at every
checkpoint. No preview survived the exact release drain. The table
uses peak pending keys and pooled p95 ages/slice CPU for the branch.
Release drain is the median at the 1,000 mm checkpoint.

| Policy | Offered edits/s | Peak queue | Exact p95 age (slots) | Release drain (slots) | Exact slice p95 (ms) | Exact slices over 2 ms | Stroke-call p95 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 4 exact | 90 | 192 | 47 | 45 | 1.93 | 56 / 1,318 | 3.51 |
| 8 exact | 90 | 95 | 12 | 10 | 2.49 | 743 / 921 | 3.32 |
| 16 exact | 90 | 91 | 11 | 9 | 2.51 | 895 / 920 | 3.28 |
| 16 exact + preview | 90 | 95 | 11 | 9 | 2.48 | 889 / 916 | 3.80 |
| 4 exact | 45 | 92 | 19 | 16 | 1.84 | 47 / 1,797 | 2.62 |
| 8 exact | 45 | 56 | 5 | 3 | 2.46 | 1,296 / 1,650 | 3.26 |
| 16 exact | 45 | 54 | 5 | 3 | 2.48 | 1,606 / 1,650 | 3.25 |
| 16 exact + preview | 45 | 46 | 4 | 3 | 2.47 | 1,609 / 1,652 | 3.81 |

The higher ceilings delivered most of the throughput improvement.
The 8- and 16-chunk branches both cleared admission stalls at 90
edits/s. Eight chunks captured most of the gain with fewer soft-cutoff
overruns. At 90 edits/s the tube's release fell from 45 slots to 7 with
eight chunks. Islands fell from 19 to 11 slots. The 2 ms cutoff checks
after each chunk. More slices cross it when the key cap stops ending
the slice early.

### What the coarse preview buys

The metre branch's coarse audit generated **115,060 triangles versus
461,818 exact**. The coarse-only tube, branch and islands kept their
component counts and closed topology at all three spans. At 90 edits/s,
branch preview extraction cost **0.58 ms p95 per stroke**. All 804 branch
edits in that configuration produced nonempty preview output and left
some preview buffers resident after that stroke's exact slice. Peak
coarse position/normal buffers were 292,320 bytes in the metre branch
run, plus 2,916 bytes of reusable halo scratch. These figures exclude
directory allowance, buffer replacement transients and renderer storage.

The 2 mm local mesh is available in the edit call while exact chunks may
remain pending. It adds CPU work and the branch exact queue still needs
nine slots to drain at 90 edits/s. Its measured value is a potential
earlier local update. A render test is needed to measure whether users
see and prefer that update. Dropping polygons after building the full
mesh would leave the CPU extraction queue in place.

Two focused cases expose fidelity limits. A thin slab between coarse
sample planes disappears at 2 mm while the 1 mm mesh contains it.
A sphere spanning a coarse/exact boundary produces open edges at the
mixed-resolution join. A real preview needs explicit transitions and
a fine-detail fallback, such as retaining exact geometry where the
coarse samples miss a crossing. Exact meshes remain the authority for
editing and final output.

## Decision

**Carry the eight-chunk ceiling into further offline research. Production
8.3c remains gated.** Next, test a cost-aware slice cutoff that limits
overruns without giving back the drain improvement. A renderer-only
preview trial is worth running if brush-local lag remains visible. It
should compare the fast exact path with a seam-safe coarse preview and
measure first visible update, exact replacement and lost thin features.

Focused tests passed 57/57 and quick tests passed 21/21. Full check
passed format, lint, strict types and build. The test suite passed
1,745/1,750, with five sandboxed loopback failures on `listen EPERM`
and zero skips.

## Reproduce

```sh
node scripts/benchmark-narrow-band-perf.mjs work/narrow-band-perf/service-preview preview
node scripts/research/paced-summary.mjs work/narrow-band-perf/service-preview
node scripts/research/narrow-band-perf-summary.mjs work/narrow-band-perf/service-preview
npm test -- coarse-preview chunk-occupancy changed-chunks dirty-chunk-queue narrow-band exact-pages dense-growth history-project
npm run test:quick
npm run check
```

The growth runner resumes completed workers with a bundle-checked
manifest. Worker limits are 120 seconds and 448 MiB V8 old space.
Raw per-stroke metrics and summaries are in the output directory above.
