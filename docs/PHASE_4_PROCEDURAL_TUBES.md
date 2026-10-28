# Phase 4.1 — Procedural spline tubes

Implemented 2026-10-28. Host acceptance passed; **physical Quest 3 acceptance remains pending**. No commit, push or merge authorized/performed. Incoming Phase 4.0 changes were retained; tracked incoming patch: `/private/tmp/vrapp-phase-4-1-incoming.patch`.

## User workflow

- Tool Wheel → **Tube** → hold Tool trigger and draw in free space; release commits one procedural layer/action. Lightweight translucent skin/centreline previews remain visible during regeneration. Tool stick changes radius before/during drawing. Steady uses the existing trajectory filter; Straight Line stores two endpoints. Tube placement is free space, using the existing 12 cm grip-relative tip.
- Tool Wheel → **Edit Spline**. Select a Tube in Layers, or point at a tube surface and press trigger. Point at a yellow control handle, press/hold Tool trigger, move, release. Tool stick changes the selected point radius; while idle it groups an entire stick gesture into one action, finishing at neutral. While dragging, radius belongs to the same position edit. Source remains unchanged until release and successful regeneration.
- Options → **Insert point after selected**, **Delete selected point**, **Close/Open spline**, **Bake to Sculpt Layer**. Open-path endpoint insertion splits the final segment. Keep at least two open / three closed points. Context errors leave the source intact.
- **Transform Layer** uses existing tool-grip movement/wrist rotation and numeric/uniform scale controls. Visibility, locks, selection, display colours and render styles are existing layer controls. Support controls keep their current mappings. Alternate brushes are intentionally unavailable while Tube/Edit Spline owns input; brushes require an explicit bake of procedural layers.
- Native files retain the editable definition. Desktop adds Tube/Edit Spline selectors and contextual actions in Precision settings. Drawing/handle manipulation is currently XR-only; desktop numeric spline-point manipulation is not implemented.

## Architecture and accuracy

`SdfLayer.procedural?: TubeSource` is optional source metadata; stable layer ID is tube identity. Each ordered control has its own stable ID, local XYZ and positive radius. Open/closed state and `centripetal` / `linear` interpolation persist. Existing layer metadata supplies transform, visibility, locking, Boolean operation, name/order and existing display preferences supply visual settings. All old files remain readable. Optional source metadata is retained in native v3/v4 records without changing voxel payload layout. Older app versions will only understand the evaluated cache; they cannot edit splines.

`PreparedTube` uses Three's centripetal Catmull–Rom with endpoint handling and a bounded sampled centreline. Smoothstep interpolates control radii along curved spans; linear paths use linearly varying radius. It evaluates the exact minimum of distance-minus-radius along each **sampled linear-radius segment**, including endpoint balls. BVH conservative centreline boxes and maximum radii prune queries, visiting nearer nodes first. Coincident points reduce to balls; steep radius slopes select the containing endpoint ball; self crossings are implicit unions and remain finite.

The continuous curve approximation is heuristic, not a certified Hausdorff bound: curved spans get at least eight subdivisions and roughly a half-voxel density based on three neighboring control-polygon edges. Closed paths wrap neighbor selection. Bounds conservatively enclose every sampled swept ball, plus tolerance and three lattice samples of padding. The cache retains initial resolution/extent and voxel step and expands the existing lattice in either direction; it never rescales a path to fit a cube. Distances saturate to the existing native ±4×extent far-field range.

Limits: 2–256 controls; 3 minimum closed; 8192 sampled segments; radius .005–2 source units; controller drawing radius retains current .12–.50 brush limits. Dimensions ≤512/axis, aggregate source budget 2×192³ samples, eight layers, one million aggregate triangles, 256 MiB tracked staging admission. Positive radius does not guarantee visibility below voxel scale: use roughly two or more voxels across important features. Bounds/shape complexity beyond limits reject clearly and preserve the prior committed source. At self intersections the field preserves a valid zero surface, but is not a globally exact metric distance inside overlapping branches.

Steady paths are simplified by position/radius RDP at .35 source voxels, retaining endpoints. Fast poses are joined by continuous spline segments, so missing intermediate controller poses do not create disconnected dabs. There is no implicit cumulative voxel deformation. Point deletion/insertion preserves other point IDs; all regeneration starts from the definition.

## Scheduling, ownership and history

- Reuses `XRToolInteraction` and the existing tool/layer preview locks, controller role/connection identity, workspace matrix capture, menu/grip/diagnostic arbitration, trigger neutral arming and lifecycle cancellation. Helpers live under controller tracking, outside project/export roots.
- Drawing/editing updates only source drafts and bounded helper buffers. Preview skin has at most 512 rings ×8 sides, line 8192 samples and 256 pooled handles. Attribute buffers are reused; obsolete runtime meshes/materials are disposed.
- On release/contextual commands, one candidate evaluates cooperatively, yielding every **128 samples**, with a 3 ms between-batch pump admission deadline. Candidate meshing admits at most **two chunks / 3 ms**, yielding between batches. Allocation, spline preparation, an individual chunk and GC remain indivisible and can exceed budgets. No synchronous full-scene rebuild is added to controller updates.
- Only a fully evaluated/meshed/validated candidate publishes source, cache and one history action atomically. Cancellation, disconnect/handedness switch, workspace/target change or stale metadata reject staging. Pending regeneration blocks conflicting edits/export/recovery; latest committed source survives. New jobs do not accumulate during continuous dragging: evaluation begins on release; starting another gesture waits for completion or cancellation.
- Small edits rebuild the **selected tube's full cache**, not unrelated sculpt layers; no local tube-cache patching or worker evaluator yet. Heavy/high-resolution tubes can take seconds to finish. Live Boolean Preview uses the existing derived compositor after commit, not continuous composition while dragging. Original Phase 3.7 Clay two-chunk admission and full-update CPU-gap accounting remain intact.
- Creation uses existing layer-creation/Bake timeline retention. Edits retain exact before/after source/cache pairs for Undo/Redo; eight tube edit cache entries maximum, counted in staging admission. Undo/Redo may synchronously reconstruct one tube runtime and can hitch, like existing history. Source caches remain independent; redo invalidation and cancelled edit redo preservation are tested. History is session-only.

## Boolean, baking, save/recovery and exports

Existing compositor reads the evaluated tube SDF through normal layer/world transforms. Ordered Add/Union and Subtract/Difference work; the first visible layer still initializes the result regardless of its operation. Sources are never implicitly combined.

Explicit one-source Tube Bake copies the evaluated lattice exactly, preserving density, expanded origin/dimensions and layer transform in a new ordinary SDF layer, with independent storage and no procedural metadata. The source stays visible by default; Bake is one undoable action. Brush guards reject Clay/Smooth/advanced/Move/Stamp/reset/resampling on source layers and direct users to bake. The normal multi-layer Bake/Merge flow keeps its original behavior. At 192³, existing aggregate layer/voxel/memory budgets may require a smaller unrelated layer or reduced retained history before adding another full-resolution bake. This is a rejection, never an implicit resolution downgrade.

Native save/load and Phase 3.4 recovery worker use layer metadata, so source definition, transforms/flags and display settings survive. Recovery waits for completed staging; restored history starts empty as before. Invalid radii/coordinates/IDs/interpolation/point counts reject before publishing. Existing 64 KiB metadata and project size limits still apply.

Fast/Standard/High exports consume ordinary committed chunk surfaces through `exportSources`; all presets use the evaluated cache at source density, with the existing export cleaning/optimisation semantics. Guides/handles/drafts are excluded by ownership. Native files keep editable source; GLB is conventional geometry. Export does not promise sub-voxel spline tessellation or a higher source-resolution rebuild.

## Actual host validation

Evidence: `outputs/phase-4-1/`.

- Baseline strict TypeScript/Vite production build PASS; **856/856 tests PASS**, no failures/skips, four-process test concurrency.
- Final `npm run build` PASS (strict TypeScript plus Vite); existing >500 kB bundle advisory remains.
- Final `npm test -- --test-concurrency=4`: **878/878 PASS**, zero failures/cancellations/skips; 22 new tube tests. Covers analytic segment distances/rounded caps, variable radius against independently dense-sampled balls, curved/closed/coincident/self-crossing paths, IDs/insertion/deletion, exact repeated edits/Undo/Redo, transformed coordinates, expanded negative grids at64/128/192, Boolean Add/Subtract, exact Bake/source preservation and Clay/Smooth, native/recovery worker, all GLB presets, fast/Steady/Line trajectories, live radius, contextual actions, preview buffer reuse and ownership/lifecycle cancellation. Existing brush/controller/scheduler regressions all pass. `git diff --check` clean.
- Real browser smoke on port5174: startup, Tube/Edit Spline option switching, loaded `editable-tube.form`, rendered9096 triangles; context insertion restored five editable controls,9080 triangles and exactly1 Undo action; native autosave checkpoint visibly completed. `browser-spline-edit.png` records contextual controls. This is a desktop browser check, not immersive hardware testing.

Single host run `node scripts/benchmark-tubes.mjs` (no renderer, no headset):

| Resolution | Sampling CPU ms | p95/max sample slice ms | Meshing CPU ms | max mesh update ms | Triangles | Max mesh residual in voxels |
|---|---:|---:|---:|---:|---:|---:|
|64³|73.24|0.052 /2.740|22.00|4.858|9096|.322|
|128³|792.54|0.080 /1.117|52.71|3.928|37356|.324|
|192³|3009.56|0.099 /1.119|99.20|5.856|84564|.324|

Residual measures exported mesher vertices against the prepared sampled field; it is not a continuous spline geometric proof. Sampling totals exclude cooperative suspended time; samples include initial preparation/allocation. Mesh batches are up to two indivisible chunks; CPU slice figures are not XR frame timing. Raw `tube-benchmark.json` and reproducible script retained. No statistically robust speedup, thermal, GPU or Quest performance claims.

Existing `node scripts/benchmark-clay-meshing.mjs` also passed exact staged/reference voxel assertions. At128³, one/two-chunk drain updates37/13; p95 CPU/update2.59/3.57 ms; max2.85/4.12 ms; total120.96/160.26 ms. Geometry133192 triangles for synchronous/one/two. At64³ one/two drain7/3. Raw output captured as `clay-scheduler-benchmark.json`; historical Phase3.7 evidence was restored after that script wrote its default destination.

## Files

New: `src/procedural-tube.ts`, `src/xr-tube-tool.ts`, `tests/procedural-tube.test.mjs`, `scripts/benchmark-tubes.mjs`, this handover, `outputs/phase-4-1/` logs/benchmark/native fixture/screenshot.

Extended: `src/layers.ts` optional validated source metadata; `src/independent-layers.ts` atomic evaluation, cache history, sculpt guards, exact Tube Bake and resource admission; `src/editor-tool-state.ts` tools/context commands; `src/xr-brush-sizing.ts` live Tube radius; `src/xr-clay-stroke.ts` interaction interface only for this phase; `src/xr-shape-stamp.ts` shared routing; `src/xr-experience.ts` construction; `src/xr-menu-model.ts` context dispatch; `src/main.ts` desktop options and no accidental desktop brushing in spline modes; `scripts/compile-core.mjs`; `docs/DEVELOPMENT_STATUS.md`. Native project/recovery/export codecs preserve new source metadata through existing layer metadata, with no parallel codec/runtime. Incoming Phase4.0 files remain uncommitted and retained.

## Physical Quest 3 checklist — ALL PENDING

Use Quest Browser, Touch Plus and both handedness settings. Do not mark any item passed before user confirmation.

1. At64³ select Tube; hold Tool trigger and draw a curved mid-air path, including quick movement.
2. Release, keep the controller responsive while regeneration finishes, inspect caps/continuity; one Undo action.
3. Enter Edit Spline; choose the tube from Layers and by ray-pointing at its surface.
4. Point at/grab a handle and reposition it with the controller. Verify workspace/layer transforms do not move it unexpectedly.
5. Inspect live centreline/radius preview, release and verify smooth reshaping without cumulative voxel damage.
6. Tool stick changes selected point radius; neutral ends one action. Test simultaneous grab+radius and drawing-time radius.
7. Make a tapered tube and locally widened/narrowed sections; inspect thin geometry at64/128/192.
8. Insert/delete a point; close/open the path; ensure invalid minimum-count deletion is rejected without corruption.
9. Transform entire tube with existing layer grip/wrist rotation and uniform scale; test visibility/lock/selection.
10. Support stick Undo/Redo through creation, point/radius/context edits and transforms; verify exact restores.
11. Save native, reload and resume editing. Wait for autosave, interrupt/re-enter session, restore checkpoint and verify source controls.
12. Bake to Sculpt Layer; confirm new independent selected layer, source preserved, density/placement match, one Undo.
13. Sculpt baked layer using Clay/Smooth/Move and advanced brushes; original tube remains unchanged.
14. Export Fast/Standard/High GLB, including selected/separate and Boolean result. Inspect in an independent viewer; no helpers.
15. Undo/Redo Bake and source edits; confirm the original editable source remains available.
16. Measure responsiveness/frame tails/memory and release latency for long curved paths at64/128/192, including pending cancellation by grip/menu/tracking loss/disconnect/handedness/session exit. Re-test Phase3.7 fast-Clay two-chunk/CPU-gap behavior. No performance sign-off yet.

## Follow-up and roadmap

Prioritize physical acceptance and measured worst-case release latency; then consider worker evaluation and narrow-band/local tube-cache invalidation, incremental native source-only storage, richer desktop point controls, preview frame/memory telemetry and spline-aware surface picking. Existing indivisible allocation/chunk/history hitches and sub-voxel limitations remain explicit.

Preserve agreed next phases: **4.2 VR Menu and Tool Wheel Redesign; 4.3 World Settings and Studio Background Presets; 4.4 Mirror Grid and Turntable / Lathe; 4.5 VR Reference Images; 4.6 Three-Point Lighting and Editable Light Rigs.** None started automatically.
