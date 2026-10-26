# Phase 3.2 — Advanced sculpting precision

2026-10-26. Implemented in the active Git checkout; after the successful user smoke test, the user authorized commit and push. No merge. Incoming `git status --short` was empty. Phase 3.0 quality and Phase 3.1 scalability handovers were read first. No reset/stash, source resampling, dependency or native schema change.

## Clay diagnosis and fix

The supplied Quest image shows both silhouette steps and interior lighting bands on blue 64³ and red 128³ Clay, alongside a smooth 64³ starter sphere. The same defect is reproduced by the pre-change free-space Clay field on this Mac. This is stronger evidence than attributing everything to coarse resolution, though the user's exact saved sculpture/controller trace was not available for a byte-for-byte reproduction.

* The starter sphere initializes a consistent signed distance on both sides of its zero set. Free-space Clay previously wrote **only interior negative distances**, scaled by strength/hardness, leaving the old positive empty value outside the applicator. On the benchmark blank layer that value is 6.4. This discontinuity makes interpolated zero crossings hug the last negative lattice point, distorts silhouettes and supplies incorrect gradients. Increasing resolution alone did not fix that field defect.
* Motion already had radius/5 dab interpolation, but discrete spheres still scalloped and there was a 256-dab cap per input sample. Free-space Add/Subtract now evaluate exact point-to-segment distance (capsule) at each affected voxel, independent of frame spacing along a straight segment. Curved trajectories remain piecewise linear; Steady/Line replay retains the same path and transaction.
* Clay now writes the same scaled distance **inside and outside** the capsule, within a two-voxel exterior band beyond the radius. Strength/hardness retain their field-depth meaning. This preserves a usable gradient stencil near the zero set without a global field rewrite. The SDF remains authoritative for history, picking, reconstruction, saves and export.
* The extractor is Marching **Tetrahedra**, not Cubes. Its canonical `a/(a-b)` edge interpolation is already correct. Global trilinearly interpolated central-difference gradients already agree across chunk boundaries. Neither needed replacement or a seam-welding pass. No material, XR lighting, smoothing, subdivision or topology change was used to conceal the defect. The normal error fell by fixing its input field. Existing Normal/Matte/Glossy materials all use supplied smooth normals.
* Genuine finite-grid loss remains. Extent 1.6 gives spacing 3.2/(N−1): .05079 / .02520 / .01675 at 64/128/192. A .065-radius brush is only 1.28 voxels at 64³ (diagnostic stress case below the normal UI minimum .12). A .14 brush is 2.76 voxels. Small silhouettes cannot become arbitrarily round at that density.

**Existing strokes retain their stored field.** This fix improves new strokes and replayed new gestures; it does not reconstruct old Clay or silently resample loaded work. Automatic repair would risk changing intended features. Existing explicit Smooth remains available but changes shape. The desktop resolution help and shared quality row direct users to a **new blank 128³/192³ layer**, preserving prior layers. Explicit Resample retains its warning about history/detail loss.

## Objective before/after

[Actual desktop WebGL comparison](../outputs/phase-3-2-clay-comparison.png): identical material/lights, old stored field / corrected field / analytic reference; 64³ single dab, 64³ capsule, 128³ single dab. Matches the supplied image's characteristic old dab banding. No physical Quest or stereo rendering claim. Reproduce the baseline modules with the benchmark before opening `/scripts/fixtures/clay-quality.html` in Vite. The PNG predates a cosmetic harness resize; geometry and shaders are identical.

`node scripts/benchmark-clay-precision.mjs outputs/phase-3-2-clay-before.json --baseline`

`node scripts/benchmark-clay-precision.mjs outputs/phase-3-2-clay-after.json`

Baseline reads the pinned pre-change source at `b651299e3c6d67c00a0423811e377112b1752e9a`; after uses working source. Benchmark draws a 1.1-unit straight capsule in 16 input samples with .35 strength/.6 hardness, offset from the lattice, one warm-up plus three timed runs. CPU columns below are medians of the three raw samples; brush is the **whole stroke**, mesh is full CPU extraction, neither is a rendered frame time. Surface error probes vertices and triangle centroids against the analytic capsule, **not Hausdorff or a universal bound**. Normal error is maximum angle against the capsule's analytic gradient. Counts/memory are deterministic fixture accounting, not process/GPU peaks.

| N | Radius / spacing | Max surface error, voxels before→after | Max normal angle before→after | Brush CPU ms before→after | Mesh CPU ms before→after |
|---|---:|---:|---:|---:|---:|
|64|.065 / 1.28|1.124→.281|52.43°→15.14°|.23→.41|4.21→4.21|
|64|.14 / 2.76|1.418→.138|34.52°→6.13°|.36→1.25|6.36→5.96|
|128|.065 / 2.58|1.574→.126|28.38°→6.85°|.59→.60|12.96→13.10|
|128|.14 / 5.56|1.598→.068|42.20°→3.10°|1.68→2.16|18.00→18.88|
|192|.065 / 3.88|1.601→.090|47.68°→4.46°|1.74→1.19|38.19→36.83|
|192|.14 / 8.36|1.648→.045|49.67°→2.09°|4.81→4.90|48.27→47.26|

Dense value+scratch memory stays **2 / 16 / 54 MiB**, before and after. Visible meshes stay **8 / 16 / 24** in these fixtures. Geometry storage for small/large radii stays **121.2/263.3 KiB**, **466.3/1177.3 KiB**, **1118.5/2656.7 KiB**, respectively. Same vertex counts do not imply same positions/normals. Zero degenerate triangles in these cases. Shared-position normal deltas remain below 1e−4. CPU results include small regressions: the exterior band visits more samples; this is a quality correction, not a blanket speed claim. Full chunk extraction can exceed a Quest frame budget; local live remeshing retains the existing 30 Hz cadence. XR/GPU frame time, thermal behavior and real peak memory remain unmeasured.

Raw reports: `outputs/phase-3-2-clay-{before,after}.json`.

## Precision behavior

* Optional mirror symmetry is off by default. Configurable **layer-local X/Y/Z plane normal and numeric offset**; reflects points through `coordinate = 2*offset−coordinate`. Arbitrarily oriented plane normals are not implemented. Settings are session-only and shared through `EditorToolState` / active `IndependentLayers`.
* Clay Add/Subtract, legacy surface displacement and Smooth combine original/reflected influence **once per sample**, using nearest swept distance / maximum falloff. Plane overlap never adds two doses. Smooth retains its Jacobi neighbor snapshot. Symmetry does not retroactively symmetrize preexisting asymmetric material.
* Steady and Straight Line use the same captured stroke transaction and mirror plane. Their preview trajectories and brush volumes have reflected counterparts. Successful changed gestures create one undo entry; no-op gestures create none. Cancellation retains redo. Bounds grow on both sides for Add at unchanged spacing using existing growth/memory guards and stable chunk coordinates; Subtract/Smooth do not grow.
* Stamp evaluates the minimum of the original shape's distance at the sample and at the reflected sample, then performs one union/difference and one existing sparse history patch. This supports rotated asymmetric primitives without pretending their reflection is just another Euler rotation. Both bounds enter growth/admission and preview warnings. Reflected ghosts use a negative-determinant local matrix and shared cached geometry outside project/export roots.
* Straight Line constrains endpoints to layer-local free/X/Y/Z and previews the constrained trajectory. Desktop strokes now use `ClayStrokeSession`, including buffered release/pumping for Steady/Line and default live sculpting. Tool/context interruptions cancel buffered desktop work; normal release commits. Mirrored desktop cursor/path helpers remain outside source/export roots.
* Move translation now respects the captured layer-local axis; rotate/twist retain their prior axis behavior. Optional **Off/15°/45°/90°** angular snapping is captured at gesture start after Precision/sensitivity and respects the clamp (largest permitted snap multiple). The actual original-mesh GPU preview and asynchronous SDF commit use the same constrained/snapped field. All prior Non-Elastic/Elastic/preview-only/rotate/twist paths remain. No extra undo action for constraints.
* Desktop **Precision · Shared Tool Settings** uses the same option declarations and busy guards as VR Options. Existing VR pagination, controller arbitration, Support-trigger temporary Smooth and restoration remain. Move deformation remains the established VR controller interaction; a new desktop pointer-driven deformation Move was not added. Desktop rigid layer Move/gizmos are unchanged. The shared desktop panel exposes the current tool's settings; it is not a replacement tool selector.

## Validation and limitations

Full suite **697/697**, actual-worker contracts **89/89**, strict TypeScript/production build and whitespace checks pass. Existing bundle advisory remains. New numerical tests cover low-resolution normals/geometry, no degenerates, shared normals, controller-sampling invariance, centerline and overlapping influence, transformed planes, mirrored Add/Subtract/Smooth, offset rotated Stamp, exact undo/redo/native bytes, expanded same-spacing bounds, cancellation/redo, invalid planes, constrained Line, translation/rotation snapping and mirrored XR previews/lost tracking. Existing interaction arbitration, menus, all Move persistence/worker paths, layers/Boolean/Bake and GLB suites pass. Updated the expected Smooth options list for the added controls.

Actual desktop browser: startup/WebGL succeeds with no captured console errors; shared symmetry and X-constrained Straight Line toggle without history edits; real canvas drag creates **one** undo action (31,536→31,540 triangles); Undo restores **31,536** and 0 undo/1 redo. Side-by-side old/current/reference WebGL harness has no captured console errors. These checks are synthetic desktop acceptance, not a headset test.

Flat/box brush profiles and view/export subdivision are **deferred**. A correct reflected flat/box swept kernel, orientation capture and feature-preserving display reconstruction require separate numerical/performance work. The field fix substantially improves current round brushes without blurring sharp features or adding display/source disagreement. The authoritative lattice is still dense; sparse history/chunk meshing is not sparse voxel storage. Mirrored far-apart influences scan their encompassing AABB, which can be expensive. Large Stamp remains synchronous and subject to existing staging/history/growth limits. No claim that this phase solves Phase 3.1 persistent-memory or scheduling limits.

## Quest 3 acceptance checklist / next phase

**User acceptance follow-up (2026-10-26):** after trying the served changes, the user reported “worked” and requested server shutdown. Recorded as a successful user smoke test. Device, individual symmetry/constraint cases and numerical performance were not specified; the detailed Quest checklist remains open. Development server stopped and port 5173 verified clear.

1. On a **fresh** blank 64³ layer, repeat the supplied isolated Clay dots and curved strokes at minimum/default/large radius; compare to a starter sphere, then repeat 128³/192³. Inspect silhouettes against the background and interior bands under Normal/Matte/Glossy. Keep old layers as comparison; do not resample them automatically.
2. Record radius/spacing, visible meshes, live CPU and immersive GPU/frame traces, pending/release latency, estimated/peak memory and thermal behavior during sustained use. Compare symmetry off/on and expanded distant reflected strokes. Check first-use and warmed results separately.
3. Mirror Add/Subtract/Smooth, Steady, Straight Line and each Stamp on all plane axes, offset and transformed/scaled layers. Cross/hold on the centerline: no doubled strength or gap; previews must agree with the result. Undo/Redo once each. Verify growth both sides and safe budget rejection.
4. Test free and constrained Line; Move translate each axis, Non-Elastic and Elastic; rotate/twist with Off/15/45/90°, Precision and half-turn motion. Verify held preview, release commit, source-kept failure and Support grip cancel.
5. In both dominant hands, test menus/temporary Smooth/size, tracking loss, tool/layer changes and queued commits; ensure no stray trigger application. Save/reload and both GLBs must contain committed source, not preview helpers.

Next phase: physical acceptance first, then locality/performance of mirrored bounds and dense brush scratch, bounded asynchronous Stamp staging and the Phase 3.1 distance-correct sparse-storage prototype. Do not trade source/history safety for a smooth-looking overlay.
