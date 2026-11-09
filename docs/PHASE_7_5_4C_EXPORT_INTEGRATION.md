# Phase 7.5.4c — Export production integration — 2026-11-09

The active repository is `/Users/brettjames/development/vrappPOC`; the conversation
working directory contains the lens SCAD reference and is not a Git checkout.
Initial status already contained the uncommitted 7.5.4a/b reports, harnesses, tests,
status/roadmap changes and experimental exporter changes. Those were reviewed and
retained. This phase changes their defaults only after the exact-path evidence,
adds the production matrix/worker parity regression and records acceptance below.

## Decision and scope

Promote the exact evaluated-STL chunk precompaction path from 7.5.4b. The default
`optimisedChunks` argument is now true in `prepareBooleanExport` and
`compactPlanarSources`. It removes per-corner typed-array view allocation, unused
local edge-report computation and unused output colour copies, and stops inner
planar passes after the first unchanged pass. Each successful one-ring replacement
removes exactly two faces; an unchanged count means the next deterministic pass
has the same geometry and normals. Public optimiser reports still compute edge
statistics. The final physical Float32 STL topology validator still runs.

This changes processing cost, not the evaluated surface or reduction policy. Dense
ordered SDF sampling, marching tetrahedra, gradient normals, planar eligibility,
chunk boundaries, the twelve-pass outer cap and last-stable-chunk rollback remain.
GLB preparation and colour/seam processing are unchanged. No raw primitive mesh,
smoothing, adaptive extractor or indexed/slab extractor replaces the SDF output.
No dependency, project schema, export control or Undo operation is added.

The offline QEM experiment remains disabled. The 50% target failed physical or
topology gates; even conservative targets failed dense organic section checks.
Mechanical-only sampled successes do not justify automatic lossy reduction of
sculptures, clearances or cavities. See the [completed experiment review](PHASE_7_5_4B_EXPORT_EXPERIMENT.md)
and [baseline methodology](PHASE_7_5_4A_EXPORT_BENCHMARK.md).

## Fallback and rollback

Pass `false` as the eighth argument of `prepareBooleanExport` to use the original
chunk pipeline, or as the fourth argument of `compactPlanarSources` for direct
callers. For a global source rollback, change both `optimisedChunks = true`
defaults to false and rebuild. No project migration or Undo is required. The paired
harness passes explicit true/false and keeps exercising the original pipeline.
Both modes retain last-stable-chunk rollback on a collapsed sliver. Cancellation,
stale revision, memory refusal and topology failure remain failures; an automatic
retry must not hide them or spend the budget twice.

All existing limits remain: 256 MiB default / 512 MiB maximum, 1M intermediate,
600k final STL validation, quality-specific encoder limits, 64M per-stage / 256M
total evaluation work and 192³/256³ caps. The admission budget is not a process-RSS
ceiling. STL remains millimetres and GLB metres; calibration and explicit target
size overrides follow the existing physical-units path.

## Reproduction

```sh
# Serial original/optimised pairs; two exports per fresh process and quality.
node scripts/benchmark-export-experiment.mjs --production-matrix
node scripts/benchmark-export-experiment.mjs --production-matrix --reverse work/phase-7-5-4a/input/lensbenchmark.form
node scripts/benchmark-export-experiment.mjs --production-matrix --enclosure-only
npm run test:quick
npm test -- export-experiment export-quality export-sizing export-resolution staged-boolean-export export-benchmark
npm run check
node scripts/export-browser-smoke.mjs
node scripts/export-lifecycle-smoke.mjs
```

`experimentalChunk` in research JSON is retained for compatibility: false means
original and true means promoted. Normal diagnostic runs now follow the production
default unless that field is explicitly supplied. The production matrix compares
Fast and High at requested caps 192 and 256 for coarse organic clay, dense curved
SDF, ordered Boolean/array cutters, synthetic holder, a hollow enclosure and the
read-only native Lens fixture. Effective grids may be below the cap. A filename search of both workspaces/Downloads and a read-only metadata scan of
31 Downloads native projects found no identifiable Astra file; no Astra performance or appearance result is claimed.

The harness asserts identical hashes and final reports across both modes and both
repeats, plus native serialization/Undo/Redo preservation and input-copy hashes.
It independently reloads STL, measures bounds and evaluates all vertices and face
centroids against the composed field in calibrated millimetres. Byte equality
establishes zero added surface deviation between paths, including every cavity
and wall represented by the baseline; it does not certify baseline source fit or
features smaller than the sampling grid. Absolute field residual is not Hausdorff
distance. Blocking Fast clay remains diagnostic evidence, never printable success.
Peak RSS is cumulative across a cold/warm process pair and includes diagnostic
reload/probes; derived bytes and stage memory snapshots are separately recorded.
No worker peak-memory or Quest claim follows from Node RSS.

## Source-sampling limitation found during validation

The first enclosure definition was a 180 × 100 × 80 mm open box with a 170 × 90 ×
80 mm cutter offset 5 mm in Z (5 mm walls/floor). The existing source-feature
heuristic selected 28³ / 7.852 mm spacing, and both paths produced no triangles
and refused physical sizing. All 16 attempts are retained in
`work/phase-7-5-4c/run-YNxHAq/rows.json`. This is an existing thin-wall sampling
limitation, not a compactor success, and no file was published. A second enclosure
adds an 8 × 8 × 16 mm floor mounting opening, which requests finer sampling through
the existing feature heuristic. Its measurements are reported separately below.
Do not infer a general thin-wall/clearance guarantee from the latter passing.

## Validation results

Node v26.8.1, macOS arm64 / Apple M5 Pro, serial processes, 512 MiB existing
research budget, no concurrent test suite. Each mode gets one fresh process with
one measured cold export and one same-process warm export using fresh editors.
Fixtures/enclosure run original then promoted; Lens reverses the order. This is a
matched comparison, not a speedup distribution or target-device memory proof.

All **96 main attempts / 24 fixture-cap-quality cases** passed exact hash/report,
bounds, residual, source serialization and history parity checks. The separate
16 coarse-enclosure failures also preserved source/history and matched refusal
messages. Cold/warm timings exclude diagnostic reloads, source setup, file writes,
SHA-256 and field probes. The RSS columns show cold / cumulative warm process
high-water marks; they include diagnostics. The largest observed main-matrix peak
was 985.5 MiB (original dense curved High warm); the promoted path reached
748.7 MiB on that case. Some other promoted cases had higher RSS, so this is not
evidence of a lower guaranteed peak. Tracked derived byte counts, available encoder
workspace and heap/array-buffer snapshots are in every raw row.

Warm dense curved 192 Fast improved 20.8%, High 12.2%; native Lens 256 Fast 4.8%,
High 6.3%. Final triangle counts and STL bytes are identical, so added physical
surface deviation between pipelines is exactly **0 mm** for emitted comparisons.
Absolute source-field residuals remain those of the original sampled exporter,
including Lens 0.892 mm at 256 and enclosure 0.333 mm at evaluated 230³. These are
not claims of those Euclidean fitting tolerances.

| Model / requested cap / quality | Total cold / warm ms original → promoted | Warm precompact ms original → promoted | Raw → prepared → final faces | Peak RSS MiB original → promoted |
| --- | --- | --- | --- | --- | --- |
| clay / 192 / fast | 454.8 / 424.2 → 351.8 / 327.6 | 199.1 → 104.8 | 34,048 → 34,036 → 34,036 | 205.6 / 236.4 → 202.5 / 250.8 |
| clay / 192 / high | 696.3 / 648.5 → 616.7 / 593.5 | 188.0 → 107.4 | 34,048 → 34,036 → 34,028 | 240.8 / 256.9 → 241.5 / 249.7 |
| clay / 256 / fast | 434.0 / 426.4 → 360.3 / 326.2 | 193.4 → 110.0 | 34,048 → 34,036 → 34,036 | 196.4 / 246.5 → 210.5 / 226.5 |
| clay / 256 / high | 700.4 / 736.9 → 604.9 / 544.8 | 197.3 → 110.2 | 34,048 → 34,036 → 34,028 | 232.9 / 263.4 → 235.3 / 251.0 |
| boolean-array / 192 / fast | 4,262.9 / 4,140.0 → 3,807.1 / 3,769.5 | 3,464.2 → 3,071.6 | 107,608 → 48,288 → 48,288 | 265.4 / 272.4 → 259.1 / 266.4 |
| boolean-array / 192 / high | 4,656.6 / 4,500.7 → 4,210.2 / 4,361.9 | 3,451.7 → 3,291.2 | 107,608 → 48,288 → 43,940 | 277.0 / 305.3 → 274.7 / 319.1 |
| boolean-array / 256 / fast | 4,124.7 / 4,213.3 → 3,773.2 / 3,742.8 | 3,571.2 → 3,047.2 | 107,608 → 48,288 → 48,288 | 229.1 / 239.6 → 262.3 / 273.0 |
| boolean-array / 256 / high | 4,783.3 / 4,526.7 → 4,177.0 / 4,133.1 | 3,471.6 → 3,087.4 | 107,608 → 48,288 → 43,940 | 281.3 / 323.0 → 277.8 / 322.0 |
| curved-192 / 192 / fast | 3,700.0 / 3,771.5 → 3,013.5 / 2,987.2 | 1,380.3 → 678.4 | 293,776 → 293,776 → 293,776 | 452.5 / 501.7 → 474.6 / 534.7 |
| curved-192 / 192 / high | 6,654.3 / 6,801.4 → 6,141.5 / 5,969.2 | 1,489.9 → 728.5 | 293,776 → 293,776 → 293,776 | 731.8 / 985.5 → 701.9 / 748.7 |
| curved-192 / 256 / fast | 4,149.2 / 4,297.0 → 3,493.4 / 3,614.3 | 1,455.9 → 746.5 | 306,312 → 306,312 → 306,312 | 456.5 / 534.4 → 461.0 / 536.3 |
| curved-192 / 256 / high | REFUSED identically | 1,410.8 → 757.7 | 306,312 → 306,312 → refused | 362.2 / 439.2 → 381.7 / 481.5 |
| holder-443 / 192 / fast | 11,479.3 / 11,599.9 → 10,492.4 / 10,559.2 | 8,723.8 → 7,747.9 | 358,188 → 103,128 → 103,128 | 296.1 / 324.9 → 285.7 / 314.6 |
| holder-443 / 192 / high | 12,410.8 / 12,288.7 → 11,236.9 / 11,352.0 | 8,586.4 → 7,664.0 | 358,188 → 103,128 → 81,708 | 401.8 / 442.6 → 355.2 / 439.0 |
| holder-443 / 256 / fast | 21,281.2 / 20,870.8 → 19,723.8 / 19,405.2 | 14,489.9 → 12,703.3 | 661,728 → 153,860 → 153,860 | 410.3 / 472.5 → 407.8 / 470.6 |
| holder-443 / 256 / high | 22,492.4 / 22,469.5 → 20,832.0 / 20,786.3 | 14,465.3 → 12,689.4 | 661,728 → 153,860 → 111,312 | 490.9 / 586.5 → 543.1 / 559.8 |
| Lens / 192 / fast | 11,017.2 / 10,928.7 → 10,180.6 / 10,172.8 | 7,050.0 → 6,254.9 | 201,308 → 89,018 → 89,018 | 337.2 / 375.8 → 335.9 / 378.2 |
| Lens / 192 / high | 11,567.9 / 11,914.0 → 10,788.7 / 10,958.5 | 7,000.0 → 6,175.0 | 201,308 → 89,018 → 79,566 | 400.1 / 556.6 → 404.0 / 473.6 |
| Lens / 256 / fast | 19,477.0 / 19,626.2 → 18,222.8 / 18,681.1 | 10,195.1 → 9,040.5 | 363,540 → 129,168 → 129,168 | 404.7 / 495.8 → 398.2 / 490.9 |
| Lens / 256 / high | 20,673.4 / 20,967.8 → 19,504.7 / 19,641.0 | 10,451.2 → 9,192.9 | 363,540 → 129,168 → 110,420 | 536.0 / 692.5 → 512.0 / 663.6 |
| enclosure / 192 / fast | 19,869.3 / 19,678.9 → 17,830.9 / 17,814.9 | 16,763.3 → 14,934.0 | 927,464 → 152,952 → 152,952 | 351.9 / 392.9 → 349.7 / 426.0 |
| enclosure / 192 / high | 20,724.0 / 20,653.6 → 18,915.3 / 18,822.6 | 16,740.3 → 14,916.3 | 927,464 → 152,952 → 84,848 | 483.8 / 511.4 → 443.6 / 536.1 |
| enclosure / 256 / fast | 21,388.5 / 21,236.0 → 20,423.9 / 20,333.9 | 16,131.0 → 14,841.8 | 922,620 → 149,494 → 149,494 | 427.7 / 493.9 → 360.0 / 447.3 |
| enclosure / 256 / high | 23,253.0 / 22,945.0 → 21,179.3 / 20,945.6 | 16,545.3 → 14,562.7 | 922,620 → 149,494 → 72,424 | 470.0 / 543.9 → 479.4 / 517.0 |

| Model / cap / quality | Warm sample / mesh / extract / optimise / validate / encode ms, original → promoted |
| --- | --- |
| clay / 192 / fast | 13.3 / 29.2 / 0.1 / 0.5 / 66.4 / 4.9 → 16.5 / 23.8 / 0.1 / 0.5 / 68.5 / 4.8 |
| clay / 192 / high | 13.4 / 24.0 / 0.1 / 232.3 / 75.4 / 4.9 → 13.4 / 32.2 / 0.1 / 252.6 / 73.7 / 4.9 |
| clay / 256 / fast | 15.8 / 24.4 / 0.1 / 0.6 / 79.1 / 4.8 → 13.1 / 30.7 / 0.1 / 0.4 / 61.3 / 4.8 |
| clay / 256 / high | 14.0 / 24.5 / 0.2 / 304.8 / 79.2 / 4.8 → 13.0 / 23.4 / 0.1 / 223.5 / 63.6 / 1.8 |
| boolean-array / 192 / fast | 208.2 / 99.1 / 0.2 / 0.5 / 98.3 / 6.6 → 230.1 / 102.2 / 0.3 / 0.6 / 97.7 / 5.5 |
| boolean-array / 192 / high | 224.2 / 84.6 / 0.6 / 386.8 / 90.0 / 2.0 → 225.9 / 79.4 / 0.1 / 409.0 / 86.5 / 6.7 |
| boolean-array / 256 / fast | 208.1 / 83.4 / 0.3 / 0.5 / 85.7 / 6.9 → 230.6 / 99.8 / 0.3 / 0.6 / 98.4 / 6.9 |
| boolean-array / 256 / high | 225.9 / 85.6 / 0.2 / 390.4 / 90.6 / 0.8 → 228.3 / 79.5 / 0.2 / 382.8 / 92.9 / 0.8 |
| curved-192 / 192 / fast | 193.8 / 368.9 / 0.9 / 4.1 / 550.5 / 8.0 → 192.8 / 331.0 / 0.3 / 2.8 / 534.2 / 7.8 |
| curved-192 / 192 / high | 193.0 / 382.0 / 0.8 / 2,920.6 / 542.3 / 7.7 → 194.4 / 377.5 / 0.7 / 2,842.5 / 550.7 / 7.8 |
| curved-192 / 256 / fast | 232.9 / 379.1 / 0.9 / 4.3 / 575.4 / 8.4 → 202.6 / 407.8 / 1.0 / 3.2 / 593.2 / 8.0 |
| holder-443 / 192 / fast | 846.3 / 370.5 / 1.2 / 1.3 / 194.5 / 3.1 → 829.5 / 357.8 / 0.9 / 1.1 / 181.9 / 3.1 |
| holder-443 / 192 / high | 837.2 / 407.4 / 1.0 / 870.8 / 135.2 / 1.4 → 872.4 / 348.1 / 1.7 / 883.6 / 137.9 / 2.7 |
| holder-443 / 256 / fast | 1,891.6 / 655.9 / 0.8 / 1.7 / 271.7 / 4.4 → 1,932.3 / 744.2 / 2.0 / 1.7 / 273.1 / 3.9 |
| holder-443 / 256 / high | 1,912.2 / 784.9 / 1.6 / 1,380.2 / 184.7 / 3.2 → 1,943.1 / 689.6 / 1.6 / 1,431.6 / 196.2 / 3.0 |
| Lens / 192 / fast | 1,732.8 / 241.5 / 1.0 / 1.0 / 158.9 / 2.8 → 1,756.5 / 212.7 / 1.2 / 0.9 / 159.9 / 2.8 |
| Lens / 192 / high | 1,887.4 / 243.0 / 1.1 / 730.6 / 130.2 / 2.5 → 1,797.9 / 216.0 / 0.4 / 778.6 / 134.4 / 1.5 |
| Lens / 256 / fast | 4,212.5 / 518.9 / 3.3 / 1.5 / 224.5 / 3.6 → 4,393.9 / 523.1 / 1.4 / 1.3 / 224.4 / 3.5 |
| Lens / 256 / high | 4,205.1 / 518.2 / 1.9 / 1,133.9 / 201.2 / 2.0 → 4,180.5 / 521.9 / 1.8 / 1,087.2 / 186.6 / 3.0 |
| enclosure / 192 / fast | 509.2 / 754.4 / 0.8 / 1.6 / 275.2 / 4.3 → 512.0 / 744.3 / 0.7 / 1.7 / 270.9 / 3.8 |
| enclosure / 192 / high | 541.7 / 722.6 / 0.9 / 1,128.6 / 140.1 / 1.5 → 545.5 / 737.0 / 0.4 / 1,142.0 / 135.6 / 2.7 |
| enclosure / 256 / fast | 894.4 / 957.7 / 1.1 / 1.9 / 276.1 / 4.1 → 917.0 / 983.1 / 1.4 / 2.0 / 288.5 / 4.8 |
| enclosure / 256 / high | 940.2 / 967.6 / 0.8 / 1,141.8 / 127.1 / 1.4 → 936.2 / 929.0 / 1.3 / 1,077.0 / 127.1 / 1.4 |

| Model / cap / quality | Evaluated grid | XYZ mm | Max absolute field residual mm | Final topology |
| --- | --- | --- | --- | --- |
| clay / 192 / fast | 69³ | 187.720 × 169.984 × 170.000 | 0.090061 | 8 degenerate triangles.; 10 non-manifold edges. |
| clay / 192 / high | 69³ | 187.720 × 169.984 × 170.000 | 0.090061 | clean; 1 component(s) |
| clay / 256 / fast | 69³ | 187.720 × 169.984 × 170.000 | 0.090061 | 8 degenerate triangles.; 10 non-manifold edges. |
| clay / 256 / high | 69³ | 187.720 × 169.984 × 170.000 | 0.090061 | clean; 1 component(s) |
| boolean-array / 192 / fast | 104³ | 443.000 × 98.000 × 150.000 | 1.653687 | clean; 1 component(s) |
| boolean-array / 192 / high | 104³ | 443.000 × 98.000 × 150.000 | 1.653687 | clean; 1 component(s) |
| boolean-array / 256 / fast | 104³ | 443.000 × 98.000 × 150.000 | 1.653687 | clean; 1 component(s) |
| boolean-array / 256 / high | 104³ | 443.000 × 98.000 × 150.000 | 1.653687 | clean; 1 component(s) |
| curved-192 / 192 / fast | 192³ | 187.687 × 169.985 × 169.989 | 0.032137 | clean; 1 component(s) |
| curved-192 / 192 / high | 192³ | 187.687 × 169.985 × 169.989 | 0.032137 | clean; 1 component(s) |
| curved-192 / 256 / fast | 196³ | 187.715 × 169.988 × 169.990 | 0.010111 | clean; 1 component(s) |
| curved-192 / 256 / high | 196³ | No file | — | Too many triangles for high export (306312; limit 300000). Choose Fast or export fewer layers. Your model is unchanged. |
| holder-443 / 192 / fast | 192³ | 443.000 × 98.000 × 150.000 | 0.972257 | clean; 1 component(s) |
| holder-443 / 192 / high | 192³ | 443.000 × 98.000 × 150.000 | 0.972257 | clean; 1 component(s) |
| holder-443 / 256 / fast | 252³ | 443.000 × 98.000 × 150.000 | 0.719496 | clean; 1 component(s) |
| holder-443 / 256 / high | 252³ | 443.000 × 98.000 × 150.000 | 0.719496 | clean; 1 component(s) |
| Lens / 192 / fast | 192³ | 450.000 × 59.000 × 70.000 | 1.158783 | clean; 1 component(s) |
| Lens / 192 / high | 192³ | 450.000 × 59.000 × 70.000 | 1.158783 | clean; 1 component(s) |
| Lens / 256 / fast | 256³ | 450.000 × 59.000 × 70.000 | 0.891753 | clean; 1 component(s) |
| Lens / 256 / high | 256³ | 450.000 × 59.000 × 70.000 | 0.891753 | clean; 1 component(s) |
| enclosure / 192 / fast | 192³ | 180.000 × 100.000 × 80.000 | 0.416419 | clean; 1 component(s) |
| enclosure / 192 / high | 192³ | 180.000 × 100.000 × 80.000 | 0.416419 | clean; 1 component(s) |
| enclosure / 256 / fast | 230³ | 180.000 × 100.000 × 80.000 | 0.333335 | clean; 1 component(s) |
| enclosure / 256 / high | 230³ | 180.000 × 100.000 × 80.000 | 0.333335 | clean; 1 component(s) |


Preparation wall time and all compute counters are retained in the raw JSON;
sample/mesh compute timings do not sum to preparation wall time. The table lists
precompaction separately because that is the promoted bottleneck. Sizing,
admission, yields and coordinate transforms are included in total but not all
individual counters.

## Visual and geometry acceptance

All six representative High pairs (organic, dense curved, array, holder, Lens and
mounting-opening enclosure) produced identical three-view 300² silhouette masks.
Curved, Lens and enclosure PNGs were visually inspected: the organic rounded form,
mechanical profile and enclosure opening remain. Interior pockets can be occluded
in silhouettes. Byte identity also covers encoded normals and all hidden triangles;
this establishes no added geometric/visual change, not a new wall-thickness,
self-intersection or printer-fit certification. Baseline/source absolute accuracy
limitations remain explicit above.

## Automated and browser acceptance

- Quick suite: **21/21**. Focused export/worker/sizing/resolution/staged/benchmark
  suite: **38/38**, including exact original/default chunk buffers on transformed,
  multipart, painted-input, grooved and thin-stroke fixtures; real worker STL bytes
  match direct original encoding at an intentional 237 mm target. Source buffers
  remain intact after transfer. Existing tests cover GLB metre round trips,
  cancellation during work/packing, stale revisions, simulated exhausted admission,
  topology failures, retry and source/history preservation.
- `npm run check`: Biome formatting/lint (existing warnings), strict TypeScript,
  production Vite build and **1,680/1,680 tests passed**, zero failures/skips/
  cancellations, 105.27 s test wall. The first restricted run failed four local
  server tests with `listen EPERM 127.0.0.1`; the permitted rerun passed all tests.
- Both dedicated Chromium scripts passed after permitted launch. Export smoke
  independently parsed actual 1:1/200 mm/100 mm STL and metre-calibrated GLB
  downloads; checked planar cube Fast 29,292 → High 18,132 at 300 mm and oblique
  cube 169,480 → 92,440 with matching bounds/Undo, clean print report and recorded
  round-off bound. Injected worker optimisation/memory failure displayed stage,
  cause and alert semantics with no download. Lifecycle smoke passed High unified
  download through blur/hidden, explicit Cancel/Escape, real interruption handling
  and unchanged Undo. Initial restricted Chromium startup failed on macOS Mach
  port permission; those attempts did not reach UI assertions.
- A fresh in-app browser on port 5241 ran the isolated comparison through the
  **actual export worker**, four exports per case in original/promoted/promoted/
  original order. All **16 exports** had clean blocking topology, identical hashes
  within each case and unchanged native serialization/Undo/Redo. Small High used
  the normal 256 MiB budget; dense cases used the existing 512 MiB choice. This
  measures main-thread SDF/precompaction plus worker snapshot/encoding and
  cooperative scheduling, excluding source setup, native preservation comparisons
  and output digest. The host had no test suite running during these comparisons.
  Browser process peak RSS was unavailable.

| Browser fixture / cap / quality | Original totals ms (two observations) | Promoted totals ms | Original precompact ms | Promoted precompact ms | Faces |
| --- | --- | --- | --- | --- | --- |
| small organic / 192 / High | 1424.9, 1422.9 | 1274.9, 1209.1 | 365.7, 387.4 | 223.0, 211.6 | 34,028 |
| dense curved / 192 / Fast | 9182.8, 11252.6 | 8796.8, 8956.7 | 2789.7, 4071.2 | 1760.2, 1910.8 | 293,776 |
| dense curved / 192 / High | 17183.1, 16993.7 | 14694.9, 14667.4 | 4146.6, 4154.8 | 1786.2, 1833.6 | 293,776 |
| dense curved / 256 / Fast | 12750.8, 14255.6 | 10255.7, 11119.7 | 4273.0, 5030.9 | 1868.9, 2122.6 | 306,312 |

These are two observations per path, not population medians. Small browser hash:
`5a64fcc9fbb2a6eba9dd1d4bcb0a1291126a6873b6ac35b2e83549ec68751cbf`;
dense 192 Fast/High hash:
`e2a959597b4c47373d2c127b0d9b88aec9cd2a7f08910816069d843828900abf`;
dense cap-256 Fast hash:
`2c65c11228b63459ffa970ac9caf3dae7a9dcc65aa49f6d5ad22b4921230e29f`.
The dense cap-256 High refusal is recorded in the main matrix, not bypassed in
this browser page. No target Quest/phone, slicer, physical print or heavy Astra
acceptance is claimed. Actual OS OOM was not induced; allocation/admission failure
and worker failure publication paths are covered without raising limits.

## Evidence

Main raw rows/artifacts: `work/phase-7-5-4c/run-0bpDCh` (64 fixture attempts),
`run-SS6zc4` (16 reverse-order native Lens attempts), `run-8Ae1G4` (16 enclosure
with mounting-opening attempts). Combined asserted rows/table are in
`work/phase-7-5-4c/{combined.json,comparison.md}`. Mode directories contain the
actual STL and wireframe SVG; root rows contain raw timing/geometry/RSS. Representative High
mode directories also contain `silhouette.png`. Coarse unresolved enclosure rows
remain separately in `run-YNxHAq`.

Lens original and write-disabled copy retain SHA-256
`ff59de49002bde1f97771e8b1c52de7b401d3e7f4faf50bf31325803c0b8c855`.


Browser rounded visible-result readback: `work/phase-7-5-4c/browser-comparison.json`.
Chromium artifacts/screenshots: `work/phase-7-5-2/browser-*`. Logs:
`/tmp/754c-{fixtures,lens,enclosure,enclosure-detail,comparison,visual,focused,check,check-unrestricted,browser,browser-unrestricted,lifecycle,lifecycle-unrestricted}.log`.
No commit, push or merge was performed.


## Lens visible-STL routing correction

User testing found a route not covered by the original acceptance matrix: High
STL, All visible layers, SDF detail 256. The original native Lens project has
ordered difference layers without live modifier/array flags. That route borrowed
individual committed primitive shells instead of evaluating the ordered SDF;
all three presets emitted only 96 triangles including subtraction cutters. Final
validation found exactly 12 non-manifold edges and correctly blocked publication.
The selected SDF cap was unused on that committed-surface path. This reproduces
the user's error and is independent of the promoted chunk compactor: the failing
route never called it. The 7.5.4a/b/c native matrices above used Unified Boolean;
their clean results did not validate this All visible layers button.

Visible STL now routes visible ordered difference/intersection layers through
`prepareBooleanExport`, sharing Unified Boolean's evaluator, sizing, cap, memory,
compaction and final validation. Pure additive separate-layer exports, selected
layer, visible GLB and assembly dispatch retain their existing semantics. Hidden
cutters alone do not trigger this route. Estimates mark the evaluated count unknown
and the prepared summary identifies evaluated SDF. The modal explains that visible
STL applies layer subtraction/intersection. No mesh repair, automatic tolerance
increase, raw-primitive substitution or weakening of continuity checks is used.

A policy regression covers visible STL vs selected/GLB, hidden cutters and
intersection. `scripts/export-native-browser-smoke.mjs` exercises the actual UI on
a write-disabled Lens copy in a disposable Chromium profile: High visible STL at
192/256, byte equality with Unified Boolean at 256, intentional 200 mm target,
independent STL topology/bounds checks, input-file/native download/history
preservation. Run `npm run build` first, then
`node scripts/export-native-browser-smoke.mjs work/phase-7-5-4a/input/lensbenchmark.form`.
The script uses Vite preview of the existing production build, not a live user editor.

Follow-up acceptance:

- Quick 21/21 and focused resolution/estimate 5/5 passed. Full formatting/lint,
  strict TypeScript, production build and **1,681/1,681 tests** passed with no
  failures/skips/cancellations (187.08 s test wall). A lint issue in the new harness
  and a TypeScript narrowing issue were corrected before the passing full run.
- Production Chromium run `work/lens-visible-repro/browser-A93lWU/rows.json` passed
  all four actual UI downloads at the normal **256 MiB** budget. Visible High
  192/256: **79,566 / 110,420** triangles; both approximately **450 × 59 × 70 mm**,
  one outward component, zero boundary/non-manifold/inconsistent/degenerate faces
  or edges. At 256, visible and Unified Boolean files are byte-identical, SHA-256
  `cf84258248fedd53dc70d0ecce432da704870f7c7add4b51eae5017a728bc4d7`.
  At 192 the visible hash is
  `46f4957b5a844f88f4fc5ea098b4748fba3612623ea8054ad908a2d92fd39276`.
  Both also match the earlier native Unified benchmark outputs, extending their
  geometry/probe evidence to the corrected visible route.
- The 200 mm target passed at 256 High with 110,420 triangles, clean checked
  topology and approximately **200 × 26.222 × 31.111 mm** bounds. Before/after
  native downloads are byte-identical and history is unchanged. Original Downloads
  file and read-only input retain the recorded `ff59de49…c855` hash.
- An initial dev-browser attempt overlapped source edits and timed out. A second
  dev run produced the two valid visible files but later returned to a starter
  scene and timed out during repetition. Those runs are not counted as complete
  acceptance; the fully passing production-preview run avoids dev reload and
  records main-frame navigations/page errors/crashes. No reset was reproduced in
  that production run. Logs: `/tmp/lens-{visible-repro,route-focused,visible-check,
  native-browser,native-browser-final,native-browser-production,visible-final-quick}.log`.
  `visible-target.png` and before/after native copies are beside the passing rows.
  These checks are correctness smoke tests, not export performance benchmarks.

No project migration, mesh repair, threshold/limit increase, source field change,
commit, push or merge was made. The exact-compaction rollback above does not revert
this separate routing correction.


## Interactive preview follow-up

A recovered ten-layer Lens scene exceeded the unchanged 64M preview work guard
(70,778,880 at 192³), although the saved nine-layer benchmark fits (63,700,992).
The layer display cache now opts into `boundedPreview`; it selects the highest
resolution fitting 64M actual sampler calls and reports reduced preview detail.
Ten sources render at 185³ (63,316,250 calls). Hidden roots are excluded only when
the evaluator excludes them; enabled hidden operands, every shared reference and
array instance are counted. No source field is skipped or changed. Ordinary strict
compositors/Bake and staged export retain their existing admission and grid choices;
this option is not used for printable/export geometry. Memory, work, intermediate
mesh and project limits are unchanged.

The final status is deliberately concise: **Boolean preview · 185³ · Reduced
detail**. It no longer prints voxel size, compute timings, chunk counts or budget
prose in the normal layer-view hint. Actual preview resolution remains explicit.

Verification: quick 21/21, two new work/field/preservation policy regressions,
full format/lint/strict types/build and 1,683/1,683 tests passed. After wording and
release notes, final quick and strict/build passed again. Native nine/ten-layer
copies passed 4,096 sampled field checks and serialization/history preservation;
preview counts 103,336 at 192³ / 97,128 at 185³ are not print topology acceptance.
Production browser verified ready/cached short labels, 128³ selection, retained
256³ export detail and unchanged history/input bytes. See
`work/lens-preview-repro/{native-preview.json,browser-preview.json,preview-short.png}`
and `/tmp/preview-budget-*.log`. No commit/push/merge.


## Explicit opt-in curved reduction — 2026-11-10 follow-up

The user requested a guarded experimental checkbox in Advanced. This supersedes
“offline only” for the default-off STL mode described in
[Optional curved STL reduction](EXPERIMENTAL_CURVED_EXPORT.md). It does not promote
automatic/general curved decimation or relax existing limits. File type and preset
are in the top row, actual sizing is a switch below, tolerance is in physical mm,
and results use ✓ applied / ✕ fallback with the reason. Full 1,693 tests and actual
production desktop/mobile, baseline unit/format/planar, failure and lifecycle
browser checks passed. Remaining failed geometry/work/memory candidates retain the
original, including the current Lens comparisons. Uncheck to revert this mode.
