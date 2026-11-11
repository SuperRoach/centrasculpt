# Phase 8.3a — exact dense vs brick research

2026-11-11 (Australia/Melbourne). Research only, based on local HEAD `b80d1be`.
The supplied Documents folder is not Git; the active repository is
`/Users/brettjames/development/vrappPOC`. Initial status was clean. No production
source, caps, saved project, recovery database, Personal library, public engine
claim or WHATS_NEW change. No commit, push, merge or deploy.

## 1. Representation and correctness

`scripts/research/brick-volume.mjs` implements a bounded read-only lattice snapshot,
with 8×8×8 **samples** per brick (16³ sensitivity option). It provides the subset
used by `extractMesh`: dimensions, original resolution/extent/step/latticeMin,
coordinate/index/readVoxel, sampleLocal, normalAt and getDenseView(undefined).
It deliberately does **not** implement the mutable VolumeStore contract.

Every in-domain brick has an explicit directory entry: either an exactly uniform
signed scalar or a full Float32 payload. A varying fully-inside brick is allocated,
as is a varying exterior brick. Missing directory entries throw rather than
inventing positive distance. Uniform negative values and signed zero survive;
no occupied-surface shortcut discards full Float32 far-field magnitudes.
This is a sparse-capable uniform-region representation, **not a narrow band**.
For these unclamped fixture masters, exact constant-region compression may save
nothing. That outcome must not be hidden by counting only negative samples.

Keys use floor(global lattice sample / brick size), including negative coordinates.
Local storage offsets do not enter keys. Partial bricks contain unused zero padding,
which cannot be read through valid indices. Crops retain the original global
lattice origin; growth must not rebase coordinates. A sample has one canonical
owner. Trilinear corner reads and the normal stencil fetch neighboring owners:
there are no duplicated stored halos (zero halo allocation), no independent
boundary rounding, and no stale halo refresh problem in this read-only prototype.
Normal support reaches a sample beyond interpolation corners. Future edits need
coherent neighbor invalidation and scratch exchange; this experiment does not
solve those problems.

Interpolation and gradient arithmetic mirror the dense implementation, using
readVoxel instead of direct array access. Dense outside-box clamping plus distance
extension is retained, including its behavior for fully-negative fields. Meshing
retains production machine-roundoff zero tolerance and its empty/all-positive,
all-negative and all-zero no-surface behavior; negative/zero transitions are not
replaced with a generic occupancy flag. Tests cover uniform signs, ±0, mixed signed
constant bricks, grown and cropped negative origins, exact-zero planes, seams,
normal stencils, exterior sampling, corruption and payload admission refusal.

Prototype bounds: only 8/16 brick sizes, source sample count at most 2×192³ and
payload cap at most 64 MiB. These are isolated research guards, not changed app
limits. Metadata/JS garbage are **not** hard-bounded by the payload cap; input
sample count bounds directory size and conversion work. An allocation failure
abandons the disposable snapshot without touching its source.

## 2. Reproducible experiment and measurement definitions

The matrix reads the existing eleven version-1 fixture `.form` masters from
`work/personal-stamp-baseline/2026-11-10T12-23-20.143Z` read-only. At 192³ it copies
original Float32 values exactly; 64³/128³ resample that master on the fixed [-1,1]
100 mm cube. Source hashes are recorded and checked unchanged after probing.
Two further independently evaluated analytic fields are a long 3 mm diagonal
capsule and a 4 mm spherical shell with a cylindrical Boolean bore. Total matrix:
13 fields × 3 resolutions × 2 brick sizes = 78 observations. No user data is loaded.

Seed 8301 produces repeatable random, local and X-fast scan-tile interpolation
traces (4096 samples each). The scan tile is not an exhaustive full-grid scan;
the exhaustive exact-value verification is separately timed. Four paired
invocations per trace alternate backend order between rows; first invocation and
later warmed invocations are retained individually. These matrix observations
are same-process first-workload measurements, **not fresh-process cold timing**:
conversion, exact verification and dense extraction precede them and warm caches.

`brick-cold-trials.mjs` separately starts fresh Node processes per backend/case for
all eleven stored masters, both brick sizes and all resolutions. Each process
runs the same 4096 random probes four times: first lookup invocation and three
warm repeats. Decode/resampling/conversion precede timing; OS page caches are not
flushed, and resampling can warm related arithmetic. This tests backend lookup
startup, not cold application launch. The two additional analytic cases have only
the matrix same-process paired trials. Timing variance/GC/host load are retained;
there is no headset latency claim or confidence-interval claim.

Repeated-stamp metrics are read-only source-field evaluation of the existing
20-pose translation/Y-rotation/scale trace, min with a constant target field,
4096 probes per pose, at three target/source bound ratios (0.5, 1, 2).
Checksums must match. Wider targets cause more outside-source queries and distance
extension. This measures repeated transformed sampling, **not** actual production
stamp transactions, dirty chunks, masks, history, growth, Add/Subtract admission,
or full destination scans. It cannot be substituted for the prior actual stamp
matrix. Destination geometry and source resolution remain fixed.

All lattice samples are compared with Object.is (including signed zero). Seeded
near-surface probes compare interpolation and normalized gradient components.
The original millimetre-space analytic/implicit formulas independently measure
near-surface field error and sign disagreement. Curved formulas are not certified
Euclidean SDFs; field error is not a Hausdorff mesh error. Fixed random probes can
miss narrow slots; the earlier fixture detail results remain authoritative.

Production marching tetrahedra reconstructs both fields at every matrix size.
Position and normal Float32 SHA-256 hashes must match exactly. Identical ordered
triangles establish identical dense-vs-brick topology, holes and silhouette at
every view, without a finite camera test. Dense welded topology records triangles,
components, Euler characteristic, boundary/nonmanifold edges and collapsed faces
at 1e-6 model-unit welding. Closure is not feature survival. There is no independent
analytic-reference mesh Hausdorff or print-fit certificate. Thin features can
already be missing in the dense mesh: sparse storage does not fix a 1 mm feature
at coarse 64/128 resolution or permit a quality downgrade.

### Memory accounting

Exact typed payload allocation is counted from byteLength; dense values+scratch
are calculated from the existing two arrays (2/16/54 MiB at 64/128/192).
The read-only brick snapshot has no editing scratch. Compare it against **one**
dense values array (1/8/27 MiB) before attributing savings to bricks. Removal of
unused dense scratch from a sampler would be a separate optimization.

Directory/key/typed-array-object overhead uses a **modeled allowance** of 256 bytes
per brick, not measured V8 object sizes. Conversion retains one brick's JS list of
sample/index pairs and creates temporary coordinate arrays. The field named
`conversionScratchAllowanceBytes` uses 128×brickSize³ as an allowance; this is not a certified upper bound on V8 allocation,
GC garbage, allocator reserve or peak heap. `calculatedConversionPeakWithDenseBytes`
adds source values+scratch, retained brick payload, directory allowance and that
conversion allowance. It excludes decoded native/master buffers, trace arrays,
meshes/topology maps, process runtime and uncollected garbage. No permanent halo
or scratch bytes are allocated; a future mutable implementation must add them.

`process.memoryUsage()` before/after snapshots report whole-process rss, heap,
external and arrayBuffers. `process.resourceUsage().maxRSS` is a cumulative
whole-process high-water mark in KiB; fresh-child maxima offer a separate scope.
Neither is an isolated retained brick footprint or a measured transient JS-object
allocation total. Snapshot deltas can be negative; GC does not guarantee returned
RSS. No sampled RSS peak is mislabeled as a typed-array calculation, and no browser,
GPU, physical Quest or production peak measurement is claimed.

The four-voxel candidate counts simply identify bricks with a sample |d|≤4 steps.
Their payload bytes are **occupancy estimates only**, before explicit far-field
sign/magnitude representation, directory, normal/interpolation halo expansion,
mutable scratch, history and lossless-master preservation. They are not working
narrow-band measurements or a guarantee that near-surface sample tests find every
crossing in arbitrary non-distance-certified fields.

## 3. Measured results

Completed **78/78** rows. All 11 master hashes match the original baseline;
all 192³ stored-master rows retain the original sample hash. Every row has zero
exact sample mismatches, zero measured interpolation/normal component deviation,
and identical position/normal mesh hashes. Dense and sparse gradients use the
same finite-difference stencil; exact sample identity also preserves its raw
unnormalized differences. All reconstructed meshes have zero welded boundary
and nonmanifold edges. Maximum extracted triangles were 729,864, below the existing
1,000,000 native project triangle cap; no cap was raised. The 1 mm bar still has **no surface at 64³**.

Both brick sizes allocate **100%** of bricks and exactly **100%** of dense values
payload for all 39 field/resolution cases. Including the modeled directory,
8³ is **112.5%** of values alone, 16³ **101.56%**. Their apparent reductions vs
values+scratch (43.75% / 49.22%) come entirely from omitting mutable scratch,
not compressing a single fixture payload. Adding dense-equivalent editing scratch
would erase that apparent saving.

| Metric (matrix host timings) | 8³ | 16³ sensitivity |
| --- | ---: | ---: |
| Conversion min / median / max ms | 19.0 / 114.1 / 580.9 | 5.6 / 89.8 / 324.7 |
| Warm random lookup median sparse/dense | 4.15× | 4.08× |
| Warm local lookup median sparse/dense | 4.46× | 4.35× |
| Warm scan-tile lookup median sparse/dense | 4.54× | 4.40× |
| Repeated transformed field sampling median ratio | 4.57× | 4.35× |
| Worst warm observed lookup ratio | 7.54× | 5.02× |

Warm lookup ratios pool the three later observations per case; transformed-field
ratios pool the three target-bound workloads. These are ratios of paired observed
times, not theoretical lookup estimates. Main matrix ran while full-check tasks
also used the host; do not overinterpret individual minima/outliers or conversion
ordering (8³ always precedes 16³). The simple string-key Map path and scalar index
decoding are research overhead; this does not establish the best possible sparse
lookup cost. The matrix already fails the proposed ≤2× lookup gate.

| Four-voxel candidate payload / dense values, min / median / max | 8³ | 16³ |
| --- | ---: | ---: |
| 64³ | 6.25 / 9.38 / 34.38% | 25.00 / 25.00 / 87.50% |
| 128³ | 1.37 / 4.05 / 22.66% | 4.69 / 6.25 / 29.69% |
| 192³ | 0.67 / 2.40 / 14.93% | 2.08 / 2.78 / 21.30% |

For example, 8³ candidate payload-only median reduction vs values is 95.95% at
128³ and 97.60% at 192³. These attractive figures omit the hard parts listed above;
**no such working footprint saving was achieved**. 16³ reduces directory overhead
but allocates more irrelevant band-adjacent samples, especially at coarse sizes.

Modeled conversion working peaks including dense target values+scratch are
3.19 / 25.06 / 84.44 MiB for 8³ and 3.52 / 24.63 / 81.92 MiB for 16³ at
64/128/192. These are allocation/allowance arithmetic with the stated exclusions.
Observed main-process maxRSS reached **771.95 MiB**, including original masters,
meshing, topology maps, runtime and GC garbage; it is not an 84 MiB measured peak.
Raw per-row before/after RSS, heapUsed, external and arrayBuffers remain available.

Fresh-process final run completed **66 paired cases / 132 child processes** for
the eleven masters. Median first-invocation sparse/dense ratios are **4.26× (8³)**
and **3.74× (16³)**; later warm medians **3.91× / 3.92×**. Median first-lookup
4096-probe CPU is 1.57 ms dense / 6.73 ms 8³ sparse, and 1.58 / 5.80 ms for the
separate 16³ pairs. These are separately aggregated medians, not the ratio of
median times. Final sparse-child whole-process maxRSS ranges **194.31–286.06 MiB**
for 8³ and **210.78–313.23 MiB** for 16³, including decoded masters and runtime.
An earlier full paired run under competing test load is retained separately;
its warm medians were 4.00× / 3.67×. The final fresh-process run ran after the
matrix, full checks and source-bounds study completed. Both runs agree that this
Map implementation fails the proposed lookup gate.

Supplemental source-bound experiment completed **18 configurations / 54 target
workloads**, with four paired timings each: 64/128/192, 8³/16³, original window,
eight samples cropped per face or eight grown per face, and target bounds 0.5/1/2.
It samples an independent analytic sphere on the unchanged global lattice. A
read-only test adapter holds cropped dense values; this does not make production
cropped SDFVolume construction supported. Every dense/brick probe and timing
checksum matches. At target ratio 2, changing source bounds changes the dense
exterior-extended field by up to **0.11697 model units (5.8485 mm)** for the 64³
crop and **0.10205 units (5.1025 mm)** for the grown analytic window. Overlapping
samples remain unchanged. At 192³, corresponding maxima are 0.04687/0.05087 units.
The crop still contains the entire sphere surface: these are far-field extension
differences, not demonstrated surface displacement. Thus cropping a master is not
a semantics-neutral way to report brick savings for future CSG.

The 8³ payload ratios vs the original source are crop **42.19/66.99/77.03%** and
grow **195.31/142.38/127.14%** at 64/128/192. These reflect changing the source
window sample count; each new window still has 100% varying brick allocation.
16³ cropped windows can also pay partial-brick padding. Per-case bytes, conversion,
outside-source probe counts, lookup times and field differences are in
`source-bounds.json`; no production project or master was cropped/grown.

## 4. Production transition audit (unsupported here)

| Contract | Current dependency | Required future work before integration |
| --- | --- | --- |
| VolumeStore | writeVoxel, read/writeRegion, reset, brush/brushSteps, world sampling and transforms | Implement the complete validated mutable contract, finite/range/positive-boundary checks, atomic allocation failure and cancellation; no dense-view substitute that silently loses values |
| Brush/smoothing | SDFVolume directly accesses values and same-sized scratch; Jacobi reads old state | Sparse write admission, stencil/halo coherence, local scratch with measured simultaneous peaks, masks and exact record callbacks for all modes; Pinch/Crease/Move reconstruction separately |
| Growth/crops | dense-growth copies exact original samples and extends far field on stable lattice; SDFVolume requires growth contain initial cube | Preserve global origin/spacing and partial brick ownership; verify cropped imported sources separately; transactional growth publication/rollback and sidecar remapping; existing 16-cell growth blocks are not sparse 16³ bricks |
| History/Undo | Exact Float32 before/after indexed deltas; prepareVolumeRebind requires SDFVolume and assertExactDenseGrowth | Stable sample identity or correct index remap across growth, old/redo/pending/packed records, canceled allocation and deleted/recreated brick contents; retain exact far-field before values |
| Mesher/cache | extractMesh supports readVoxel fallback; IncrementalMesher still has full chunk directory/dirty set and normal stencil; growth rebind has dense assertions | Test incremental edits across brick/chunk seams, boundary stencil invalidation, triangle/cache budgets, selection/export caches and ownership; no assumption that storage sparsity reduces triangles |
| Shape/Boolean | shape-stamp uses read/writeVoxel but validates/clamps full distances; Personal fields disable unsafe AABB pruning and can change all far fields | Preserve min/max CSG semantics, source exterior extension, all signs and magnitudes, staged rollback and target bounds; a sign-only interior/exterior sentinel is insufficient for exact Booleans, smoothing or repeat stamps |
| Personal master sampling | createPersonalStamp always copies all Float32 samples and derives bounded preview | A sparse-aware read-only source capability with identical transforms, pivot, sampler/exterior behavior and byte admission; changing destination store alone saves no selected-master snapshot bytes |
| Native .form/project/export | v3 cubes/v4 grown rectangular samples; save falls back to full readRegion, open always constructs SDFVolume; validators count triangles | Lossless streaming/dense compatibility adapter with explicit transient bounds and exact samples, lattice, transform, masks/paint and construction metadata; version/migration only if needed; project, recovery, STL/GLB and export-worker roundtrips |
| Personal Shapes/backup | ordinary capture constructs dense exact grown lattice; evaluated composites are separately sampled at admitted detail; native/gzip payload and .cshapes integrity preserve masters | Preserve original Float32 master bytes/semantics, calibration, pivot and independent copy identity; backup/restore hashes, quotas, limits, import transactions and recovery compatibility; sparse derivative never replaces a master with clamped band data |
| Masks/paint | lazy mask pages/COW snapshots and paint sidecars use linear sample identities and geometry proximity | Match default/inversion and page remap through growth/crop/Undo, preserve paint eligibility and native payloads; charge sidecars to footprints rather than counting only SDF bricks |
| Admission/workers | IndependentLayers, bakes, clones and reconstruction allocate concrete SDFVolume and account for dense bytes | Audit all instanceof/dense allocation sites, worker transfer and structured clone, composite/export sampling, concurrency and source+target/staging/history/preview combined peaks; preserve current refusals and all work/memory/triangle caps |

Full Float32 master fidelity and dropping far-field values cannot both be claimed
without an additional lossless representation. A future narrow-band **derived**
editing/meshing cache can coexist with exact masters, but memory accounting must
include both. Master bytes on disk are not resident-memory savings unless lazy
loading/streaming is actually implemented and measured. A narrow-band cache must
have explicit validity/fallback for arbitrary non-distance fields and Boolean far
fields; sign-only sentinels may support some surface queries but not this contract.

## 5. Recommendation and explicit next gates

**No-go for production migration of this prototype. Conditional go for isolated
8.3b research**, because band occupancy can justify investigating surface-local
working storage even though lossless constant-brick compression is ineffective
for the fixture distances. This is authorization to recommend, not to start 8.3b.
Keep dense production and saved masters unchanged.

Before calling 8.3b successful, compare 2/3/4-voxel bands with normals/interpolation
halos and signed far regions, against these fixed masters, grown/cropped layouts,
constant fields, thin diagonal, hollow and deep-inside Boolean cases:

- At least **50% reduction vs dense values+scratch** and **25% vs values alone** in
  median 128/192 working footprints including directory, halos and mutable scratch;
  no case over dense values+scratch. Include any co-resident exact master and cache.
  Candidate payload occupancy alone does not pass this gate.
- Measured conversion/edit peak stays within existing admission budgets, including
  old/new/source/target, history, previews and meshes. Refuse safely on overflow;
  do not raise limits or coarsen quality. Report RSS and allocation accounting apart.
- Warm median random/local/scan field lookup **≤2× dense**, no case **>3×**, and
  repeated transformed source sampling **≤1.5× dense** at all target ratios.
  Repeat three fresh-process pairs per case and report medians/ranges separately
  from first use; the present simple Map path is not a performance-ready design.
- Surface lattice values inside the required band stay bit-exact; no sign changes
  at zero crossings, interpolation deviation **≤1e-6 model units** (0.00005 mm at
  calibration 50), normalized-gradient component deviation **≤1e-4**, no added
  boundary/nonmanifold edges, lost components/holes, or silhouette differences.
  Require dense-identical meshes when all corner/stencil values are preserved;
  otherwise independent bidirectional geometric deviation **≤0.01 voxel** with
  explicit thin-feature probes. These are research gates, not print tolerances.
- Full Float32 original master/project/backup/recovery roundtrips and Undo remain
  exact. Prove Boolean far-field equivalence or explicitly restrict the derived
  cache and fall back to lossless data. If exact data must remain dense/resident
  and total footprint fails the savings gate, stop rather than claiming a win.

Failure of memory, geometry, far-field or roundtrip gates is a no-go even if one
lookup benchmark improves. 16³ is sensitivity evidence only; no production brick
size is selected. 8.3c remains a separate integration decision after these gates.

## 6. Evidence, reproduction and validation

Raw local evidence:

- `work/sparse-bricks/2026-11-10T13-09-54.092Z/metrics.json`: complete 78-row matrix.
- Adjacent `cold-trials.json`: final 66 fresh-process pairs; `cold-trials-loaded.json`:
  earlier complete pairs under competing host load.
- Adjacent `source-bounds.json`: all 18 supplemental configurations.
- `/tmp/83a-{benchmark-final,cold-isolated,source-bounds,focused-final,quick,check-final}.log`.

The earlier interrupted `2026-11-10T13-09-08.465Z` run evaluated formulas directly;
it was superseded before acceptance by the existing-master matrix and is not
included in results. The final matrix JSON method label was clarified after
execution to distinguish same-process warmed measurements from fresh-process cold
trials; no measured values were edited. Prototype scratch allowance naming was
also clarified without changing its arithmetic.

Focused prototype/baseline fixtures **7/7**, quick **21/21**. Final full
`npm run check` passed formatting, lint, strict types and production build;
**1,720/1,725 tests passed, five failed, zero skipped**. Failures are sandbox
`listen EPERM` for loopback bridge/MCP/preview/docs-hosting socket tests. This is
permission-limited, **not a full pass**, and no unrestricted rerun is claimed.
The first full attempt before the final added crop/plane test was 1,719/1,724 with
the same five failures. After the supplemental harness/accounting-label edits,
Biome checked all five offline source/test files and the focused 7-test suite
passed again. No production src was changed. Original eleven master hashes were
independently rechecked against baseline.json; every stored-master 192³ row equals its master.
`git diff --check` passed. No browser or physical headset acceptance is claimed.

```sh
# Existing disposable masters; regenerate only if absent, producing a new run:
node scripts/benchmark-personal-stamp-baseline.mjs
# Optional third argument points to a different complete baseline directory:
node --expose-gc scripts/benchmark-sparse-bricks.mjs work/sparse-bricks \
  work/personal-stamp-baseline/2026-11-10T12-23-20.143Z
# Run AFTER the matrix, to avoid concurrent benchmark load:
node scripts/research/brick-cold-trials.mjs <matrix-run-directory>
node scripts/research/brick-source-bounds.mjs <matrix-run-directory>
npm test -- brick-volume personal-stamp-baseline
npm run test:quick
npm run check
```

The matrix imports compile-core to build its engine dependencies into ignored
`work/test-build`; cold trials use those outputs. Every matrix run creates a fresh
timestamped directory. Raw JSON and generated fixtures in ignored `work/` are local
research evidence, not committed release assets. Logs under `/tmp` are temporary.
No browser acceptance was needed for a standalone offline sampling prototype.
