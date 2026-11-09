# Phase 7.5.4a — Export benchmark and diagnosis — 2026-11-09

Research only. No export algorithm, geometry default, UX, native schema or safety
limit was changed. The sole production instrumentation addition splits the existing
combined extraction/precompaction wall timer into two counters.

## Scope and reproduction

Audited clean checkout `4062735` in `/Users/brettjames/development/vrappPOC`, current
status/roadmap, 7.5.2 correctness and 7.5.3 profiling/UI evidence, worker/client
snapshot and cancellation paths, staged compositor, marching-tetrahedra mesher,
chunk compactor, planar optimiser, final STL topology validator and both encoders.
The conversation working directory is not a Git checkout. Existing project and
recovery records were never opened in the connected editor or modified.

```sh
# Four existing disposable fixture definitions; fresh output subdirectory each time.
node scripts/benchmark-export-diagnose.mjs
# Optional larger cap; this is a maximum, not a forced evaluated grid size.
node scripts/benchmark-export-diagnose.mjs --resolutions 192,256
# A supplied native COPY, not a live editor or recovery record.
node scripts/benchmark-export-diagnose.mjs --native-copy /absolute/path/Astra-copy.form \
  --label astra --resolutions 192,256 --repeats 3 --warmup 1 \
  --output work/phase-7-5-4a/astra
# Optional fault probes, kept out of normal performance runs.
node scripts/benchmark-export-diagnose.mjs --fixtures clay --formats stl \
  --repeats 1 --warmup 0 --probe stale
```

Use the native Save project action to obtain Astra if its original `.form` is not
available; do not relabel an STL/GLB as `.form`. Imported triangles cannot recover
the original ordered SDF, calibration, edit history or fine sculpt detail. Copy the
native file to an ignored input directory, make the copy read-only if desired,
and compare SHA-256 before/after. The harness only reads the supplied file and
asserts identical bytes after each completed attempt. It also asserts stable native
serialization and Undo/Redo counts on its disposable in-memory editor. Astra was
not found in either workspace; no organic Astra result is claimed.

The user subsequently supplied `~/Downloads/lensbenchmark.form`: 9,056,816 bytes,
SHA-256 `ff59de49002bde1f97771e8b1c52de7b401d3e7f4faf50bf31325803c0b8c855`.
A write-disabled copy lives under ignored `work/phase-7-5-4a/input/`. This is a
nine-layer mechanical holder (base, body, three difference cutters, four feet),
100 mm/model-unit. It is called **Lens benchmark**, not Astra.

## Measurement contract

One new Node process per fixture × requested cap × quality × format × repeat;
serial runs, one discarded run followed by three measured runs. Discarding the
first process warms filesystem/OS caches, **not the next process's JIT**. Compile
once before children; no disk writes or decimation of source data. Default research
budget is the existing maximum 512 MiB, not the product default 256 MiB. Every
attempt retains production admission/refusal rules. Node cooperative encoder costs
are not browser worker, Quest or download-completion measurements.

`sourcePreparationMs` includes dynamic imports, fixture construction/native loading,
runtime construction and the native preservation snapshot. Preparation wall time
includes allocation, sampling/staging, meshing and cooperative scheduling. Sampling
and meshing counters measure compute, so they do not sum to wall time. Extraction
is `exportSources()` including any colour extraction; precompaction includes chunk
optimisation, allocations, expansion, ownership accounting and disposal. Encoder
optimiser time includes welding/cleanup/orientation/planar work; it is not a pure
planar-kernel timer. STL validation includes Float32 precision stabilisation and
whole-file topology. Encoding/GLB packing have separate timers. Coordinate
transforms/scaling and admission are included in total but not every subcounter.
The initial four-fixture matrix's total additionally includes a probe-setup bounds
scan; the later Lens matrix moves that diagnostic outside export total. No speedup
comparison between those matrices is valid.

JSON records requested/evaluated grids, raw meshed/prepared/final triangle counts,
profiles, file bytes, resource admission, exact errors and print reports. Real STL
bytes are counted and parsed independently by Three STLLoader; GLB reloads with
GLTFLoader. Encoded bounds are checked against preparation bounds at persisted
calibration, STL millimetres and GLB metres. These are independent encoding/unit
checks, not an independent proof of the source evaluator. Production topology
checks report degeneracy, boundary/non-manifold/inconsistent-winding edges,
components and signed-volume orientation; GLB optimiser mesh stats have narrower
scope than the final STL print report.

Every STL vertex and triangle centroid is evaluated in the original ordered field.
The reported maximum absolute field value in calibrated millimetres includes
sampling/interpolation and rounding. A transformed/composed field need not be a
true Euclidean distance. This is **not Hausdorff distance, a wall-thickness check,
a clearance/print-fit proof or detection of every small missing feature**.
Orthographic silhouette diagnostics are finite-resolution views; occlusion and
view direction can hide defects. Slicer, physical printer and Quest acceptance
remain separate.

Tracked derived bytes, available workspace, estimated encoder bytes and Node
`process.memoryUsage()` are distinct from peak process RSS. `maxRSS` is converted
from KiB to MiB and includes source/runtime/native snapshot, diagnostic parsing,
field probes and output buffers. Stage snapshots cannot measure every transient
allocation; the export budget is not a hard RSS cap. No forced-GC or mobile-memory
claim is made.

## Limits retained

- Evaluated intermediate mesh: 1,000,000 triangles; no silent downgrade.
- Final STL topology admission: 600,000 triangles and 128 bytes per corner.
- Existing encoder input admission: Fast 1,000,000 / Standard 600,000 / High 300,000
  triangles, with 112 / 288 / 480 estimated bytes per corner. High admission applies
  before simplification; it does not promise a smaller result will be admitted.
- Existing staged source-work total 256 million and per-stage 64 million;
  maximum grid 256³, default cap 192³; memory choices 256/384/512 MiB.
- Existing live Boolean quality/aspect/feature, paint, seam, cancellation and
  stale-source guards. An experimental file with blocking print defects is retained
  as diagnostic evidence only and is not a printable success.

## Repeated measured evidence

Node v26.8.1, macOS arm64 / Apple M5 Pro; 96 serial isolated attempts (24 discarded, 72 measured),
all 96 retained native serialization/history. These are current baselines, not
before/after optimisation gains. Each cell below is the median of three measured
runs; ranges are min–max. Export total excludes source setup and post-export
parsing/probes/file write. Raw JSON retains every observation and exact diagnostics.

### Lens native copy

| Cap / format / quality | Export total ms (range) | Raw → prepared → final triangles | File bytes | Peak RSS MiB range |
| --- | --- | --- | --- | --- |
| 192 / STL / fast | 11,135.5 (10,926.6–11,321.3) | 201,308 → 89,018 → 89,018 | 4450984 | 328.5–371.6 |
| 192 / STL / high | 11,987.3 (11,883.5–12,030.9) | 201,308 → 89,018 → 79,566 | 3978384 | 403.1–420.6 |
| 192 / GLB / fast | 3,805.8 (3,775.5–3,821.6) | 201,308 → 201,308 → 201,308 | 14495256 | 398.7–407.3 |
| 192 / GLB / high | 5,176.4 (5,148.1–5,216.4) | 201,308 → 201,308 → 79,566 | 1433480 | 434.5–441.0 |
| 256 / STL / fast | 19,847.8 (19,609.3–19,863.5) | 363,540 → 129,168 → 129,168 | 6458484 | 393.4–462.4 |
| 256 / STL / high | 20,737.0 (20,696.6–21,061.1) | 363,540 → 129,168 → 110,420 | 5521084 | 517.8–563.0 |
| 256 / GLB / fast | 9,131.4 (9,115.7–9,202.9) | 363,540 → 363,540 → 363,540 | 26175964 | 535.5–538.6 |
| 256 / GLB / high | REFUSED | 363,540 input; High limit 300,000 | — | 319.4–324.0 |

Lens STL substages, milliseconds (medians independently computed; do not sum
compute counters to wall time):

| Cap / quality | Preparation wall | SDF sampling | Meshing | Extraction | Precompaction | Optimiser | Validation | Encoding |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 192 / fast | 10,946.8 | 1,723.0 | 248.1 | 1.2 | 7,225.1 | 9.2 | 147.1 | 12.6 |
| 192 / high | 11,004.4 | 1,729.8 | 249.8 | 1.3 | 7,207.4 | 849.3 | 125.5 | 11.6 |
| 256 / fast | 19,587.5 | 4,076.8 | 503.1 | 1.5 | 10,522.4 | 12.2 | 201.0 | 16.0 |
| 256 / high | 19,263.2 | 4,079.6 | 422.3 | 1.7 | 10,435.6 | 1,217.8 | 171.0 | 15.0 |

Lens source preparation: 399–409 ms median by case. GLB preparation wall medians:
3,706–3,738 ms at 192³ and 9,024–9,080 ms at 256³. GLB optimiser/packing medians:
Fast 192: 23.0/37.6 ms, High 192: 1,427.4/9.1 ms, Fast 256: 26.8/62.5 ms.
256 High GLB refuses after preparation with the exact message:
`Too many triangles for high export (363540; limit 300000). Choose Fast or export fewer layers. Your model is unchanged.`
No final file is emitted for that case.

All seven emitted Lens files independently reload at approximately 450 × 59 × 70 mm
(STL) or 0.450 × 0.059 × 0.070 m (GLB). STL longest dimension is 450.0000153 mm;
unit-conversion errors are Float32 scale. Final decoded checks: one component,
zero boundary/non-manifold/inconsistent edges, zero degeneracies/inward components.
STL and decoded GLB field-residual maxima: 1.158783 mm at 192³, 0.891753 mm at 256³;
Fast/High match. A larger cap improved this sampled residual, not a proven fitting
tolerance. High STL reduces prepared Fast by 10.62% / 14.51% at 192³/256³.
Derived preparation storage 67.82/152.96 MiB; available STL workspace 472.38/469.63
MiB and GLB 410.67/325.53 MiB. RSS reaches 563.0 MiB despite 512 MiB admission.

Post-export three-view 300×300 raster comparisons found zero differing Fast/High
pixels in all nine available quality pairs across fixtures and Lens. Visually
inspected Lens 192/256 and curved PNGs: outer silhouettes agree; **Lens pocket
interiors are occluded in these views**. This does not establish pocket-depth,
small-feature, Hausdorff or print-fit acceptance. Earlier sampled SVG wireframes
are supplemental; the PNG raster uses every triangle. Run the postprocessor:

```sh
node scripts/diagnose-export-files.mjs OUTPUT_DIRECTORY [NATIVE_COPY.form]
```

It adds PNGs and `decoded-diagnostics.json`, preserves native bytes, validates
transformed decoded coordinates with the existing 600k topology ceiling, and
optionally probes GLB against the supplied native field. Its memory/time are
separate from benchmark export totals. STL field probes remain in benchmark JSON
because inverting its centred coordinates requires the original source bounds.

### Disposable fixture baselines at requested 192³

| Fixture / quality (STL) | Export total ms | Precompaction ms | Raw → prepared → final triangles |
| --- | --- | --- | --- |
| clay / fast | 444.4 | 202.7 | 34,048 → 34,036 → 34,036 |
| clay / high | 699.3 | 197.8 | 34,048 → 34,036 → 34,028 |
| curved-192 / fast | 3,707.9 | 1,385.2 | 293,776 → 293,776 → 293,776 |
| curved-192 / high | 6,632.9 | 1,367.4 | 293,776 → 293,776 → 293,776 |
| holder-443 / fast | 11,570.9 | 8,659.7 | 358,188 → 103,128 → 103,128 |
| holder-443 / high | 12,430.7 | 8,695.6 | 358,188 → 103,128 → 81,708 |
| boolean-array / fast | 4,041.9 | 3,369.1 | 107,608 → 48,288 → 48,288 |
| boolean-array / high | 4,443.2 | 3,419.9 | 107,608 → 48,288 → 43,940 |

Evaluated grids: clay 69³, curved/holder 192³, array 104³. Requested caps are not
forced upsampling. Synthetic holder precompaction is about 8.5–8.7 seconds of
11.3–11.4 seconds preparation; extraction about 1 ms. This refines the historical
7.5.3 combined 8.6/11.1-second finding: **precompaction dominates, not extraction**.
Curved High optimiser median about 3.0 seconds, with zero triangle reduction.
Lens confirms precompaction 7.2 seconds at 192³ and 10.4–10.5 seconds at 256³;
its denser SDF sampling also grows from 1.7 to 4.1 seconds.

Fixture residual maxima remain clay 0.090061, curved 0.032137, holder 0.972257,
array 1.653687 mm. Holder bounds 443 × 98 × 150 mm and checked topology are retained.
All emitted fixture files have one decoded component and zero checked topology
defects except synthetic clay Fast: STL blocks for `8 degenerate triangles.` and
`10 non-manifold edges.` (also 2 boundary edges); decoded GLB shows 20 degeneracies,
22 non-manifold and 2 boundary edges. High cleanup passes the same checks.
The identical silhouette masks demonstrate why silhouette agreement cannot prove
manifoldness. Experimental defective files are diagnostic only.

GLB Fast median totals: clay 156.1, curved 1,850.8, holder 2,739.7, array 807.5 ms;
High clay 436.1, array 1,153.5 ms. Holder High refuses at 358,188 input triangles
(limit 300,000). Curved High refuses with:
`Not enough memory for high export. Needs about 404 MiB; 362 MiB available. Increase export memory or choose Fast. Your model is unchanged.`
GLB does not precompact/release its evaluated composite as STL does; coloured
array GLB also retains 107,608 triangles in High. Different preparation and colour
semantics prohibit treating these timings as a format-only encoding comparison.

## Engineering priorities for 7.5.4b

1. **Compaction work/copy/allocation reductions first.** Code inspection shows up
   to twelve per-chunk passes, each calling the High cleaner (including three
   planar one-ring passes), allocating indexed arrays, then expanding to unindexed
   Float32 positions/normals. Repeated string-key welding/edge maps and JS-number
   arrays are plausible allocation/GC costs. Measure pass counts, bytes copied,
   no-change work and GC before choosing indexed retention, exact reuse or typed
   workspace changes. Preserve winding, seam ownership, revision/cancel checks and
   the last stable Float32 chunk. Cross-stage topology reuse requires proof because
   STL unit conversion changes exact-coordinate equivalence. GLB colours and
   painted seams prevent blindly sharing the STL compaction path.
2. **Feature-preserving simplification for organic output.** Curved High pays for
   cleanup without reducing triangles. Investigate constrained edge collapse/QEM
   with calibrated physical error, original-field probes, symmetric surface-distance
   measurements, silhouette/normal tests and protected holes, creases, thin walls,
   paint and mating surfaces. An SDF residual alone is insufficient. Keep an exact
   baseline/fallback and all admission guards. Do not implement or enable it here.
3. **Adaptive SDF extraction.** Current dense grid uses six tetrahedra per cube,
   emits unindexed triangles, then compacts. Sparse/octree extraction, indexed
   edge reuse and adaptive dual contouring could spend samples/triangles by
   curvature. This is an architectural hypothesis, not a measured speedup: prove
   crack-free transitions, ordered CSG, thin-feature survival, winding, gradient
   quality, deterministic boundaries, physical accuracy and bounded memory/work.
4. **Optional retopology last.** Useful for artist-oriented GLB/quad flow or an
   explicit derivative, but not necessary for binary STL printing and not a safe
   automatic replacement of an authoritative SDF. Evaluate projection drift,
   topology changes, holes, colours and post-subdivision silhouette; keep it
   separate and opt-in if later justified. No dependency/service was added.

Repeated compaction dominance, costly zero-reduction curved High, format-specific
admission and uncertain transient memory justify an **Extra High effort 7.5.4b
engineering investigation**. They do not justify raising limits, changing defaults
or promising a speedup. Require matched-machine/process trials, bounded peak memory,
source/native/history preservation, cancellation/stale/refusal tests, calibrated
geometry/topology and visual acceptance before any 7.5.4c shipping decision. Obtain
an actual heavy organic Astra native file before generalising Lens results.

## Verification and handover

- Quick suite: 21/21 passed. Focused harness/sizing/resolution/staged/quality/planar:
  **42/42 passed**, 28.31 s wall. Seven new harness tests cover repeat determinism,
  native serialization/Undo/Redo, read-only native calibration/input bytes, actual
  STL count/size, diagnostic raster winding/coverage, summary warmup/refusal handling,
  CLI validation and real encoder cancellation/stale/memory refusal messages.
  Final focused harness rerun: **7/7 passed**; the CLI orchestration also completed
  six extra isolated validity attempts (one discarded + two measured per quality),
  recording CPU/OS/source SHA-256 provenance and fresh output-directory creation.
  Existing focused worker/preparation tests cover mid-work abort, source mutation,
  input budgets, fallback and actual worker transfer preservation.
- `npm run check`: **1,677/1,677 passed**, zero failures/skips/cancellations,
  102.21 s test wall; Biome formatting/lint, strict TypeScript and production Vite
  build passed. Final rerun after summary regression fix: **1,677/1,677 passed**,
  98.30 s test wall, same formatting/lint/types/build gates, no failures/skips/
  cancellations. Existing lint warnings and bundle-size advisory remain.
- Both dedicated Chromium export/lifecycle scripts failed during launch with
  SIGABRT; their UI assertions did not run. Network permission did not resolve the
  host browser-launch restriction. No bypass or elevated browser retry was used.
- Actual in-app fallback on a fresh 5214 origin/default sphere: worker Fast STL
  prepared and downloaded; independent parser 31,536 triangles / 1,576,884 bytes /
  169.848068 mm. Worker High unified export exposed the new timing split
  (extraction 0.1 ms, precompaction 312.7 ms) and checked clean print report; worker
  GLB High prepared. Quality change invalidated the prior link; explicit Cancel
  reported request cancellation; idle Escape restored Export focus. Final history
  remained 0 Undo / 0 Redo. No recovery prompts/records were restored or discarded.
  This is narrower than a complete scripted lifecycle/responsive/holder rerun.
- Original Downloads file and read-only input copy retained the identical SHA-256
  above after all native benchmark and postprocessing attempts. No commit, push,
  merge, production algorithm, dependency or What’s New change.

Local evidence (ignored):
`work/phase-7-5-4a/benchmark.json` (four-fixture matrix),
`work/phase-7-5-4a/lens/run-yAG1Ju/benchmark.json` (Lens 192/256), both
`decoded-diagnostics.json` files, actual STL/GLB/PNG artifacts, and
`work/phase-7-5-4a/browser-{worker,unified,glb}.txt`,
`browser-{worker,unified}.png`, `browser-base.stl`.
Logs: `/tmp/phase754a-{benchmark,lens,lens-diagnostics,fixture-diagnostics,focused,quick,check,final-check,browser,lifecycle,harness-validation,harness-final}.log`.
The test browser also created its explicitly downloaded disposable `Base (3).stl`
in Downloads; the copy used for independent parsing is in the ignored work folder.
