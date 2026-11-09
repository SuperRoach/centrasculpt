# Phase 7.5.4b — Experimental export optimisation

## Decision

Keep the existing exporter as the default. Carry the byte-preserving STL chunk experiment into 7.5.4c worker validation. Retain experimental decimation as an offline comparison against the exact export. The largest polygon reductions failed physical or topology checks.

## Inputs and measurement

The active checkout is vrappPOC. The preceding benchmark report, both raw JSON matrices (64 fixture and 32 Lens attempts), decoded artifacts and harness were present. Phase 7.5.4a had reliable repeated fresh-process measurements including 192³ and 256³ Lens runs. Its discarded process warmed OS caches only. This experiment adds a measured first run and a second export in the same Node process, each using a fresh disposable editor. All export timings exclude diagnostic reloads, field probes, file writes and source setup. Peak process RSS includes those activities and is cumulative across a pair. Tracked derived storage is a different metric. Observations are single trials per order and thermal load can vary.

Research uses the existing 512 MiB maximum with all production admission checks. The first run order was production then experimental. Some initial observations overlapped with separate tests and diagnostic jobs. Use the reverse-order quiet series for the main timing comparison. Fast STL isolates chunk work. The previous High STL outputs supply a stricter starting point for the separate curved experiment. Neither prototype runs through the product UI. All generated meshes and measurements live under ignored work directories. Original exports are only read. The Lens copy is write-disabled. Its calibration is 100 mm/model unit. No identifiable native Astra project was available.

## Experiment A — precompaction

The 7.5.4a Lens 256³ Fast median spent 10.52 s in chunk precompaction, 4.08 s in field sampling and 1.5 ms in source extraction. Within precompaction the existing loop recreates small typed-array views twice per expanded corner. The High cleaner computes a local edge report the compactor immediately discards and may repeat a planar pass after its input stops changing. The experimental flag skips those unused edge counts and output colour copies on the STL-only chunk path, copies XYZ scalars directly and stops the inner loop on the first pass with no reduction. Every successful one-ring replacement removes two faces. Final mm-coordinate topology validation, last-stable-chunk rollback, repeated outer passes, admission, work checkpoints and Float32 normals and positions still use the existing path. The test does not attribute a separate speedup to any one change. It does not retain a global index.

| Case / cap | Mode | Grid | Total cold / warm ms | Precompact cold / warm ms | Peak RSS cold / warm MiB | Warm CPU ms | Raw → final faces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| clay 192 | production | 69³ | 491.0 / 473.5 | 235.9 / 221.9 | 189.4 / 242.9 | 430 | 34,048 → 34,036 |
| clay 192 | experiment | 69³ | 388.0 / 370.2 | 135.7 / 119.4 | 189.1 / 245.6 | 352 | 34,048 → 34,036 |
| boolean-array 192 | production | 104³ | 4,831.7 / 4,838.0 | 4,131.7 / 4,111.3 | 261.3 / 270.0 | 3,875 | 107,608 → 48,288 |
| boolean-array 192 | experiment | 104³ | 4,488.5 / 4,522.2 | 3,751.8 / 3,798.4 | 259.2 / 274.4 | 3,639 | 107,608 → 48,288 |
| curved-192 192 | production | 192³ | 3,972.4 / 4,023.2 | 1,608.5 / 1,596.5 | 493.2 / 559.3 | 2,737 | 293,776 → 293,776 |
| curved-192 192 | experiment | 192³ | 3,152.0 / 3,187.8 | 824.2 / 799.3 | 476.2 / 543.5 | 2,066 | 293,776 → 293,776 |
| holder-443 192 | production | 192³ | 13,583.2 / 13,325.7 | 10,631.4 / 10,395.8 | 285.7 / 322.2 | 9,694 | 358,188 → 103,128 |
| holder-443 192 | experiment | 192³ | 12,189.7 / 12,298.6 | 9,231.1 / 9,316.7 | 291.9 / 321.5 | 8,985 | 358,188 → 103,128 |
| holder-443 256 | production | 252³ | 23,432.2 / 23,912.8 | 16,778.8 / 17,290.4 | 376.0 / 468.4 | 17,024 | 661,728 → 153,860 |
| holder-443 256 | experiment | 252³ | 21,600.0 / 21,189.3 | 14,952.4 / 14,547.7 | 431.5 / 504.9 | 15,581 | 661,728 → 153,860 |
| Lens 192 | production | 192³ | 13,128.6 / 12,968.9 | 8,818.7 / 8,738.6 | 330.3 / 376.8 | 9,462 | 201,308 → 89,018 |
| Lens 192 | experiment | 192³ | 11,839.3 / 12,196.1 | 7,606.4 / 7,790.7 | 330.0 / 374.3 | 9,050 | 201,308 → 89,018 |
| Lens 256 | production | 256³ | 22,876.4 / 22,787.6 | 13,066.6 / 13,054.3 | 398.4 / 496.6 | 15,900 | 363,540 → 129,168 |
| Lens 256 | experiment | 256³ | 20,816.1 / 20,791.6 | 11,157.8 / 11,068.0 | 397.7 / 487.7 | 14,435 | 363,540 → 129,168 |

Warm substage measurements are independently timed. Sampling and meshing are compute counters inside preparation.

| Case | Mode | Prep wall ms | Sample ms | Mesh ms | Extract ms | Optimise ms | Validate ms | Encode ms | Tracked derived MiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| clay 192 | prod | 373.8 | 18.6 | 29.9 | 0.1 | 0.4 | 81.8 | 6.1 | 4.84 |
| clay 192 | exp | 266.2 | 18.4 | 27.4 | 0.1 | 0.5 | 85.5 | 5.5 | 4.84 |
| boolean-array 192 | prod | 4,710.9 | 247.2 | 96.8 | 0.3 | 1.0 | 109.6 | 0.9 | 15.97 |
| boolean-array 192 | exp | 4,396.5 | 241.1 | 96.8 | 0.2 | 0.8 | 108.2 | 1.0 | 15.97 |
| curved-192 192 | prod | 3,356.5 | 213.0 | 335.4 | 0.6 | 4.7 | 589.8 | 8.1 | 74.17 |
| curved-192 192 | exp | 2,529.0 | 216.7 | 314.3 | 0.4 | 2.8 | 584.9 | 7.4 | 74.17 |
| holder-443 192 | prod | 13,091.5 | 939.2 | 332.3 | 0.5 | 1.7 | 201.5 | 3.1 | 78.59 |
| holder-443 192 | exp | 12,074.8 | 929.0 | 394.2 | 0.6 | 1.4 | 192.7 | 2.3 | 78.59 |
| holder-443 256 | prod | 23,571.2 | 2,087.1 | 618.2 | 0.7 | 1.8 | 301.9 | 4.4 | 167.53 |
| holder-443 256 | exp | 20,849.4 | 2,096.6 | 616.5 | 1.2 | 2.7 | 295.8 | 4.5 | 167.53 |
| Lens 192 | prod | 12,770.4 | 1,918.3 | 221.5 | 0.5 | 1.0 | 172.0 | 1.7 | 67.82 |
| Lens 192 | exp | 11,989.7 | 2,061.5 | 224.3 | 0.5 | 1.1 | 176.9 | 3.2 | 67.82 |
| Lens 256 | prod | 22,501.6 | 4,551.3 | 432.7 | 1.0 | 1.4 | 250.2 | 3.5 | 152.96 |
| Lens 256 | exp | 20,508.0 | 4,573.4 | 418.4 | 0.8 | 2.3 | 245.4 | 3.8 | 152.96 |

Decoded Fast STL results. Hashes matched across all four outputs for every case. Thus the experiment also reproduced the existing blocked Fast clay defect. Its two open edges are additional to the blocking diagnostics below. Residual histogram bins are ≤0.01, (0.01, 0.05], (0.05, 0.1], (0.1, 1], and >1 mm. Every vertex and every centroid is probed against the composed field after reversing STL centring and calibration. Field magnitude can differ from Euclidean distance.

| Case | Dimensions mm | Max field residual mm | Residual histogram counts | Components | STL report |
| --- | --- | --- | --- | --- | --- |
| clay 192 | 187.720 × 169.984 × 170.000 | 0.090061 | 82762 / 47857 / 5525 / 0 / 0 | 1 | 8 degenerate triangles., 10 non-manifold edges. |
| boolean-array 192 | 443.000 × 98.000 × 150.000 | 1.653687 | 147759 / 7193 / 4454 / 32095 / 1651 | 1 | clean |
| curved-192 192 | 187.687 × 169.985 × 169.989 | 0.032137 | 1072995 / 102109 / 0 / 0 / 0 | 1 | clean |
| holder-443 192 | 443.000 × 98.000 × 150.000 | 0.972257 | 337381 / 10551 / 5271 / 59309 / 0 | 1 | clean |
| holder-443 256 | 443.000 × 98.000 × 150.000 | 0.719496 | 510689 / 36740 / 12151 / 55860 / 0 | 1 | clean |
| Lens 192 | 450.000 × 59.000 × 70.000 | 1.158783 | 274615 / 15778 / 6568 / 58836 / 275 | 1 | clean |
| Lens 256 | 450.000 × 59.000 × 70.000 | 0.891753 | 404035 / 30737 / 18001 / 63899 / 0 | 1 | clean |

## Experiment B — curved candidates

The offline harness reads binary STL in physical millimetres and caps input at 300,000 faces. It uses the installed meshoptimizer 0.22.0 WASM simplifier with absolute error, exact coordinate welding, border locks and a vertex lock mask. Vertices on global extrema or with an incident face normal more than 15° from their first face normal are locked. This is a conservative crease heuristic with traversal-order dependence. Positions come from the original vertex set. Shading normals can change light interpolation without changing geometric curvature. A sculpt Smooth operation changes the source field deliberately. Neither that operation nor resampling is part of these experiments.

The fixed research acceptance tolerance is 0.100 mm relative to the already evaluated STL. It is an experimental budget, and a mating part may require a tighter one. Target A requests 50% remaining faces with 0.100 mm solver error, B requests 90% with 0.010 mm solver error, and C requests 99% with 0.001 mm solver error for organic fixtures. The solver's error estimate is insufficient by itself. Each decision also requires:

- A closed single outward component at both ends, equal Euler characteristic and dimensions, zero degeneracies, inconsistent winding, boundary or non-manifold edges, and no blocking print diagnostics.
- Two directional sets of up to 4,096 point-to-triangle samples each. Each set includes a deterministic stride of original face vertices and centroids. A triangle bounding-box tree computes the nearest point on the opposite surface. The maximum and p95 are sampled distances in mm. Neither direction covers all points of its source surface.
- Zero changed pixels across three 300² silhouette masks in one common coordinate frame.
- Identical crossing counts on three 96² axis-aligned ray grids. Every matched depth and every successive crossing interval must agree within 0.100 mm. Intervals measure sampled material thickness, recess depth and gaps including hidden interiors. The probe refuses excessive intersection storage/work. A nearly tangent ray can amplify a small geometric displacement into a large depth difference. Thin slots between rays, oblique mating surfaces, self-intersections and vertex-only contacts remain possible. Passing proxies does not certify Hausdorff distance, minimum wall thickness or print fit.

| Input | Target | Source → candidate | Selected faces | Sample max mm forward / reverse | Max interval Δ mm | Changed rays / pixels | Edge report | Build + QEM ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Clay 192 | A | 34,028 → 17,014 | 34,028 | 0.1208 / 0.0952 | 1.4471 | 1 / 19 | clean | 35 |
| Curved 192 | A | 293,776 → 146,888 | 293,776 | 0.0587 / 0.0537 | 1.2941 | 2 / 7 | 2 non-manifold edges. | 244 |
| Holder 192 | A | 81,708 → 46,464 | 81,708 | 0.0990 / 0.0797 | 0.1697 | 0 / 0 | clean | 81 |
| Array 192 | A | 43,940 → 26,402 | 43,940 | 0.1024 / 0.0885 | 0.1072 | 0 / 0 | clean | 41 |
| Lens 192 | A | 79,566 → 45,400 | 79,566 | 0.0732 / 0.0317 | 0.1400 | 0 / 0 | clean | 73 |
| Lens 256 | A | 110,420 → 64,036 | 110,420 | 0.0885 / 0.0830 | 102.9226 | 1 / 0 | 1 non-manifold edges. | 107 |
| Clay 192 | B | 34,028 → 30,624 | 34,028 | 0.0831 / 0.0462 | 0.7222 | 1 / 4 | clean | 30 |
| Curved 192 | B | 293,776 → 264,398 | 293,776 | 0.0314 / 0.0131 | 0.3688 | 1 / 0 | clean | 228 |
| Holder 192 | B | 81,708 → 73,536 | 73,536 | 0.0351 / 0.0382 | 0.0154 | 0 / 0 | clean | 52 |
| Array 192 | B | 43,940 → 39,546 | 39,546 | 0.0807 / 0.0263 | 0.0057 | 0 / 0 | clean | 31 |
| Lens 192 | B | 79,566 → 71,608 | 71,608 | 0.0175 / 0.0134 | 0.0187 | 0 / 0 | clean | 48 |
| Lens 256 | B | 110,420 → 99,378 | 99,378 | 0.0037 / 0.0032 | 0.0058 | 0 / 0 | clean | 67 |
| Clay 192 | C | 34,028 → 33,686 | 33,686 | 0.0291 / 0.0135 | 0.0497 | 0 / 0 | clean | 38 |
| Curved 192 | C | 293,776 → 290,838 | 293,776 | 0.0079 / 0.0032 | 0.2705 | 1 / 0 | clean | 270 |

Selected counts include fallback. Four mechanical target-B candidates saved approximately 10% against production High, and target C saved 342 faces on coarse clay. Dense curved clay reverted at every tested target. The 102.923 mm Lens value measures the change in a ray interval. Grazing intersections or changed crossing correspondence can amplify that metric. Its cause requires local inspection. The full JSON includes p95, worst cases, counts and RSS. QEM process peak is cumulative across files and includes BVH, masks, probes and validation. These are offline timings. Gentle repeat candidate hashes and gate decisions matched in all six cases.

## Limits and next engineering work

| Existing limit | What the evidence establishes | 7.5.4c decision |
| --- | --- | --- |
| 600k final STL topology | The synthetic holder at cap 256 generates 661,728 raw faces, yet precompaction takes it below final admission. No accepted final mesh above 600k was validated. | Keep the limit. Prototype a two-pass global edge ledger for exact Float32-mm vertex pairs, orientation and component checks before considering streamed publication. |
| ~1M intermediate | No tested mesh crosses it. Unindexed positions and normals cost 72 bytes per raw face before transient storage. Local changes do not reduce raw triangle count. | Test indexed extraction with canonical lattice-edge keys and bounded slab ownership. Measure duplicate crossings, seam correspondence, gradient normals, peak index size and cancellation cleanup. |
| 64M work per stage / 256M total | Repeated ordered CSG evaluations incur real sampling cost at 256³. None of these matched cases proves either work allowance excessive. | Retain separate accounting for ordered operands and array instances. Require an adversarial near-limit case and cancellation latency before making a change. |
| 192³ / 256³ caps | Effective grid depends on source content. Higher Lens resolution improved the previous field-residual maximum from 1.159 to 0.892 mm but still misses a 0.1 mm absolute source-fit claim. | Use an explicit physical tolerance and feature sizes when deciding if refinement is warranted. Reject unaffordable requests. |
| Memory and quality admission | Phase 7.5.4a Lens High GLB 256 refused 363,540 input faces at its 300k limit. Curved High GLB exceeded available workspace. Process RSS can exceed 512 MiB; lowering wall time alone cannot justify a cap increase. | Track worker peak, transient JS maps, typed arrays, source snapshots, transferred output and aborted runs on the target browser. Retain colour seams and GLB metre transforms. |

Adaptive octree extraction would chiefly target sampling and raw mesh size. The largest STL cost here is later compaction. A cell with equal-sign corners can still enclose a thin feature or a Boolean cavity. A future prototype needs conservative field bounds, a transition strategy between cell sizes, shared edge ownership, crack and winding tests and comparisons against the dense ordered-field reference. No measured result here warrants replacing dense extraction. For GLB, editable retopology would need a separate derivative mode and artist-facing goals for edge flow, crease/colour retention and post-subdivision drift. The present STL measurements cannot validate that use case.

## Reproduction and shipping gates

From the checkout, use the repository's installed dependencies:

```sh
node scripts/benchmark-export-experiment.mjs
node scripts/benchmark-export-experiment.mjs --reverse
node scripts/benchmark-export-experiment.mjs --reverse work/phase-7-5-4a/input/lensbenchmark.form
node scripts/experiment-export-curves.mjs work/phase-7-5-4a/*-192-high.stl
node scripts/experiment-export-curves.mjs --gentle work/phase-7-5-4a/lens/run-yAG1Ju/*-high.stl
node scripts/experiment-export-curves.mjs --minimal work/phase-7-5-4a/curved-192-192-high.stl
node scripts/experiment-export-curves.mjs --exact work/phase-7-5-4a/clay-192-high.stl
npm run check
```

For Astra, obtain a native .form copy through Save project, copy into a fresh ignored directory, chmod 444 **only on that copy**, and record its SHA-256. Pass its path in place of the Lens copy to both run orders. The harness creates fresh output directories and compares source serialization, Undo/Redo counts and native copy bytes after every attempt. Run the existing 7.5.4a native-copy harness with High STL as well, then pass that decoded STL to the offline simplifier. Preserve the original and record refusals before trying different settings. Never infer source dimensions from an STL filename.

Before shipping, repeat paired runs on target browsers with additional warm/cold repetitions and alternating order, verify byte identity on transformed, painted and multi-part projects, and exercise aborts, stale revisions, memory-pressure failures and worker teardown. For any lossy mode, add named feature cross-sections and mating gauges from a supplied precision design, oblique and sub-grid slots, cavity/multi-shell classification, slicer/print checks and heavy organic Astra evidence. WASM simplification currently runs synchronously in a disposable research process. A cancellable, memory-admitted worker and a validated encoder round trip are required before UI integration. The prototype emits metrics only.

## Browser and preservation checks

A fresh in-app browser origin on port 5237 prepared the product's Unified Boolean Fast STL at 1:1. The dialog reported 169.848 mm on all axes, 31,536 faces, a 68³ evaluated grid, 12 MiB encoder admission and a ready download link. This smoke exercised preparation only. The scripted Chromium launch terminated with SIGABRT before UI assertions. No existing editor, library or recovery data was opened.

With the Vite dev server running, open `/scripts/export-experiment-browser.html` and choose **Compare pipelines**. This isolated main-thread fixture creates its own 65³ curved source and compares High STL at the default 256 MiB budget. Production totals were 1,287.3 and 1,532.3 ms with 339.4 and 459.2 ms precompaction. Experimental totals were 1,065.8 and 1,201.0 ms with 168.5 and 152.1 ms precompaction. All four outputs passed the blocking topology checks and had 34,028 triangles and SHA-256 `5a64fcc9fbb2a6eba9dd1d4bcb0a1291126a6873b6ac35b2e83549ec68751cbf`. These measurements include cooperative yields. They exclude worker transfer and download, and browser peak RSS was unavailable.

In the fixture-specific cross-section at y=15 mm, the original and gentle meshes gave three 18.000 mm slot widths in the holder and three 45.000 mm widths in the array. The vertical centre-pocket floor interval measured 50.500001 mm in both fixtures. All ten reference and proposed crossings per fixture agreed. These numbers describe only these particular cuts. For the original Lens model the general ray grids apply; no nominal mating specification was supplied.

The native Lens original and its write-disabled input copy both hashed to `ff59de49002bde1f97771e8b1c52de7b401d3e7f4faf50bf31325803c0b8c855`. The original was used only for hash verification. WHATS_NEW was left alone because the experiments are off by default and no user-visible feature shipped.

## Run records

The first-order runs are in `work/phase-7-5-4b/run-NDWXUl/rows.json` (fixtures) and `run-CXTgNT/rows.json` (Lens). Reverse-order runs are in `run-uwfuXx/rows.json` and `run-gCYGfk/rows.json` under the same directory. Each record retains all stage counters, mm bounds, file SHA-256, process snapshots, available workspace, print report and native-preservation assertions. The first-order holder at cap 256 was slower with the flag on its warm run, 23,260 vs 20,916 ms, during overlapping verification. Across both orders all 56 attempts preserved serialization and history, with one file digest per case across its eight runs. The reverse-order series ran without the full test suite. Brief browser/probe checks overlapped parts of that series; the host was not reserved. The results do not establish a speedup distribution or a lower RSS ceiling.

Offline records are in `verified-half.jsonl`, `verified-gentle.jsonl`, `minimal.jsonl`, `named-{half,gentle}.jsonl`, `determinism.jsonl` and `exact.jsonl` under the same ignored root. Node v26.8.1 on Apple M5 Pro, macOS arm64. The initial full check encountered loopback sandbox restrictions and a floating-point test assertion (7.85e-17 mm versus exact zero). With local network permission and a 1e-12 mm numerical threshold, the rerun passed. The two diagnostic suites are independent of product download publication. Test logs are in `/tmp/754b-{quick,focused,final-check,handoff-check,final-tree,browser}.log`.

Final-tree verification passed Biome formatting and lint (existing warnings), strict TypeScript, Vite production build and all 1,679 tests with zero failures, skips or cancellations.
