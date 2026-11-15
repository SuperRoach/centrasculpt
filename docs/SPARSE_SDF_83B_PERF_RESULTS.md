# Phase 8.3b.1 — Sparse SDF performance and large sculpt space

2026-11-12 (Australia/Melbourne), local Centra Sculpt checkout at `e80b375`.
The starting tree had editor and VR work in progress. This investigation adds
offline research and documentation only.

## Scope and acceptance gates

The [8.3a report](SPARSE_SDF_83A_RESULTS.md) found exact brick parity with
dense samples, gradients and ordered meshes. Its varying master bricks all
needed payloads, and its string-key reader missed the warm lookup gate. The
[8.3b report](SPARSE_SDF_83B_RESULTS.md) demonstrated approximately linear
allocation for narrow tubes and branches and near-constant allocation for five
fixed-size islands. The 8.3b cache passed median lookup with a dense exact
fallback, missed the tight transformed-stamp and synthetic exact-local
lookup gates, and failed the master memory gate. The
[compact Quest 3 replay](SPARSE_SDF_COMPACT_SCULPT_RESULTS.md) found 198.9 ms
median sparse Smooth remeshing versus 45.8 ms dense in its synchronous fixture.

This follow-up targets dirty CPU meshing and exact sampling. It keeps 8³
Float32 pages, tests bands of 2, 3 and 4 samples, and compares direct numeric
keys with a two-level numeric directory of 4³ brick groups. Each dirty chunk
can gather its core samples and up to two neighboring samples per side into
one reused Float32 array. Gathering looks up one owner per contiguous X run.
The production marching tetrahedra, zero tolerance, coordinate calculation
and normal arithmetic run on that view. The halo is gathered again after
each relevant edit, Undo or Redo. Compact tests use a build-time hook in the
disposable bundle to supply that view to the production incremental mesher.
Large tests use the same extraction routine with 8-cell ownership and a
sparse dirty directory. Exact queries and brush arithmetic keep their original
source semantics. The mesher never uses a sign sentinel for Boolean operations.

The production thresholds remain 50% working savings versus dense values plus
scratch, 25% versus dense values, warm lookup median at most 2× dense and
no case above 3×, and transformed sampling at most 1.5× dense. Mesh and normal
parity, exact roundtrips, real transactions and on-device scheduling are
independent gates.

## Trial design

- **Compact.** Six fresh processes per backend. The 1 mm bust uses the same
  132 Clay/Smooth actions and one Undo/Redo pair, with four actions retained.
  Variants rotate run order. Seven checkpoints compare whole-field checksums
  and ordered position/normal checksums against production dense. Each
  edit drains the dirty CPU rebuild before continuing.
- **Large space.** Three fresh processes per configuration. Each grows a
  curved tube and a curved trunk with a lateral branch from empty, in both
  directions. Subtract and Jacobi Smooth modify previously occupied regions.
  Separate five-island sculpts hold island sizes fixed at nominal spans of
  100, 500 and 1,000 mm. At each checkpoint, the harness tests Undo, staged
  cancellation with Redo pending, zero-page refusal and byte-identical Redo.
  It checks every exact edit owner and its incident chunk neighbors against
  the exact lattice, including empty chunks, and checks welded topology.
  Position/normal parity therefore uses the same edited Float32 reference
  field. Earlier 8.3b trials provide independent dense-brush and analytic
  reference comparisons. Full dense allocations are avoided at large spans.
- **Masters.** Three fresh processes per grid size, 128³ and 192³, each
  using the eleven generated masters. Native files and their full values
  are checked against the original hashes. The 8.3a string-brick,
  8.3b numeric band with exact fallback, paged numeric band and dense use
  identical trilinear arithmetic and traces. The controlled string baseline
  accesses the original 8.3a brick directory by XYZ directly, removing its
  separate linear-index decode cost. Warm timings use the last three of
  five rotating passes per fixture. The 20 translated, Y-rotated and scaled
  poses exercise transformed source reads at three target bounds. This is
  read-only sampling and CSG arithmetic. Production Stamp and combined
  Move compatibility are covered by focused existing tests.
- **Lossless feasibility.** The master probe byte-shuffles 64 KiB Float32
  blocks, tries level-1 raw deflate, and uses original bytes when the
  encoded block expands. Encoded blocks are inflated and checked byte for
  byte. Reported compressed sizes are a packed-layout projection derived
  from measured codec output sizes. Random-access decode cache residency and
  edit latency remain open.

All timing percentiles are nearest rank, pooled across trials within each
reported operation. Undo/Redo have one observation per checkpoint per trial.
No benchmark or validation runs concurrently with the timing matrix. Runtime
snapshots and cumulative maxRSS include the Node process, fixture buffers,
verification objects and GC. Retained and working models charge typed
payloads and the explicit halo scratch plus directory, pending staged edit
pages, exact edit pages, retained Undo pages and CPU mesh buffers. Transient
mesh and metadata allowances are estimates. The master figures charge exact
masters plus scratch and both resampled volumes where applicable. GPU
buffers, general project sidecars and production worker transfers are
outside this offline accounting. Dense large-space values plus scratch
are calculated at eight bytes per sample from the padded tight box or
equal-axis capacity. Sparse mesh and history bytes are included in its
working model and excluded from the dense SDF-only projection.

## Compact bust results

Apple M5 Pro, Node v26.8.1. All six runs of each of the six backends
matched the dense field and ordered mesh checksums at all seven checkpoints.
The finished bust contains 109,432 triangles. Each brush mode has 372 or
210 observations per backend. Undo and Redo each have six.

| Backend | Constructive Clay p50 / p95 ms | Surface Clay p50 / p95 ms | Smooth p50 / p95 ms | Undo p50 / p95 ms | Redo p50 / p95 ms | Retained / max working model MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Dense | 19.92 / 29.75 | 11.45 / 12.74 | 11.46 / 12.75 | 9.95 / 10.23 | 9.94 / 10.07 | 24.07 / 28.13 |
| 8.3b direct reads, band 3 | 84.54 / 124.34 | 52.51 / 56.39 | 52.50 / 56.41 | 44.13 / 49.64 | 44.51 / 50.16 | 10.43 / 15.16 |
| Direct keys + halo, band 2 | 23.86 / 35.27 | 13.52 / 15.16 | 13.54 / 15.13 | 10.95 / 11.03 | 10.81 / 11.05 | 10.28 / 14.84 |
| Direct keys + halo, band 3 | 23.82 / 35.69 | 13.60 / 15.25 | 13.60 / 14.71 | 11.08 / 16.48 | 10.87 / 11.58 | 10.46 / 15.19 |
| Direct keys + halo, band 4 | 24.05 / 35.40 | 13.56 / 15.25 | 13.60 / 15.23 | 10.91 / 11.12 | 10.88 / 11.62 | 10.54 / 15.31 |
| Paged keys + halo, band 3 | 23.82 / 35.47 | 13.69 / 15.25 | 13.72 / 14.98 | 11.07 / 11.32 | 10.99 / 11.34 | 10.34 / 15.08 |

The 3-voxel direct-key halo cuts median Smooth rebuild from 51.28 to
12.60 ms, a 4.07× speedup, and median edit plus rebuild from 52.50 to
13.60 ms, a 3.86× speedup. It remains 19% slower than dense at the
median and 15% at p95 for Smooth. Median constructive staging is
3.31 ms versus 0.74 ms for dense brush work. The synchronous rebuild
gap also remains. Band width and directory choice move these results
much less than the halo. One reusable tile is 37,044 bytes. Whole-worker
maxRSS was 213.84 MiB for the 3-voxel direct-key halo, 215.45 MiB for
8.3b and 222.19 MiB for dense at the maximum observed trial. These
whole-worker maxima include fixture overhead and are distinct from
the retained model. The result leaves production frame budgets open.

## Progressive growth results at 1 mm spacing

The matched before/after table uses the direct numeric directory and 3-voxel
band, with and without the halo. The latency window starts after the previous
checkpoint. The five-island case starts empty at each span. The committed
stroke metric includes staging, publication and dirty CPU rebuild.

| Sculpt | Nominal span mm | Exact / band pages | 8.3b path p50 / p95 ms | Halo p50 / p95 ms | Halo retained / max working MiB | Dense tight SDF projection MiB | Exact-reference chunks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Tube | 100 | 225 / 220 | 29.69 / 41.54 | 11.16 / 19.64 | 4.19 / 5.27 | 2.54 | 396 |
| Tube | 500 | 1,124 / 978 | 30.44 / 38.22 | 11.12 / 13.65 | 18.26 / 19.41 | 11.89 | 1,899 |
| Tube | 1,000 | 2,154 / 1,898 | 29.19 / 35.60 | 11.13 / 13.14 | 34.78 / 35.73 | 22.98 | 3,620 |
| Branch | 100 | 409 / 328 | 27.43 / 44.26 | 10.06 / 14.57 | 5.48 / 6.49 | 12.63 | 703 |
| Branch | 500 | 1,912 / 1,510 | 26.88 / 33.97 | 9.76 / 12.12 | 23.82 / 24.77 | 520.43 | 3,215 |
| Branch | 1,000 | 3,909 / 3,074 | 26.96 / 34.73 | 9.92 / 12.93 | 48.00 / 48.84 | 4,022.81 | 6,576 |
| Islands | 100 | 200 / 248 | 21.47 / 28.66 | 9.09 / 13.57 | 3.59 / 3.80 | 10.63 | 406 |
| Islands | 500 | 204 / 258 | 22.14 / 27.12 | 9.20 / 14.50 | 3.59 / 3.77 | 549.30 | 440 |
| Islands | 1,000 | 192 / 251 | 21.36 / 27.10 | 8.52 / 13.46 | 3.54 / 3.73 | 3,853.39 | 420 |

The 1,000 mm branch measured 1,014.71 × 663.96 × 721.98 mm with its end caps.
The modeled 48.00 MiB retained includes 31.71 MiB of CPU mesh, 7.63 MiB of
exact pages, 6.00 MiB of band payload, 2.07 MiB of directory allowances,
0.57 MiB of history and an 8,788-byte reusable halo. The equal-axis dense
SDF-only projection is 8,409.90 MiB. A tight box is a useful dense
alternative for the tube, whose narrow Y and Z extents keep its projected
dense SDF below the full sparse working model. The 1,000 mm tube and
branch have 366,172 and 461,818 triangles respectively. The five islands
have 33,188 triangles at 1,000 mm.

At all three spans the tube and branch each form one closed component,
with Euler characteristic 2. The islands form five closed components,
with Euler characteristic 10. Welded boundary and nonmanifold counts are
zero. The tube and branch Undo restore overwritten exact pages; the island
Undo removes 46, 48 and 36 newly allocated pages at the respective spans.
Exact reference positions and normals match after Redo. The held-out
constructive patch and the budget refusal preserve the undone field and
geometry.

Paged keys save about 0.57 MiB in the metre branch working model, with
similar rebuild times. Maximum whole-worker RSS in the band-3 growth
trials was 326.78 MiB for baseline, 335.72 MiB for the direct-key halo
and 336.16 MiB for the paged halo. Verification and runtime account for
part of the difference from the working model. The narrower band uses
less payload, and all tested widths preserve this trace. A production
band width remains open.

The initial diagonal trace exceeded the existing 96-page stroke cap and
was superseded. The corrected branch uses shorter dabs under the same cap.
Compact results use the original, unaffected six-trial matrix.

## Exact masters and Boolean results

All 66 fixture trials completed. The paired table reports warm p50 / p95
elapsed-time ratios relative to dense on the same trace in the same worker.
The fresh processes each run a full grid-size sweep. The timings include
shared multi-backend dispatch and do not replicate the older standalone
two-backend invocation or its seed for 8.3a.

| Grid | Reader | Random | Local | Scan | Stamp 0.5× bounds | Stamp 1× bounds | Stamp 2× bounds |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 128³ | 8.3a string | 9.18 / 11.22 | 5.95 / 7.48 | 6.92 / 8.62 | 8.08 / 9.47 | 6.77 / 7.79 | 6.45 / 7.58 |
| 128³ | 8.3b numeric | 2.28 / 2.53 | 2.08 / 2.27 | 1.80 / 1.93 | 2.27 / 2.48 | 2.00 / 2.13 | 1.97 / 2.07 |
| 128³ | Paged numeric | 2.04 / 2.33 | 2.16 / 2.63 | 1.73 / 1.88 | 1.91 / 2.25 | 1.69 / 1.90 | 1.68 / 1.80 |
| 192³ | 8.3a string | 9.61 / 10.72 | 7.19 / 8.01 | 7.40 / 8.58 | 5.85 / 6.96 | 6.57 / 7.28 | 6.82 / 7.37 |
| 192³ | 8.3b numeric | 2.30 / 2.60 | 1.90 / 2.01 | 1.79 / 1.88 | 1.96 / 2.43 | 2.06 / 2.22 | 1.96 / 2.05 |
| 192³ | Paged numeric | 2.07 / 2.40 | 2.02 / 2.26 | 1.80 / 1.89 | 1.74 / 2.16 | 1.75 / 2.09 | 1.87 / 2.03 |

Paged keys improve random and most transformed measurements. Random lookup
still exceeds the 2× median gate in both sizes. Both numeric directories
stay below 3× on every warm lookup observation. The tightest paged 192³
trace has 29 of 33 fixture-trial medians over 1.5×. Every other paged
transformed workload has all 33 medians over 1.5×. The earlier analytic
synthetic exact-local lookup gate remains open. The halo accelerates
meshing and leaves arbitrary exact distance reads on their existing path.

All exact readers agree with dense on the lattice probes and timed
checksums. The two grids yield 87,551 union and 87,551 subtract probes
where substituting sign sentinels changes the operation result per complete
fixture sweep. These witnesses include cases outside the narrow band.
Every original disposable native master and Float32 field still matches its
original hash. Existing focused tests exercise native and gzip Personal Shape
roundtrips with a derived cache present.

| Grid | Exact dense + linear cache / dense values+scratch | Exact dense + paged cache / dense values+scratch | Packed codec bytes / dense values, p50 / worst | Projected packed exact + linear cache + codec scratch / dense values, p50 / worst |
| --- | ---: | ---: | ---: | ---: |
| 128³ | 4.461× | 4.402× | 0.550 / 0.667× | 0.721 / 0.866× |
| 192³ | 1.076× | 1.018× | 0.528 / 0.636× | 0.674 / 0.797× |

The 128³ co-resident model includes both source and target with scratch.
The codec projection instead models replacing the exact target with packed
blocks and an index. It includes one codec working allowance and excludes
decode cache, mutable staging and Undo, and the separate original
resampling source. All encoded blocks round-tripped byte for byte.
The result justifies a bounded decode-cache prototype. It establishes
encoded size on these fixtures. The complete exact-master working-memory
gate remains failed. Whole-worker maxRSS peaked at 584.17 MiB during the
128³/192³ reader comparison, including all concurrently instantiated
comparison backends and fixture data.

## Decision

**No-go for scoped production Phase 8.3c.** The halo is a viable offline CPU
optimization and the metre branch and islands support the case for allocating
with occupied geometry. Compact p95 still trails dense, exact-master working
memory fails, and repeated transformed reads miss their threshold. Normal
application scheduling, production transactions and native/recovery paths
for a mutable sparse backend, and current headset acceptance remain open.

**Go for isolated lossless exact-storage feasibility.** Build a bounded
random-access block reader with a measured decoded-page cache. Use the same
master matrix to measure cold/warm exact lookup, transformed CSG, mixed edits,
history and save/reopen peaks. Include full decoder, staging, mesh and
co-resident source costs. Use the direct-key halo as the meshing baseline.

## Verification and evidence

- **Matrix.** 63 completed workers across 36 compact, 21 growth and six
  master sweep trials. The corrected growth matrix logged 8,946 committed
  strokes and 189 checkpoints. Exact topology and page counts agree across
  its storage variants and repeated trials. The interrupted, superseded
  diagonal attempt is excluded from all growth timings.
- **Automated.** Focused **290/290**, quick **21/21** and Move worker
  **93/93**. Focused coverage includes dense growth, native/recovery,
  Personal Shapes/backup, Boolean/stamp behavior and combined Free Move
  reconstruction. Full `npm run check` passed format, lint, strict
  TypeScript and production build. The suite finished with **1,737/1,742**
  passing and no skips. Five bridge, preview and docs-hosting tests failed
  on sandboxed loopback `listen EPERM`. Targeted Biome and `git diff --check`
  passed.
- **Chrome.** The disposable local-file replay passed all seven compact
  checkpoints across dense, 8.3b direct reads and the 3-voxel halo in
  desktop Chrome 156. It reported 109,432 triangles and 2,718 gathered
  tiles. Playwright's headless Chromium launch hit a sandboxed Mach port
  permission error, so the fixture ran in the installed desktop browser.
  The fixture measures CPU parity. Current WebXR and physical frame timing
  remain outside this run.

Raw compact JSON and its summary are in
`work/narrow-band-perf/2026-11-11T15-24-04.775Z`. Growth/master JSON,
`summary.json` and the local Chrome fixture are in
`work/narrow-band-perf/branch-capped`. Matrix and verification logs are
`/tmp/centra-83b-perf-{matrix,growth,masters,chromium,focused,quick,worker,check}.log`.

## Reproduction and resume

Run from the repo root. The default run creates a timestamped directory
under ignored `work/narrow-band-perf`. To resume, pass the same directory
again. The manifest verifies the worker bundle hash and host, skips
completed jobs and retries failed/incomplete ones. An optional third argument
selects `compact`, `growth` or `masters`. The master suite reads the generated
Phase 8.0.2 fixture directory specified in the source. If it is missing,
generate fixtures with `node scripts/benchmark-personal-stamp-baseline.mjs`
and point the master harness at the generated directory. The outer runner
starts one worker at a time, caps V8 old space at 448 MiB and kills an
individual worker after 120 seconds, then proceeds to the next case.
There are also fixed page/extent admission limits and sampled RSS guards
for large-space strokes. The RSS guard samples once per stroke. Case files
and the manifest use atomic replacement.

```sh
node scripts/benchmark-narrow-band-perf.mjs work/narrow-band-perf/local
node scripts/research/narrow-band-perf-summary.mjs work/narrow-band-perf/local
node scripts/research/narrow-band-perf-browser.mjs work/narrow-band-perf/local/chromium.json
# Alternative if Playwright launch is restricted. Open the generated HTML in Chrome.
node scripts/research/narrow-band-perf-browser.mjs work/narrow-band-perf/local/chromium-fixture.html --html
npm test -- narrow-band brick-volume dense-growth history-project personal-shapes shape-backup personal-stamp shape-stamp recovery move-precision persistent-move rotation-move boolean-composite
npm run test:quick
npm run test:worker
npm run check
```
