# Phase 8.3b — Narrow-band sparse SDF and large sculpt space

2026-11-12 · Original offline research from `da895ee` and empty-field
growth follow-up at `71d6419` in `/Users/brettjames/development/vrappPOC`.

**No-go for Phase 8.3c integration.** A capped analytic field with local Float32
edits demonstrates that long thin sculpts and isolated objects can occupy a
metre-scale lattice at 1 mm spacing with allocation proportional to occupied
geometry. For existing arbitrary Float32 masters, retaining exact values beside
the derived band cache fails both working-memory savings gates. Production
transactional editing and headset frame budgets remain unproven.

## 1. Storage, bounds and exactness

- Each brick owns 8³ global lattice samples. Floor division supports negative
  coordinates and stable ownership as the occupied region grows. A bounded
  base-512 numeric key addresses the brick directory. The standalone harness
  caps coordinates, brick entries, analytic primitives and edit extent/pages.
- The 2-, 3- and 4-voxel bands use a Float32 payload when the padded brick
  min/max interval intersects the band. Testing the interval preserves abrupt
  sign changes in non-distance fields even when neither side is close to zero.
  Padding covers two samples beyond each face for crossing-cell interpolation
  and central-difference normals. Canonical neighboring brick reads provide
  halos. Halo-only bricks consume real payload bytes, with zero duplicate
  halo arrays.
- Classified far bricks carry positive or negative sentinels. The synthetic
  field can omit proven exterior entries. Sentinel magnitudes are approximate.
  Meshing and the tested near-surface queries use the signed cache. Exact
  queries fall through to the unchanged Float32 master or the analytic field
  plus its Float32 edit pages. Deep-inside subtraction and far-outside union
  tests show that using sentinel magnitudes for Boolean operations changes
  results.
- The synthetic exact source is the minimum of capsule distances, capped at
  +12 mm by definition and rounded to Float32 at lattice samples. Capsule
  support bins contain every primitive that could change a sample from that
  cap. Sparse full-value edit pages override the analytic base. The model
  stores the shape recipe and edits in memory. Existing arbitrary .form
  masters require their original samples, and this experiment does not derive
  a lossless recipe or lazy store for them.

## 2. Existing masters and Phase 8.3a gates

The eleven existing disposable masters were read by the production .form
reader. All original file and sample SHA-256 hashes were checked against
Phase 8.0.2 baseline data, including a recheck after the benchmark. Each master
was tested at native 192³ and resampled 128³, with three band widths. A grown
rectangular, negative-origin bored shell adds three cases. Sizes use the
original 50 mm/model-unit calibration.

The three lookup traces use scalar trilinear sampling over random volume,
local and scan-tile points. Dense and sparse use identical arithmetic and
clamped bounds. The stamp workload applies the 20 existing translation,
Y-rotation and uniform-scale poses, 4,096 probes each, at target/source
bound ratios 0.5, 1 and 2. It measures exact transformed field evaluation
and a min operation, including source exterior extension. Pose transforms
are precomputed equally for both sides. It excludes production stamp
preparation, target mutation and preview/history work. Each trace has five
paired timings with alternating order. Warm statistics use the last three
observations of each case. Fresh-process timing and device CPU profiling
remain unproven.

The working model counts exact master arrays including production scratch
plus cache payload and directory allowance. The 128³ conversion retains the
192³ source in the harness. A values-only scenario drops that extra source
and scratch, so it is an optimistic lower bound. A separate conversion
model includes padded min/max summaries, enumeration keys and native input
and decode buffer allowance. Neither calculation is an RSS measurement.
Stamp source copies, previews, sidecars and full production edit history
would add further working memory.

### Results for 69 master/grown cases

Median working footprint ratios across the eleven masters at each resolution
and band width. Smaller is better. The first two columns must reach ≤0.50
and ≤0.75 respectively. Every case exceeds both thresholds.

| Grid | Band | Working / dense values+scratch | Working / dense values | Optimistic working / dense values |
| --- | ---: | ---: | ---: | ---: |
| 128³ | 2 | 4.458× | 8.917× | 1.167× |
| 128³ | 3 | 4.461× | 8.922× | 1.172× |
| 128³ | 4 | 4.461× | 8.922× | 1.172× |
| 192³ | 2 | 1.075× | 2.151× | 1.151× |
| 192³ | 3 | 1.076× | 2.153× | 1.153× |
| 192³ | 4 | 1.078× | 2.157× | 1.157× |

The 128³ working figures charge the co-resident 192³ source during resampling.
The lower bound still fails after removing it and both scratch arrays. At
192³ the 2/3/4-band medians include 80/40/188 halo-only payload pages
respectively. Modeled conversion high-water, including encoded input/decode
allowances, was 125.88–126.50 MiB at 128³ and 114.10–115.78 MiB at 192³.

| Exact path | Warm median | Worst warm observation | Gate |
| --- | ---: | ---: | --- |
| Random lookup | 1.649× | 2.312× | Pass for dense-master fallback |
| Local lookup | 1.619× | 2.246× | Pass for dense-master fallback |
| Scan lookup | 1.345× | 1.794× | Pass for dense-master fallback |
| Stamp evaluation, bounds 0.5× | 1.508× | 2.039× | Fail |
| Stamp evaluation, bounds 1× | 1.464× | 1.715× | Pooled median passes, 24/66 case medians fail |
| Stamp evaluation, bounds 2× | 1.454× | 1.820× | Pooled median passes, 19/66 case medians fail |

Lookup and stamp statistics pool the 66 fixed-master cases. At 0.5× bounds,
33/66 stamp case medians exceed 1.5×. The grown row results are in the JSON.
The standalone dense comparator uses the same scalar arithmetic as the sparse
path. These timings exclude native decoding and GPU work.

Phase 8.3a's 8³ string-key Map recorded 4.15×/4.46×/4.54× median warm
random/local/scan ratios and 7.54× worst. Phase 8.3b's numeric-key cache
with a dense exact fallback records 1.65×/1.62×/1.35× and 2.31×
respectively on its native matrix. The workloads and storage paths differ.
A controlled key-only speedup remains unmeasured, and the 8.3a fresh-process
timing gate remains open for 8.3b. [Phase 8.3a timings](SPARSE_SDF_83A_RESULTS.md)

Across all 69 cases, exact sampler values agreed on all 4,096 random probes
per case. Signed-cache crossing signs agreed. The 1,755 sampled near-surface
points had maximum interpolation difference **1.50e-16 model units**,
including coordinate conversion to the production sampler, and **zero**
normal-component difference. Far-field sentinel magnitudes differed by more
than 1e-6 at 269,560 probes. Exact fallback is required for full-field CSG.

All **33** mesh comparisons (five master fixtures at both resolutions and
the negative-grown bored shell, each at all bands) had identical ordered
Float32 positions and normals and zero welded boundary or nonmanifold
edges. Position deviation is **0 voxels** for these comparisons. The
40 × 30 × 20 mm hollow part and the 1 and 8 mm slotted parts retain a
single closed component with Euler characteristic 0. The 1 mm diagonal
bar has identical dense/cache meshes at 128³, but both miss the analytic
inside sign at the centre probe. Its sampled thickness is 0.976 mm at
128³ and 1.000 mm at 192³. Sparse storage preserves the dense discretization,
including its errors. Feature probes for the other fixtures and the full
mesh bounds are in the raw JSON.

## 3. Large sculpt space at 1 mm per voxel

The three deterministic scenarios have a nominal X span of 100, 500 or
1,000 mm before their end caps. The curved tube is a sinusoidal polyline
with 10 mm X segments. The diagonal adds a connected branch. Five separated
capsules keep their sizes fixed as their separation increases. Each append
records allocation progress at the first, every tenth and final primitive.
Tight rectangular dense projections use the same logical bounds with
exterior padding. Equal-axis dense projections show the cost of a workspace
with the same room in all three directions. Both charge four bytes/sample
for values and four for scratch. Large dense arrays were not allocated.
A 33³ dense verification tile around the stroke provides a separate local
interpolation baseline in every synthetic case.

All 27 cases completed. Bricks are resident Float32 payload pages. Memory is
in MiB. The conversion and stroke estimates use the 3-voxel band as the
middle sensitivity point. The stroke estimate includes retained CPU meshes
and the working buffers itemized below. Dense columns project values+scratch
only. Values alone are half those projections.

| Scenario | Nominal span (mm) | Bricks at 2 / 3 / 4 voxels | Conversion | Stroke working | Dense tight box | Dense equal axes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tube | 100 | 169 / 196 / 229 | 0.67 | 4.38 | 2.43 | 17.95 |
| Tube | 500 | 782 / 900 / 997 | 3.00 | 15.78 | 11.82 | 1,155.24 |
| Tube | 1,000 | 1,520 / 1,756 / 1,936 | 5.83 | 29.38 | 22.91 | 8,409.90 |
| Branch | 100 | 257 / 298 / 339 | 1.06 | 5.08 | 11.12 | 17.95 |
| Branch | 500 | 1,209 / 1,383 / 1,566 | 4.96 | 19.11 | 621.56 | 1,155.24 |
| Branch | 1,000 | 2,401 / 2,741 / 3,095 | 9.86 | 36.74 | 4,418.25 | 8,409.90 |
| Clusters | 100 | 192 / 238 / 267 | 0.80 | 3.63 | 11.79 | 17.95 |
| Clusters | 500 | 190 / 230 / 270 | 0.83 | 3.66 | 638.03 | 1,155.24 |
| Clusters | 1,000 | 198 / 235 / 278 | 0.84 | 3.74 | 4,518.63 | 8,409.90 |

From 100 to 1,000 mm, tube and branch payload counts grow by 8.45–9.34×.
The 3-voxel 1,000 mm traces progress from 51 to 1,756 tube pages, 64 to
2,741 branch pages, and 48 to 235 cluster pages. Their exact source bin
directories end at 7,061, 14,286 and 1,260 entries respectively. This
supports approximately linear allocation for these fixed-width connected
shapes and approximately constant allocation for fixed-size islands.
The tube also fits a narrow dense rectangular box, which scales linearly.
Its 1,000 mm CPU mesh alone uses 21.95 MiB. The diagonal and separated
objects show the clearest advantage over a dense tight bounding box.
The equal-axis 1,000 mm dense projection is 8.21 GiB with scratch.

All 27 synthetic reference comparisons had identical chunk position and
normal buffers. All baseline meshes were closed with zero welded boundary
or nonmanifold edges. Tube and branch each had one component and Euler
characteristic 2. Clusters had five components and Euler characteristic 10.
Measured X extents at nominal 1,000 mm were 1,010.49, 1,010.50 and
1,018.50 mm respectively, within 0.07 mm of analytic extents in the
full matrix. Maximum sampled analytic field residual at mesh vertices was
0.318 mm, reflecting 1 mm lattice discretization.

The exact cache path for local trilinear lookup in the synthetic dense
verification tile was **5.109× median, 7.288× worst**. This fails the lookup
gate. Exact misses must evaluate the analytic source, which costs more
than a dense array read. This is a separate measurement from the
dense-master fallback timings above.

The full baseline mesh uses production marching tetrahedra in disjoint
8-cell chunks, with global sample and normal stencils. Exact reference
rebuilds enumerate all analytic support chunks, including those omitted by
the cache. The 100 mm cases also evaluate every primitive for every reference
mesh query. The larger cases use the indexed exact field and independently
check indexed samples against exhaustive capsule evaluation. Welded edge
counts and Euler characteristic check seams, components and closure. Sampled
mesh vertex residual against the analytic field measures discretization in
millimetres. Position and normal buffer equality measures cache deviation
from the exact lattice reference.

### Follow-up — grow a continuous sculpt from empty space

The original matrix built the starting geometry with analytic capsules and
reset each timed stroke. This follow-up starts with zero bricks and zero
analytic primitives. For each band it alternates 100 local 10 mm constructive
sweeps between the positive and negative ends of one curved tube, with a
production-style Subtract dab every fifth sweep. It retains every committed
Float32 edit page and the last four edit patches. The constructive sweep
performs a local min with a radius-6 mm capsule and a 2 mm support margin.
It is an offline construction brush with explicitly local field semantics.
Its timings cover staging, publication and dirty CPU mesh rebuild.
Verification, memory accounting, Undo and Redo are timed or recorded separately.

| Nominal span (mm) | Exact edit pages | Cache pages at 2 / 3 / 4 voxels | 3-voxel resident / stroke high-water (MiB) | Dense tight / equal axes, values+scratch (MiB) | 3-voxel stroke p50 / p95 / max (ms) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 252 | 190 / 224 / 245 | 4.34 / 5.33 | 2.49 / 17.95 | 26.69 / 32.44 / 32.44 |
| 500 | 1,143 | 871 / 974 / 1,079 | 18.39 / 19.46 | 11.82 / 1,155.24 | 29.20 / 35.91 / 44.79 |
| 1,000 | 2,208 | 1,708 / 1,889 / 2,080 | 34.98 / 35.79 | 22.91 / 8,409.90 | 27.84 / 32.53 / 37.86 |

Each timing row summarizes the strokes since the previous checkpoint. Across
all bands and spans, 360 committed actions visited up to 100 dirty chunks and
actually changed geometry or normals in 6–24 chunks per action. The 3-voxel
constructive p50/p95 were 29.00/34.83 ms, and Subtract p50/p95 were 18.78/23.73 ms.
The worst combined time across all bands was 46.83 ms. At each checkpoint,
Undo removed 21, 37 and 12 newly allocated exact pages respectively. A staged
constructive edit was discarded and a zero-page budget refusal was verified
while Redo was pending. Redo restored the tip and identical mesh buffers.

Every dirty rebuild agreed byte-for-byte with the exact edited Float32 field.
The final audit checked 3,683 chunks per band, enumerated from exact edit
owners, neighboring cell owners and retained meshes. Each checkpoint had
one closed component, zero boundary or nonmanifold edges, and Euler
characteristic 2. The nominal metre tube measured 1,011.99 mm along X including
end caps. The stencil and geometry tests compare to the same edited lattice.
The original matrix provides the independent analytic and dense fixture checks.

At 1,000 mm the 3-voxel model includes 4.31 MiB of exact edit pages, 3.69 MiB
of cache payloads, 25.07 MiB of retained CPU mesh and 0.69 MiB of four-patch
history including its metadata. Directory allowances make up the rest.
The stroke high-water model includes co-resident old/new pages and meshes,
staging entries and an allowance for one chunk's temporary mesh buffers.
Shared Float32 pages are counted once in resident history. The prototype
limits the exact edit directory to 16,000 pages in addition to the existing
cache, work extent and per-edit limits. The dense tight-box estimate uses
the measured mesh bounds rounded up with 20 mm padding and one endpoint
sample per axis. The sparse working model exceeds that tube-specific dense
values+scratch baseline. The equal-axis comparison illustrates the cost of
leaving the same room in all directions.

Separate process measurements at the 1,000 mm checkpoint for the 3-voxel
run were 304.48 MiB RSS, 16.47 MiB heap used and 72.87 MiB ArrayBuffers after
an explicit GC request. Whole-process maxRSS was 377.41 MiB, and ranged
375.56–377.67 MiB across the three processes. Those measurements include
benchmark verification and the runtime. No dense master, masks, paint, GPU
buffers or production project history were present. These host timings
establish locality for the tested sequence, with XR responsiveness and
worst-case overlap still open.

## 4. Local editing, memory and production gaps

Each synthetic row stages a 10 mm swept dab of radius 6 mm for Add, Subtract
and Jacobi Smooth. One staged action per mode is discarded and preflight
budget refusal is checked. Three further actions per mode are published,
locally remeshed, undone and redone, then reset. Dirty coverage includes
two lattice samples beyond the work bounds for cross-chunk gradients. The
harness compares rebuilt dirty chunks with exact reference buffers and checks
closure and topology across the combined mesh. Focused tests additionally
compare all samples against the production dense brush for two successive
edits per mode and verify constructive allocation, deletion on Undo and
reallocation on Redo.

The matrix recorded **243 commits, 243 Undo/Redo pairs and 81 cancellations**
with corresponding budget refusals. Each action visited 36 dirty chunks,
including 16–23 with rebuilt surface geometry. It retained 16 exact edit
pages (32 KiB) and staged 62–72 KiB of cache pages, with an equal range of
old cache payload kept for Undo.

| Host operation | Median (ms) | Max (ms) |
| --- | ---: | ---: |
| Stage local brush and cache updates | 7.394 | 12.346 |
| Publish | 0.007 | 0.054 |
| Rebuild dirty meshes | 22.313 | 34.743 |
| Undo publish + separate mesh rebuild, measured separately | 0.008 / 22.508 | 0.030 / 36.675 |
| Redo publish + separate mesh rebuild, measured separately | 0.006 / 22.309 | 0.028 / 31.487 |

Median stage+publish+rebuild was 29.92, 30.15 and 30.38 ms at 100, 500
and 1,000 mm. The worst observed combined time was 46.96 ms. Work
stayed local over this 10× span increase. The synchronous mesh work alone
can exceed a headset frame budget. This evidence does not establish
bounded latency under dense local overlaps or sustained production input.
Progressive synthetic conversion took 16.1–2,468.3 ms and baseline sparse
mesh extraction took 93.2–1,440.3 ms across all cases.

Whole-process maxRSS was **717.33 MiB**. The largest recorded snapshots
were 678.08 MiB RSS, 289.61 MiB heap used and 141.42 MiB ArrayBuffers.
The latter figures are maxima across discrete observations, with different
scopes from the modeled resident and working footprints.

The resident accounting includes cache payloads, signed directory entries,
capsules and support-bin links, retained CPU mesh buffers, staged Float32
pages and one action's exact and cache history. Old cache pages are shared
with the baseline while staging and retained for Undo after commit. The
reported high-water estimate includes both dirty mesh outputs used in the
comparison, one chunk's temporary JS output allowance and directory/staging
allowances. The 33³ dense tile and topology-verification objects are
benchmark instrumentation and separately scoped. Typed payloads use
`byteLength`. JS directory entries use a 256 B/entry allowance, bin links
8 B/link, and capsule metadata 256 B/primitive. These are models, with no
claim that V8 object overhead or allocator peaks obey them. RSS, heap,
external and ArrayBuffer snapshots and cumulative process maxRSS are
recorded separately. They include native decoding, reference meshes, GC
garbage and runtime. No GPU buffers are measured.

**Production transaction gate is open.** The prototype publishes sequential
Map updates synchronously after staging. It verifies cancellation before
publication and budget refusal. In-flight cancellation, allocation failure
during publication, concurrent work, packed/history-budget eviction, real
continuous stamps, and cross-tool transactions are unproven. The large field
does not implement VolumeStore, dense-growth rebind, arbitrary imported
source edits, production shape-stamp semantics, masks/paint, Move, worker
transfer, export, native save or recovery. Synthetic timings include local
CPU work and dirty mesh generation, with no renderer upload or XR frame
scheduling. Existing .form, Personal Shapes and backup tests exercise
the unchanged exact route, including a disposable gzip backup roundtrip
with a derived cache present. The large prototype has no persistence route.

## 5. Quest 3 acceptance before any future integration

- Establish an exact editable representation for arbitrary native sources
  and verify retained and peak savings against both dense baselines, including
  exact data, old/new arrays, mesh caches, sidecars, history, worker messages,
  source snapshots, previews and GPU allocations. Exercise safe refusal
  at existing budgets.
- Repeat the 100/500/1,000 mm matrix at approximately 1 mm spacing on a
  physical Quest 3. Verify calibrated extents, thin diagonals, through
  slots/holes, seam normals, separated components and outward growth across
  negative coordinates in Studio and Passthrough.
- Profile first-use and warm sample/stamp timings. Apply the lookup and
  repeated-field gates on device. Capture p50/p95/p99 CPU and GPU frame
  times, missed frames and memory under the configured refresh rate, over
  a sustained warm session with increasing occupied space and history.
  Include dense reference controls at admitted sizes.
- Exercise both hands, repeated Clay/Smooth, cross-brick strokes, Add/Subtract
  single and continuous Personal Stamps, masks, paint and Move. Check
  cancellation on tracking loss, menu/tool changes and budget refusal.
  Verify Undo/Redo of allocating and deleting bricks, including redo retention
  after a cancelled edit and interruption during mesh publication.
- Verify full-fidelity native/recovery/backup roundtrips, calibration, pivots,
  transforms and all sidecars, plus Boolean preview/export parity. Include
  reloading after interrupted save and verify unchanged original master
  hashes. Use disposable copies and measure working peaks during conversion,
  serialization and load.

## 6. Reproduction and validation

Run from the active repo. The benchmark creates a new timestamped directory
under ignored `work/narrow-band`, updating `metrics.json` after each completed
case. Its optional second positional argument points to a complete disposable
Phase 8.0.2 fixture directory. If the original fixtures are absent, generate
a fresh fixture set with `node scripts/benchmark-personal-stamp-baseline.mjs`
and pass that directory. Separate the benchmark and full check to avoid
competing CPU load.

```sh
node --expose-gc scripts/benchmark-narrow-band.mjs
for band in 2 3 4; do
  node --expose-gc scripts/benchmark-narrow-band-growth.mjs "$band" || break
done
npm test -- narrow-band brick-volume dense-growth history-project personal-shapes shape-backup personal-stamp shape-stamp recovery
npm run test:quick
npm run check
git diff --check
```

Final benchmark on Apple M5 Pro / Node v26.8.1 completed **69 master/grown
cases and 27 large-space cases**. Raw evidence is
`work/narrow-band/2026-11-11T12-56-12.932Z/metrics.json`. The preliminary
run at `2026-11-11T12-51-36.931Z` preceded the final trace and accounting
changes and is superseded.

Focused **178/178**, quick **21/21**. Full `npm run check` passed formatting,
lint, strict TypeScript and build, then **1,724/1,729 tests passed** with
zero skips. Five failed because sandboxed loopback `listen` returned
`EPERM` in agent bridge/MCP, binary preview and docs hosting. The final
benchmark script and three supporting handwritten files passed targeted
Biome after the last fixture-mesh coverage edit. `git diff --check` passed.
Logs are in `/tmp/83b-{benchmark-final,focused,quick,check}.log`.
No physical Quest 3 run or production sparse save/restore was performed.

The empty-field follow-up uses the same host and Node runtime. Raw JSON for the
2-, 3- and 4-voxel runs is in `work/narrow-band-growth` under
`2026-11-11T14-55-20.352Z`, `2026-11-11T14-55-28.634Z` and
`2026-11-11T14-55-37.009Z` respectively. Each band runs in its own process.

On the active follow-up checkout, focused **179/179** and quick **21/21**
passed. Full `npm run check` passed formatting, lint, strict TypeScript and
the build. **1,737/1,742** tests passed with zero skips. The same five
loopback tests failed with sandbox `listen EPERM` on 127.0.0.1. Logs are in
`/tmp/83b-growth-{focused,quick,check}.log`. The follow-up did not run an
unrestricted check or test on Quest.

The separate compact-bust follow-up completed an immersive Quest 3 CPU
and frame-interval replay for normal Clay and Smooth usage. Its result
covers the compact fixture and does not cover metre-scale Quest acceptance.
[Compact sculpt comparison](SPARSE_SDF_COMPACT_SCULPT_RESULTS.md)
