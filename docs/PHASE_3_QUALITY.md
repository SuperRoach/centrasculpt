# Phase 3.0 — High-detail sculpting and sharp-feature quality

## Scope and decisions

This phase improves extraction robustness and CPU cost without changing authoritative voxel samples, brush semantics, persistence or controller mappings. It does not increase geometric resolution. Normal/Matte/Glossy alter lighting and materials; smooth SDF normals improve shading, while geometric feature size remains limited by lattice spacing. A finite sampled grid cannot represent infinitely sharp edges or reliably retain sub-voxel grooves. More triangles from interpolating existing samples are not recovered detail.

No new quality switch, implicit resampling, high-quality export mode, schema change, sparse-storage rewrite or Dual Contouring implementation was introduced. Separate-layer GLB retains source extraction and smooth normals; Boolean GLB retains the explicitly sampled composite. An export-only subdivision would not restore missing samples and would add cost and a different surface contract. Existing explicit 64/128/192 new-layer choices remain the way to start finer detail. Existing Resample remains destructive to voxel history, restricted to legacy cubic grids and unable to restore already lost features. The desktop explanation now states this and separates shading from geometry. VR has no new setting or changed default in this phase.

## Pipeline audit

- **Spacing/storage:** `SDFVolume.step = 2 * extent / (resolution - 1)`. Default initial extent 1.6 gives 0.0507936508 at 64, 0.0251968504 at 128 and 0.0167539267 at 192, in layer-local project units. Uniform layer/workspace scale changes apparent/world spacing. `resolution` is initial spacing metadata, not expanded dimensions. Dense growth copies original Float32 samples exactly into signed-origin rectangular lattices. Chunks own disjoint cells with shared global samples/gradient halos. Dense safety caps and admission budgets still apply.
- **Extraction:** `mesh.ts` implements six Marching Tetrahedra per cube with a consistent body diagonal, linear zero-crossing interpolation and nonindexed output. It is not Marching Cubes. Finite spacing plus directional tetrahedral interpolation rounds/chamfers hard features, especially diagonal edges/apices. This phase retains its topology and incremental chunk ownership.
- **Normals:** `normalAt` interpolates central-difference lattice gradients, normalizing once afterward. Chunks sample the same global field; the normal halo is already covered by invalidation. Baseline sphere angle error and shared-position normal disagreement did not justify replacing it with discontinuous triangle normals or wider stencils that soften sharp features. Export uses the inverse-transpose normal matrix. Smooth shading across an edge does not imply geometric edge recovery.
- **Brush/path:** elapsed time is capped at .1 s; motion samples at radius * .2, with up to 256 dabs. Hardness changes the shoulder of compact C1 displacement falloff; Smooth deliberately ignores hardness. Free-space Clay unions/differences radius-sized applicator fields with strength/hardness affecting depth, making repeated holds idempotent; it is not a uniformly normalized exact distance field. Thin radii and fast capped strokes remain resolution/path limited. Steady/Straight Line own path filtering and share the same deposition/history path. No measured brush defect here justified changing familiar sculpt behavior.
- **Smooth/Stamp:** Smooth is a six-neighbor Jacobi diffusion pass and necessarily erodes thin/sharp features. Stamp samples analytic sphere/box/polyhedron SDFs using exact CSG min/max and transforms; analytic sharpness is limited when sampled/extracted. New planar fixtures exposed roundoff sign noise at exact faces. Existing Stamp guards, conservative bounds and growth routing are retained.
- **Move:** all four modes keep original-surface GPU preview and asynchronous worker/cooperative reconstruction. The candidate uses the same spacing and sampled distances to the deformed triangle surface; reconstruction can lose detail repeatedly. Support/unrelated negative material preservation, expanded bounds, source guards, atomic publication, one history action and cancellation are unchanged. Tests compare exact lattice samples rather than assuming Undo shrinks retained growth capacity.
- **Boolean/Bake:** ordered transformed source sampling is independent of source storage. Preview resolution caps can make wide scenes coarser than their finest source. Bake uses an explicit new 64/128/192 grid, reports world spacing/detail limitation and retains sources. This phase does not claim that either process preserves finer source features.
- **Export/project:** separate GLB flattens committed visible source chunks and transformed normals; Boolean GLB uses committed composite sampling. Native files retain authoritative voxel spacing, bounds and values. New roundoff handling is extraction-only and cannot silently resample saves.

## Defects and implementation

1. Lattice-aligned surfaces emitted collapsed triangles. The 33³ baseline aligned box emitted 7,560 zero-area triangles; box 5,616, prism 3,408, pyramid 2,584 and narrow-groove box 5,540. These consume buffers and downstream picking/reconstruction/export work without adding a surface.
2. Exact planar faces could have tiny signed distances on either side of zero due to floating-point analytic distance arithmetic. The prism fixture exposed collinear splits and unmatched welded edge incidence after collapsed triangles were removed alone. Extraction now consistently classifies distances within `step * Number.EPSILON * 32` as zero, without editing SDF samples. The area filter discards cross-product magnitudes at most `step² * 1e-12`; this is a numerical sliver threshold, not a user geometric tolerance.
3. Tetrahedra recomputed the same cell-edge intersection and SDF normal several times. Extraction now caches its at-most-64 edge slots per active cell, shares zero endpoints and lazily evaluates each generated point's normal once. Cache lifetime is one cell, without a volume-wide cache or persistent invalidation burden. Endpoint order follows global linear lattice index so adjacent cells use identical interpolation arithmetic. No triangles are added to smooth fixtures.

Changed product files: `src/mesh.ts`, explanatory text in `src/ui.ts`; benchmark commands in `package.json`. Added `tests/mesh-quality.test.mjs`, `scripts/fixtures/mesh-quality.mjs`, `scripts/benchmark-mesh-quality.mjs`, `scripts/benchmark-quality-move.mjs`, this guide and status handover. No new dependencies.

## Reproduction and metric definitions

Run from the repository root:

```sh
npm test -- mesh-quality
npm test
npm run test:worker
npm run build
node scripts/benchmark-mesh-quality.mjs outputs/phase-3-quality-baseline.json --baseline
npm run benchmark:quality
npm run benchmark:quality:move
git diff --check
```

The baseline command loads the original mesher at `b8469b3f07d2944167695484ff7b08acff4f633b` using `git show`, transpiles into ignored `work/test-build/mesh-quality-baseline.mjs` and never checks out or changes Git state. Benchmark core imports are dynamic after compilation so the benchmark measures current compiled code. The baseline uses the same current fixture, SDF and measurement helpers, isolating mesher changes.

Fixtures: sphere radius .85; box/prism/pyramid dimensions 1.4; aligned box half-width .8; thin stroke radius .065 and half-span .65; box with cylindrical groove radius .065 at z=.7. Resolutions 33 (alignment stress), 64, 128, 192. Negative/positive empty capacity growth and a radius-.4 capsule spanning x ±1.7 measure expanded allocation and occupied geometry at unchanged spacing. Timing excludes fixture construction and metric calculation: one warm-up extraction then three complete chunk extractions, median and all raw samples recorded. Empty-capacity growth timing is a single observation including rebind/remesh, with allocation/copy time separately recorded.

Geometry error samples analytic distance at each mesh vertex and triangle centroid; RMS uses vertices only. These finite probes are not bidirectional Hausdorff bounds and can miss the apex/feature entirely. Sphere normals compare interpolated normals with normalized radial vectors; no single analytic normal exists at hard edges. Shared-position normal delta welds at seven decimal places, includes duplicates within a chunk and is not a standalone proof of watertightness. Regression tests separately require exactly two triangles per welded nonzero edge on closed fixtures, compare full/chunk position and normal arrays exactly after signed-origin growth/local seam edits, retain untouched GPU buffers and verify unmodified source values.

Move benchmarks execute three consecutive actual persistent commits on sphere and narrow-groove fixtures, each of four modes at each resolution: 96 commits total. Translation is (.02,0,.08), radius .3; rotations/twists use .15 rad around Y. Every seventh source vertex with weight > .05 supplies up to 512 preview probes. Error is absolute committed trilinear SDF at the warped point divided by spacing. This is neither cumulative ground truth nor a claim that the groove retains its original width. Release timings/stats are single observations, using Node's cooperative backend; actual worker integration is validated separately by the existing 89 worker contracts. CPU process results do not establish physical controller accuracy, XR frame rate, GPU performance, peak device memory or thermal behavior.

## Validation and measured results

See the generated measurement tables below and raw `outputs/phase-3-quality-{baseline,after,move}.json`. Tests: incoming 659/659; final 670/670, 11 new tests; worker-enabled 89/89; TypeScript/production build and whitespace pass. Existing production bundle-size warning remains. Build and test logs are `outputs/phase-3-{tests,worker-tests,build}.log` (ignored local evidence).


### Extraction measurements

Mac arm64 / Node v26.8.1. Times below are milliseconds, baseline → final median of three after one warm-up. Fixture construction, metrics and rendering excluded. Values are observations, not timing acceptance thresholds.

| Fixture | 33³ | 64³ | 128³ | 192³ |
|---|---:|---:|---:|---:|
| sphere | 14.76 → 10.44 | 44.76 → 35.87 | 245.32 → 206.70 | 706.67 → 623.28 |
| box | 9.01 → 4.87 | 50.90 → 35.94 | 262.60 → 213.52 | 745.46 → 642.50 |
| triangular-prism | 7.50 → 4.33 | 39.92 → 31.18 | 229.09 → 193.92 | 670.62 → 599.20 |
| pyramid | 6.30 → 3.94 | 34.92 → 28.23 | 212.19 → 182.50 | 629.90 → 566.47 |
| aligned-box | 11.25 → 5.25 | 58.06 → 42.17 | 300.98 → 238.74 | 841.34 → 697.62 |
| thin-stroke | 2.46 → 2.37 | 17.56 → 17.13 | 142.53 → 138.39 | 470.39 → 466.16 |
| narrow-groove | 8.95 → 4.56 | 48.20 → 35.92 | 264.19 → 212.92 | 751.83 → 644.44 |
| occupied-growth | 13.59 → 20.74 | 58.82 → 50.14 | 338.67 → 302.72 | 917.74 → 844.83 |

Sphere convergence (final values; baseline geometry and normal errors agree at the printed precision):

| Resolution | Spacing | Max vertex/centroid distance | Vertex RMS distance | Max radial normal error |
|---|---:|---:|---:|---:|
| 33 | 0.10000000 | 0.00395658 | 0.00127448 | 0.18437° |
| 64 | 0.05079365 | 0.00108342 | 0.00032752 | 0.05067° |
| 128 | 0.02519685 | 0.00027730 | 0.00008029 | 0.01837° |
| 192 | 0.01675393 | 0.00012319 | 0.00003553 | 0.01680° |

Maximum analytic vertex/centroid distance divided by spacing, final extraction:

| Fixture | 33³ | 64³ | 128³ | 192³ |
|---|---:|---:|---:|---:|
| box | 0.33333 | 0.11526 | 0.11526 | 0.11526 |
| triangular-prism | 0.44721 | 0.42858 | 0.42858 | 0.42858 |
| pyramid | 0.33333 | 0.47823 | 0.47823 | 0.47823 |
| thin-stroke | 0.35888 | 0.52968 | 0.47759 | 0.66391 |
| narrow-groove | 0.33333 | 0.29171 | 0.35744 | 0.40597 |
| occupied-growth | 0.07877 | 0.04669 | 0.02320 | 0.01569 |

All 36 final fixture/growth rows have zero degenerate triangles and zero measured shared-position normal delta. Expanded dimensions for 33/64/128/192 are 97×33×33, 129×64×64, 225×128×128, 289×192×192. Empty-capacity growth remeshed 0/0/0/0 chunks respectively. Dense allocation/copy costs remain in the raw report. Thin-stroke error in voxel units is not monotonic: alignment and missed geometry matter, so increasing the sample count is not itself a quality guarantee. Performance benefits vary by occupancy; compare individual rows. The 33³ occupied-growth observation regressed 13.59→20.74 ms; this alignment stress case is not an offered production resolution. Do not infer a universal speedup or a stable regression magnitude from three samples. Default/fine/high occupied cases were faster in this run.


### Repeated Move measurements

Three commits per mode, two fixtures, four resolutions; **96/96 commits succeeded** with the expected one action per commit. Timings below are min–max actual commit wall time across the 12 observations per row, not frame times or latency percentiles. `wallMs` excludes quality metric calculations; internal `stats` include backend, work slices and meshing.

| Resolution | Fixture | Commit wall ms, min–max | Worst preview probe error, voxels |
|---|---|---:|---:|
| 33 | sphere | 20.02–43.12 | 0.29399 |
| 33 | narrow-groove | 9.46–22.88 | 0.14069 |
| 64 | sphere | 86.83–166.24 | 0.27284 |
| 64 | narrow-groove | 68.45–108.20 | 0.41048 |
| 128 | sphere | 456.64–881.82 | 0.21179 |
| 128 | narrow-groove | 323.54–603.19 | 0.37298 |
| 192 | sphere | 1476.36–3184.69 | 0.12465 |
| 192 | narrow-groove | 904.89–1689.64 | 0.26073 |

All repeated Move results had zero degenerate triangles and maximum shared-position normal delta 1.1638178938488149e-7. Spacing stayed fixed; some coarse-grid runs expanded capacity despite small edits because reconstruction includes a three-cell halo. Growth-aware exact Undo/Redo is covered separately in the new regression test. These sampled errors do not measure groove width, volume drift or a guaranteed cumulative fidelity bound.

## Physical Quest 3 acceptance checklist — pending

- Open existing saved projects at each resolution and a signed-origin expanded project. Confirm unchanged layer pose/visibility/colours, controllers, selection, navigation and both-hand alternate Smooth restoration.
- Inspect sphere seams under Normal/Matte/Glossy while moving the light/view. Check chunk boundaries before/after a local dab and after growth; distinguish silhouettes from lighting.
- Stamp aligned and rotated box/prism/pyramid at multiple sizes. Check silhouettes, flat faces, corners and apex; compare a .13-wide groove/stroke at 64/128/192. Accept finite voxel rounding, reject cracks or inverted/missing faces.
- Exercise free-space Clay, Steady and Straight Line, hardness extremes, hold idempotence, erasing and Smooth on narrow grooves. Confirm expected smoothing erosion and one-action Undo.
- Repeat Non-Elastic, Elastic, Local rotate and Progressive twist on groove details and near growing positive/negative boundaries. Confirm responsive held preview, final-preview hold, ready feedback, exact Undo/Redo and subsequent Clay/Smooth/Stamp editing.
- Interrupt pending reconstruction with grip cancel, tracking loss, tool/session/project changes. Check source retained, no mixed chunks and no history entry. Test save/export while pending uses committed source.
- Boolean preview and explicit Bake with mixed resolution/transformed layers: confirm coarser-detail warning, retained sources, Undo/Redo and no disappearance of unrelated layers.
- Save/reopen native files and inspect separate/Boolean GLBs in an independent viewer. Compare seam normals and silhouettes. Test large occupied volumes through admission failure without loss.
- Measure on-device XR frames, release latency, memory/thermal behavior over a sustained session, especially 192³ and expanded layers. No such headset measurements were made in this phase.

## Limits and Phase 3.1 — large-sculpture scalability

Dense arrays/scratch/history and global surface indexing still grow with volume/surface size. Empty chunks avoid some extraction but are not sparse voxel storage. Individual chunk rebuilds, allocations, exports and publication work can still exceed a frame budget; this phase makes no Quest latency guarantee. Large finite-spacing surfaces, apexes and sub-voxel grooves remain approximate; iterative reconstruction can erode detail. Far-field CSG and explicit Bake can remain expensive. Roundoff/sliver filtering is shared by preview/source/composite/export extraction, so triangle ordering/counts may differ for degenerate old scenes while voxel saves remain exact.

Proposed Phase 3.1: establish physical Quest frame/memory traces and representative large occupied sculptures first; investigate occupancy summaries/cell early-outs, bounded geometry allocation, spatially restricted Move indexing and chunk publication scheduling; improve admission estimates using observed peaks and characterize synchronous export cost. Prototype block-backed storage only behind a compatibility interface with signed-origin halo, history/native and worker invariants. Keep any higher-detail layer creation explicit and budgeted. Evaluate feature-aware extraction separately with convergence/topology tests before selecting a new mesher; do not equate export subdivision or hard shading with recovered detail.
