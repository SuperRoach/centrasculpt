# Phase 4.0 — Advanced Brush Library (2026-10-28)

Status: **implementation wrapped for this pass; all five brushes implemented; physical acceptance deferred and OPEN**. Flatten, Inflate, Scrape, Pinch and Crease are available on desktop and VR. This is a host-validated implementation, not a Quest performance sign-off.

## Subsequent headset feedback — stronger Crease (2026-10-28)

User confirms Scrape works very well; its kernel/integration remains unchanged. Crease still felt too weak after the Surface-follow cancellation fix. Crease stroke integration now applies3× the previous amount before the same per-dab displacement/derivative caps, without extra resampling passes. Default half-second host contact at64³ moved the surface.04065 units versus.01452 at the old rate;128³ .04420 versus.01505. It remains a rounded radial contraction/indentation tool. Physical strength/feel retest is pending; no claim of sharp chisel behavior or3× depth at capped extremes.

The same follow-up fixes diagnostics hover cancelling active Clay and improves Continuous Stamp catch-up; see `DEVELOPMENT_STATUS.md` for scope/measurements. Strict build +901/901 tests PASS; evidence `outputs/headset-tools-feedback/`. No commit/push/merge.

## Quest Surface-follow feedback and fix (2026-10-28)

User reports Pinch/Crease appeared ineffective on a sphere in **VR Surface follow**. A host reproduction found Crease losing the derived-mesh ray hit during a steady hold, silently cancelling and rolling back the entire stroke. Added a bounded, read-only current-SDF pick fallback for already-active Pinch/Crease strokes when their mesh pick misses. It does not reuse stale contacts or start strokes without a mesh hit; empty-air/tracking/ownership loss still cancels. Explicit surface-loss feedback replaces the silent rollback case. Geometry kernels, rate, history and staged remeshing remain unchanged.

Pinch's tangential contraction remains intentionally subtle on a smooth sphere; a default64³, radius.22/strength.35,2s host hold changed centre height about.0038 units (.075 voxels). Use an existing ridge/bump to assess contraction. Options now explain this distinction. Crease should visibly indent; it no longer rolls back merely because the changing mesh briefly misses while the SDF still has a surface under the ray.

Eight new tests include actual XR2s holds at64/128, measurable Crease indentation, exact Undo/Redo, forced mesh miss versus empty ray, transformed/negative coordinates and tracking cancellation/redo. Strict build and **894/894 full tests PASS**; focused44/44 PASS. Evidence `outputs/brush-surface-follow/`; detailed reproduction and pending headset retest in `DEVELOPMENT_STATUS.md`. No physical fix pass or new headset timings claimed; no commit/push/merge.

## Wrap-up (2026-10-28)

The user deferred acceptance testing and requested wrap-up. No further testing or background follow-up is scheduled. Latest build and856/856 tests passed; changes remain uncommitted/unpushed. Resume with the Quest 3 checklist below, retaining the Phase3.7 fast-Clay two-chunk retest, before closing acceptance. Phase4.1 editable spline tubes is the next implementation recommendation, not work started by this wrap-up.

## Geometry contract

Negative field values are inside. All operations use layer-local distances, finite Float32 storage, a spherical compact support and Jacobi writes (each dab reads the unchanged source). Radius is converted from world units with the existing uniform layer-scale contract. Existing nonuniform-scale editing restrictions remain.

- **Inflate** subtracts a bounded positive offset from the field, weighted by falloff. For a metric SDF this moves the zero set outward along its normal. This is a local implicit offset, not a sphere stamp or vertex-normal displacement. It requires a surface within the brush radius and never seeds an empty layer.
- **Flatten** samples field value `f(c)` and normalized gradient `n` at each dab centre. Its target plane field is `n·(x-c)+f(c)`, approximating the tangent plane at `c-n*f(c)`. The field approaches that target with per-dab displacement bounded by `min(amount, voxelSize/2)`, weighted by falloff. It can add or remove material. The plane is re-estimated per dab; it is not a stroke-locked plane or an exact least-squares surface fit.
- **Scrape** uses the sampled normal but a clipping plane **through the applicator centre**, target `n·(x-c)`. Only positive field changes are allowed, so it removes high material without filling depressions. In surface-follow mode a convex tangent contact may do little; place the free-space applicator slightly inside the surface to cut a cap. This differs intentionally from Flatten's projected plane.

The existing bounded displacement integrator supplies strength and interpolates controller motion. Hardness controls the compact falloff plateau (`inner=.9*hardness`, outside it `(1-t²)²`). Radius/strength/hardness are shared with Clay. These operations maintain an implicit zero set but **do not re-distance** the field; repeated large edits can degrade distance accuracy. Brush regions clip at allocated boundaries and never grow or resample the whole layer. Pinch and Crease locally resample the unchanged source as described below. Expanded negative-coordinate lattices use their existing dimensions/origins. Storage remains the current dense lattice with sparse history/chunk invalidation; no new sparse storage backend is claimed.

## Interaction and integration

Desktop sidebar and the shared VR registry offer all five brushes; the wheel uses registry-sized sectors for both drawing and hit testing. Options share radius, strength, hardness/falloff, symmetry and Steady/Line. Steady/Line constrain the trajectory; planes still follow the evolving field. Sphere previews show influence; Flatten/Scrape also show the sampled plane ring. Mirrored Flatten/Inflate/Scrape dabs sample the mirrored surface's own normal (not an assumed reflected source normal); overlap uses the nearest applicator once. Preview planes are indicative and can change as geometry evolves; they are not a final buffered mesh preview.

Same continuous stroke engine and one sparse history transaction; cancellation/Undo/Redo use existing paths. XR retains **up to TWO dirty chunks and 3 ms between-chunk admission**, CPU-gap accounting, release draining and cancellation ownership. No new synchronous XR full remesh. Controller mappings unchanged: Support trigger temporary alternate (advanced brushes use Smooth for default Opposite), Support stick menus/Undo/Redo, Tool stick radius while idle, grips workspace/transform. Live radius during drawing remains Clay-only. Surface follow relies on the currently displayed mesh, which may trail the edited field.

Brush modes validate/round-trip through existing project settings. Layers/Boolean/Bake/recovery/GLB formats and material semantics are unchanged. Newer project brush settings require this version; older app versions may reject unknown modes.

## Pinch implementation (2026-10-28)

Pinch uses **local inverse field resampling**, rather than Move's triangulated reconstruction. For a frozen per-dab surface normal `n`, `P=I-n*nᵀ`, radius `R`, applicator centre `c` and compact hardness falloff `w`, it evaluates the previous field at `B(x)=x+a*w(x)*P(x-c)`. This tangential expansion of source coordinates makes the displayed zero set contract toward the axis. It is not subtractive Clay: a flat plane remains flat, while a curved surface's footprint contracts. Normal is sampled anew for each interpolated dab. The applicator centre is the axis origin; translation along that normal does not change the tangential projection.

`a=min(amount/R, .08*(1-inner))`, with `inner=.9*hardness`. The compact falloff's bounded slope and this conservative cap keep each single-applicator backward map orientation preserving; displacement is at most half a voxel. Mirrored applicators blend tangential displacements with weights `w_i² / sum(w_i)` and use the more conservative `.02*(1-inner)` cap. This avoids a discontinuity at a nearest-applicator bisector, keeps coincident applicators from doubling the centre displacement, and preserves reflection symmetry on symmetric source geometry. The inverse deformation is represented implicitly by the backward map; no Newton solve or source mesh edit is required.

Each dab reads the unchanged source into the existing scratch buffer, then records/publishes writes. **Both evaluation and publication yield every 128 candidate samples**. The application session advances at most 2,048 batches per pump and checks its 4 ms admission budget between batches; one batch/mesher chunk/GC remains indivisible, so this is not a hard CPU ceiling. Desktop and XR both use this staged Pinch path, including Steady/Line replay. Low-level synchronous callers drain the identical generator for reference/testing. No new full-volume copy or worker is needed. Sparse history owns partial writes; interruption drops pending work and uses the existing exact rollback path, retaining prior redo.

Live Pinch can trail the controller and continue draining after release. The existing two-chunk/3 ms between-chunk mesh admission and full CPU-gap accounting remain. Ordinary processing does not introduce full synchronous XR remeshing. Existing cancellation/Undo/history rebuilds can still be synchronous and hitch. The stroke remains busy/cancellable until work and dirty chunks drain; only then is one history action committed. Radius changes remain idle-only. Pinch previews add four inward arrows on a tangent ring in both desktop and VR.

Trilinear pullback preserves a meaningful implicit zero set but **does not reconstruct metric signed distances**. Many repeated dabs can diffuse detail or collapse sub-voxel features despite each map's conservative displacement/fold bound. Distance accuracy/long-stroke quality and physical ergonomics remain acceptance items. Smoothness/stability of a single map is not a guarantee that unlimited repeated resampling retains fine detail. High-resolution large-radius queue lag is a measured host limitation.

## Crease implementation (2026-10-28)

Crease combines tangential contraction with a controlled inward normal displacement. For frozen source normal `n`, tangent projector `P`, compact falloff `w`, applicator centre `c` and radius `R`, its single-applicator backward sampling map is:

`B(x) = x + a*w(x)*(P(x-c) + .5*R*n)`

The outward normal offset in source coordinates moves the displayed zero set **inward**. It indents a plane while contracting adjacent features. Independent sampled-field fixtures distinguish this combined map from a normal-only cutter. This is a smooth radial crease applicator drawn along an interpolated path, not an infinitely sharp V-shaped cut or a stroke-oriented chisel. Radius controls groove width; strength controls application rate; hardness controls the influence plateau and edge falloff. Repeated resampling can sharpen or diffuse features depending on curvature/resolution; no sharpness guarantee below voxel size.

`a = min(amount/(1.5*R), .04*(1-inner))`, with `.01*(1-inner)` for mirrored overlap. `inner=.9*hardness`; falloff is the same compact `(1-t²)²`. The tighter caps include the normal component. Within support, `|P(x-c)+.5R*n| <= sqrt(1.25)*R`; thus displacement is below `sqrt(1.25)/1.5 * amount`, with `amount <= voxelSize/2`. Together with the bounded falloff slope these conservative coefficients keep individual backward maps away from folds and interior samples within the existing positive-margin sampling domain. Numeric determinant tests cover hardness/amount extremes; boundary fixtures at64/128/192 preserve boundary samples and finite fields. This does not guarantee lossless arbitrarily repeated deformation or prevent sub-voxel detail loss.

Mirrors use the same smooth `w_i²/sum(w_i)` overlap blend as Pinch, sampling each surface normal. Crease is a deformation: unlike Scrape it is **not guaranteed remove-only** on curved/concave surfaces; tangential contraction can move sidewalls into previously empty space. It never seeds distant empty material, grows the layer or changes layer transforms. Distances are pulled back, not globally re-distanced.

Completed staged brush samples report accumulated CPU excluding time suspended between frames; that diagnostic is sample CPU, not per-frame latency. Both brushes now share `applyResamplingSteps`; the Pinch entry point remains available. Evaluation/history publication yield every128 candidates and use the existing 4 ms admission pump. Release drains work and at most two dirty chunks with the existing 3 ms between-chunk admission, then commits one history action. Cancellation drops pending work and restores recorded values/redo. Normal processing introduces no full synchronous XR remesh; existing cancellation/Undo/history rebuild hitch risks remain. Controller mappings, Steady/Line, alternate Smooth/default-opposite restoration, world/local layer scaling, recovery ownership and export paths are retained.

Crease previews show the tangent ring, contraction arrows and a distinct inward normal arrow; influence is warm orange. Bounds-warning colour remains amber. The registry-sized wheel now has ten tools; physical wheel/preview readability remains pending.

### Crease validation and measured limits

The preserved incoming tree contained the uncommitted Pinch stage. Baseline build passed; the first default-concurrency baseline run had **one Move precision fixture preparation timeout** before any Crease edits. The full baseline rerun with `--test-concurrency=4` passed **836/836**. No unrelated Move behavior/test limits were changed. Raw baseline and retry logs are retained.

Final strict TypeScript/Vite build passes with the existing bundle advisory; **856/856 full tests pass**, no failures/skips, using four test processes. New Crease coverage includes deterministic local geometry at64/128/192, independent combined-map sampling, planar indentation, inverse-map determinant bounds, expanded negative coordinates, allocated boundaries, transformed world/local equivalence, mirrors, freehand/Steady/Line, partial-publication cancellation retaining redo, native round-trip, exact Undo/Redo and actual XR release/tracking-loss/two-chunk admission. Existing Pinch/Clay and Boolean/Bake/recovery/GLB regressions also pass. Browser real drag created one action; Undo/Redo showed0/1 then1/0. Screenshot `outputs/phase-4-0/crease-desktop.png`. No new worker-specific run or physical Quest timings.

Reproduce `npm test -- --test-concurrency=4`, then `node scripts/benchmark-pinch.mjs crease`. The shared benchmark accepts `pinch` (default) or `crease`. Twelve synthetic samples 16 ms apart, strength.7/hardness.4; all six cases assert identical final staged/reference voxels and one history action. **Staged CPU includes sampling and meshing/draining; synchronous maximum measures brush-only work**. Single Node v26.8.1 host run, no rendering/real frame cadence/Quest timing, no speedup-ratio claim. Pump/chunk/GC work is indivisible at batch boundaries; admission budgets are not hard CPU ceilings.

| Grid | Radius | Drain updates | Staged total CPU ms | Staged p95/update ms | Staged max ms | Sync brush max ms |
|---|---:|---:|---:|---:|---:|---:|
| 64³ | 0.25 | 3 | 51.59 | 7.80 | 7.80 | 1.17 |
| 64³ | 0.50 | 3 | 65.95 | 8.26 | 8.26 | 3.71 |
| 128³ | 0.25 | 3 | 43.10 | 4.62 | 4.62 | 1.53 |
| 128³ | 0.50 | 50 | 206.83 | 6.56 | 7.81 | 11.18 |
| 192³ | 0.25 | 24 | 111.16 | 7.58 | 8.52 | 4.72 |
| 192³ | 0.50 | 177 | 643.61 | 6.17 | 10.57 | 38.13 |

High-resolution radius.5 required **177 drain updates** after the short synthetic gesture. Real catch-up time depends on frame cadence/workload and can be conspicuous. Queued work remains cancellable. Source allocation/resolution remains unchanged; no invented headset timing. Evidence `outputs/phase-4-0/crease-{baseline-build,baseline-tests,baseline-tests-retry,build,targeted-tests,tests,benchmark}.log` and raw benchmark JSON. No staging, commit, push or merge.

## Pinch validation and host measurements

Baseline for this continuation was the preserved uncommitted Phase 4 stage with **820/820** tests passing. Build/strict TypeScript now passes, with the existing bundle advisory; **836/836 full tests pass**, no failures/skips. New Pinch tests cover 64/128/192 deterministic compact-support geometry, exact generator/synchronous results, planar invariance/curved footprint contraction, conservative numeric inverse-map Jacobians, transformed/world-local layers, negative expanded coordinates, mirrored overlaps, freehand/Steady/Line, partial-publication cancellation with retained redo, exact Undo/Redo and native save/reload. Actual XR interaction tests verify release draining, arrow preview, tracking-loss cancellation and two-chunk/3 ms admission during ordinary processing. The prior cancellation remesh exception is retained and tested separately. No new actual-worker suite or physical Quest measurements.

Desktop browser smoke verified selecting Pinch from layer Move returns to Sculpt, then a real drag produced **one Undo action**; Undo showed 0/1 and Redo 1/0. Existing recovery checkpoints were retained. Evidence `outputs/phase-4-0/pinch-desktop.png`. Sidebar buttons now route through shared tool selection/ownership rather than leaving transform/stamp active.

Reproduce: `npm test`, then `node scripts/benchmark-pinch.mjs`. Six host cases, twelve simulated samples 16 ms apart, strength .7, hardness .4; exact final staged/reference voxels and one history action asserted. **Staged CPU includes sample work and meshing/draining; synchronous reference maximum includes brush work only**. These are different scopes, not speedup ratios. Single ordered Node v26.8.1 run; no rendering/real frame cadence/Quest timings. Large-radius 192³ required many drain updates; responsiveness does not imply instant settling.

| Grid | Radius | Drain updates | Staged total CPU ms | Staged p95/update ms | Staged max ms | Sync brush max ms |
|---|---:|---:|---:|---:|---:|---:|
| 64³ | 0.25 | 3 | 42.50 | 5.81 | 5.81 | 1.01 |
| 64³ | 0.50 | 3 | 60.99 | 8.04 | 8.04 | 3.58 |
| 128³ | 0.25 | 3 | 39.62 | 4.14 | 4.14 | 1.33 |
| 128³ | 0.50 | 46 | 181.27 | 6.62 | 7.64 | 9.77 |
| 192³ | 0.25 | 23 | 99.36 | 7.43 | 7.69 | 4.27 |
| 192³ | 0.50 | 150 | 501.83 | 5.92 | 13.12 | 34.21 |

Logs: `outputs/phase-4-0/pinch-{build,tests,targeted-tests,benchmark}.log` and raw benchmark JSON. Whitespace check passes. No staging, commit, push or merge.

## Original three-brush validation

Incoming active checkout was clean. Baseline strict TypeScript/Vite build and **791/791 tests passed**. Final full suite **820/820 passed**, no failures/skips; build passes with the existing bundle-size advisory. Deterministic geometry/sign/locality at 64/128/192, empty-space behavior, expanded negative lattice, transformed/mirrored layers, staged freehand/Line cancellation and exact Undo/Redo tests added. Existing Clay correctness, two-chunk/CPU-gap, Boolean/Bake, save/recovery and export regressions remain in the full suite. These are host checks; no new actual-worker suite or physical Quest test was run.

Browser smoke: Centra Sculpt loaded and all three brushes selected with correct pressed state and unchanged zero history; full sculpt gesture/plane readability acceptance remains pending. No UI performance claim.

Host probe: `npm test` then `node scripts/benchmark-advanced-brush.mjs`. Forty moving dabs per case, radius .26, amount .004, hardness .3; Node v26.8.1. Single ordered run, JIT/GC noise; **SDF dabs only, excludes history/meshing/rendering and is not Quest timing**. Logs and JSON in `outputs/phase-4-0/`.

| Grid | Brush | Total ms | p95 dab ms | Max dab ms |
|---|---|---:|---:|---:|
| 64³ | Flatten | 6.80 | 0.359 | 0.845 |
| 64³ | Inflate | 4.10 | 0.305 | 0.390 |
| 64³ | Scrape | 3.30 | 0.327 | 0.425 |
| 128³ | Flatten | 16.81 | 0.559 | 2.890 |
| 128³ | Inflate | 10.61 | 0.296 | 0.363 |
| 128³ | Scrape | 10.68 | 0.290 | 0.330 |
| 192³ | Flatten | 32.98 | 0.861 | 0.941 |
| 192³ | Inflate | 32.90 | 0.876 | 0.979 |
| 192³ | Scrape | 32.91 | 0.869 | 0.951 |

## Quest 3 checklist (pending)

- First retain Phase 3.7 pending **fast Clay 128³ two-chunk retest**: lag/cancellations, release settling to zero dirty chunks, exact Undo/Redo. Compare reproducible scenes; do not infer performance from this host probe.
- Each advanced brush, including Pinch: 64/128/192, surface follow and free tip, radius/strength/hardness extremes, stationary dwell/fast crossing, negative-coordinate expanded volume and transformed independent layer. Inspect ring/normal readability and the Scrape depth rule.
- Freehand, Steady, Line and mirror: release/drain, one Undo/Redo, cancel/tracking loss/session/menu interruption while drawing and draining; Support trigger alternate restores mode/settings. Confirm unchanged sticks/grips mappings and readable ten-tool wheel.
- Boolean preview/Bake, save/reload/recovery and selected/separate/composite GLB after mixed brushes. Long sessions: inspect field degradation and boundaries.
- Pinch and Crease specifically: curved/creased fixtures and a flat plane, repeated long strokes, small features/thin shells, hardness extremes, overlap at mirror bisector, contraction/inward normal arrow readability, Crease plane indentation and long-stroke quality, queue lag and release settling. Verify pending replay/dirty counts reach zero before saving/exporting.
- Record scene/settings, CPU/frame tails, dirty queue lag and thermal/memory evidence. Individual chunks, dense growth, cancellation/history may still hitch; no hard 3 ms ceiling.

## Next recommendation

Phase **4.1 procedural editable spline tubes**: persist control points/radii and evaluate a tube SDF with explicit preview/Apply/Bake, transformed-layer coordinates, bounded staged meshing and one history action. Keep it procedural/editable until Bake; do not represent editable tubes as a chain of destructive sphere dabs. Lighting rigs remain deferred to 4.6.
