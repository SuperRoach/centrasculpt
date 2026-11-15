# Phase 8.3b.2 — Lossless exact-page feasibility

2026-11-12 (Australia/Melbourne). Offline follow-up to the
[dirty-halo performance experiment](SPARSE_SDF_83B_PERF_RESULTS.md).

The prototype stores a contiguous packed byte array and a typed block index.
Each block is byte-shuffled and raw-deflated at level 1. Blocks that expand
use their original bytes. The reader decodes into a bounded least-recently-used
cache, with four or sixteen slots and 16 or 64 KiB blocks. Blocks are
contiguous in the existing X-fast sample order. Local mutation stages copies
of whole blocks, publishes an overlay and retains a reversible page patch.
The edit and storage budgets apply only to this research harness.

Each worker reads eleven disposable native 192³ masters and verifies the
original file and Float32 SHA-256. Dense and packed readers evaluate the
same 256 random, 256 local and 640 transformed queries with clamped
trilinear interpolation and exact exterior extension. The transformed
trace uses all 20 translation, rotation and scale poses. Each probe is
checked individually, and the timed passes compare a checksum of min
and max CSG arithmetic. Per fixture, the first timed pass begins with an
empty decoded cache, followed by three passes that retain cache state.
Backend order alternates. These are CPU microbenchmarks with sub-millisecond
dense denominators. Absolute packed latency and miss counts provide context
for the ratios.

The transaction fixture stages a local 128-sample min patch, checks that
the published field is still original, applies the patch, checks Undo and
Redo, and streams the final exact samples to a disposable raw file. It
reopens and hashes the output using one block of read scratch. The stream
matches the dense edited field byte for byte. This exercises one offline
page patch and raw sample persistence. The original .form path supplies the
input. Native sparse serialization, concurrent publication, masks and
paint, remeshing and application timing are outside this trial.

Typed packed payload, index, live decoded blocks and edit blocks use
their actual byte lengths. The working estimate adds directory and codec
allowances, one previous patch of equal size, stream scratch and the
matched 3-voxel band-cache bytes from 8.3b.1. The band cache is an explicit
co-residency projection from prior measured payload and modeled metadata.
Process RSS covers the benchmark, including the resident original dense
master and scratch, decoding, and a dense edited verification copy after
save. Post-save samples are taken before creating that copy. They are
whole-worker observations, and a peak isolated to save is unverified.

## Results

All 12 workers completed, yielding 132 fixture trials. Each row has 33
fixture trials and 99 warm observations per trace. Apple M5 Pro, Node
v26.8.1. Times in the table are nearest-rank p50 / p95 milliseconds per
trace. Ratios compare paired elapsed times.

| Block / slots | Random | Local | Transformed | Transformed p50 ratio to dense | Transformed misses per pass | Modeled working / dense values, p50 / worst |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 16 KiB / 4 | 19.49 / 22.97 | 9.63 / 12.56 | 48.15 / 53.86 | 369× | 1,322 | 0.710 / 0.824× |
| 16 KiB / 16 | 19.39 / 23.06 | 0.10 / 0.15 | 47.44 / 54.08 | 374× | 1,314 | 0.717 / 0.831× |
| 64 KiB / 4 | 52.26 / 69.05 | 28.86 / 35.58 | 128.87 / 168.74 | 1,003× | 1,276 | 0.704 / 0.827× |
| 64 KiB / 16 | 51.41 / 65.90 | 0.10 / 0.97 | 124.42 / 162.01 | 1,008× | 1,225 | 0.732 / 0.856× |

The 16-slot cache can retain the local stencil working set. The transformed
trace still replaces most of its cache between nearby queries. For 16 KiB
and 16 slots, the cache-empty median was 47.88 ms and the warm median
47.44 ms. Larger blocks decode more bytes per miss. Each configuration
exceeds the 75%-of-values budget on two of the eleven masters, and the
co-resident original pushes median working estimates to 1.35–1.37× dense
values plus scratch. These are modeled working ratios. Whole-process
peak RSS reached 593.67 MiB.

All staged edit, Undo, Redo and streaming hashes agreed. With 16 KiB and
16 slots, median staging took 0.19 ms, raw stream save 77.16 ms and
stream reopen/hash 10.51 ms. These timings cover the single fixture patch
and raw samples. They leave native publication and durable save costs open.

**No-go for on-demand decompression in interactive exact sampling and for
production 8.3c.** Keep the measured halo improvement as the meshing
comparator. The next isolated test should focus on new sculpts grown from
empty, using resident exact 8³ edit pages and a sparse dirty directory.
It should compare complete transactions and bounded scheduled rebuilds
against dense at admitted sizes. Imported arbitrary masters still need the
existing exact path during that experiment.

Raw reports and summary are in
`work/exact-pages/2026-11-11T20-29-39.873Z`.

Focused tests passed 23/23 and quick tests passed 21/21.
Full `npm run check` passed format, lint, strict types and build.
The full suite passed 1,738/1,743, with five sandboxed loopback listeners
failing on `listen EPERM` and zero skips.

## Reproduce

```sh
node scripts/benchmark-exact-pages.mjs work/exact-pages/local
node scripts/research/exact-pages-summary.mjs work/exact-pages/local work/narrow-band-perf/branch-capped/masters-192-1.json
```

Use a new output directory for changed code, fixtures or host. Reusing a
directory skips completed workers. Each fixture checkpoints atomically.
The runner starts one worker at a time, with a 120-second worker deadline,
384 MiB V8 old-space limit, bounded fixture/page counts and a sampled
900 MiB RSS guard. The optional `CENTRA_EXACT_FIXTURES` environment variable
points to an alternate generated fixture set. Raw scratch files contain
only the latest generated fixture per worker.
