# Phase 6.3 — Live Boolean Shapes & Cutting

Updated 2026-11-05. Physical Quest acceptance remains pending.

## Editing workflow

Create primitives normally. On desktop select the target in Layers, open **Live Boolean Shapes** directly inside its layer card, choose another source and **Add / Union**, **Subtract / Difference** or **Intersect**. Each modifier names its source and supports changing operation, enabling/disabling, removing, moving earlier, and **Select source**. Edit the selected source in Primitives or with the existing numeric/gizmo transforms, then select the target again to inspect its stack. The layer list marks live results and consumed sources.

In VR: Support Layers menu → target layer actions → **Boolean order… → Live Boolean Shapes…**. Cycle source, choose Add/Subtract/Intersect, cycle the selected modifier, then Edit source, Enable/Disable, Remove, Move earlier or Operation. Existing primitive placement/keypads, transforms, layer selection and both logical hand configurations remain authoritative. **Bake visible result** creates a sculpt layer; the headless target Bake described below can instead bake one result. Plane Cut remains the separate tenth Tool Wheel sector and continues splitting sculpt layers into two independent layers. Remove references or explicitly Bake before cutting a live target/source.

The target's own shape is the initial left operand. The saved modifier array folds top to bottom: `((target op source1) op source2)`. Sources can themselves have modifier stacks. Source transformations are their inherited model/world transformations; moving the target alone does not implicitly move independent cutters. Parent them together when they should move together. Workspace zoom/turntable presentation never enters the graph.

An enabled source reference consumes the source's independent Boolean output, preventing duplicate cutter meshes and cutter exports. Sampling an explicit operand does **not** depend on its eye state. The eye controls its independent output when released; disabling/removing the last enabled reference releases it. A hidden result still consumes its references, so hiding the result does not reveal its cutters. Locks do not disable an already defined operation; they prevent editing it. Shared sources are allowed and can contribute to multiple results.

**Boolean view** shows a completed, current derived mesh when idle. While transforming or awaiting a refreshed result, it shows the editable source shapes instead of an empty viewport; the stale/partial Boolean mesh is hidden. **Layers view** deliberately inspects individual source geometry; exports of live scenes still use the composed result. Rebuilds debounce for 120 ms after metadata changes; continuous dragging does not start a full rebuild every frame. Source shapes remain visible while the result refines cooperatively after a pause; the result replaces them when current. This is a completed-result preview, not fluid per-frame CSG mesh deformation.

### Desktop interactive dimensions

Select a parametric primitive and choose **Scale (R)**. Handles use the primitive’s **local axes**, including under a rotated/scaled parent:

- Box: X changes width, Y height, Z depth.
- Cylinder: Y changes height; X or Z changes diameter, keeping the circular cross-section.
- Sphere: any axis changes diameter, keeping the shape spherical.
- The centre handle changes all dimensions together. Ordinary sculpt layers and selected groups retain uniform transform scaling.

During dragging a borrowed source mesh shows the proposed dimensions immediately and the viewport status displays dimensions in the selected physical unit. The source parameters, saved transforms, voxel/mask/paint fields and history are not modified during this preview. On release the existing primitive regeneration backend stages one parameter edit, regenerates once and records one Undo step; the live Boolean then refines. No non-uniform transform is saved. Existing dimension/aspect limits apply. Escape, pointer cancellation, blur/session interruption or disposal cancels the preview/preparation. The existing numeric uniform-scale field still edits the object transform. These dimension handles are desktop controls; XR scaling keeps its existing transform behavior.

## Model, validation and lifecycle

`SdfLayer.booleanModifiers` stores stable modifier IDs, source layer IDs, operation and enabled flag. This persistent graph is separate from the older flattened layer operation/order. Unconsumed roots still combine in that legacy composition order. Graph and transform-parent hierarchies are separate and inspectable. Validation rejects missing references, duplicate modifier IDs, self/cyclic references including disabled edges, depth beyond eight, stacks beyond 32 and expanded traversal beyond 256 visits. Existing eight-layer limits still apply. Involved operands must have supported uniform inherited scale; resize primitives through their dimensions rather than introducing non-uniform scale.

The compositor reuses the authoritative analytic primitive distance functions and read-only sculpt field samplers, including positive exterior extension. Negative is inside: union `min(a,b)`, difference `max(a,-b)`, intersection `max(a,b)`. Modifier edits and source transforms never rewrite source fields. Sculpt targets with live modifiers require explicit Bake before deformation. Referenced sculpt sources cannot be deleted or split until references are removed.

Bounds include reachable operands conservatively, include hidden referenced sources, use analytical primitive extents and ignore empty dense sculpt fields. Live feature sampling requests at least eight samples across a primitive's smallest dimension, subject to the existing 64³/128³/192³ cap. Widely separated operands can therefore exceed quality limits even when their resulting solid is small. Empty intersections produce no mesh. Exports reject capped live results; live Bake rejects insufficient requested resolution. This is bounded sampled CSG, not exact polygonal CAD or guaranteed feature preservation below the admitted grid spacing.

One revisioned async job runs per compositor. Sampling and colour preparation check a roughly 3 ms deadline every 128 samples/vertices; extraction uses two chunks/3 ms. Individual chunks, GC and host scheduling can overrun the target. Metadata changes, graph edits, cancelled transforms, tracking loss, XR suspension and disposal invalidate in-flight work. Stale work cannot publish/export; tracking suspension pauses scheduling until tracking returns. Scene replacement disposes the old editor/cache. Geometry/grid allocations retain the existing triangle limits and add a 256 MiB combined tracked source/cache admission guard; tracked memory is not process RSS or GPU memory.

## Persistence, Bake, paint and exports

Native projects containing active stacks write version **12**; versions 1–11 remain readable. Metadata flows through immutable snapshots, the actual recovery worker, browser library, Save As, portable native files and library duplication. Duplication remaps layer references and modifier IDs. Single-layer duplication keeps references to the existing independent sources and creates new modifier IDs. Invalid saved references/cycles reject; older app versions reject v12.

Each stack replacement records one history action, including reorder/enable/remove; failed validation retains original metadata and redo. Source editing uses existing transform/parameter history. Explicit Bake stages an independent sculpt field, retains all source fields/parameters/transforms, hides chosen sources and supports one-step Undo/Redo. A fitted primitive's Bake button chooses 128³ for a live target; target command Bake also uses 128³. Current visible-result Bake includes all output roots. Hidden referenced sources participate, and inherited visibility is restored using local eye state. Locked sources must be unlocked before Bake changes their visibility.

Generated faces use the operand winning the SDF comparison, including the cutter on difference walls; equal distances retain the earlier owner. Paint samples use that owner's inverse world transform and source paint/base colour. Preview/export vertices carry these colours. Bake transfers existing paint when source paint is present; unpainted baked areas retain the existing Bake/base-colour convention. Masks remain on their source grids and never change CSG geometry; a newly baked result starts unmasked. Paint/mask channels are not silently resampled into source fields.

GLB and STL use the same current derived triangle buffers, not a separate Boolean engine. Calibrated GLB metres and project-scale/target-override STL behavior remain Phase 6.2 semantics. Selected-source export rejects for live scenes; choose visible/unified result. Stale, capped, overbudget, empty or non-printable output rejects through the existing export guards/print checks. Sources, references, images, guides, lights, skybox and Cut overlays cannot enter the result. Library thumbnails use the current Boolean mesh instead of cutters; thumbnail failure retains the existing save fallback.

## Commands and validation evidence

See [modelling commands](MODELLING_COMMANDS.md). `boolean.create`, `boolean.update`, `boolean.remove`, `boolean.bake`, `boolean.get` and `boolean.list` adapt the same backend; no second engine, DOM/XR dependency, network API or global browser interface exists. Mandatory editor revision and optional cancellation/policy checks retain the Phase 6.2.1 contract. Atomicity is per command; multi-command batches remain deferred.

Evidence lives in `work/phase-6-3/`: baseline/final check logs, focused tests, controller tests, benchmark JSON/log and desktop screenshot. `tests/live-boolean.test.mjs` covers scalar signs, ordered stacks, movement/resizing, inherited poses, empty overlap, unchanged fields, locks/invalid graphs, atomic history, native/library/recovery, headless parity, masks/paint provenance, actual encoded GLB/STL bore and physical dimensions, cancellation, caps and disposal races. Transform suites additionally cover all primitive handle mappings, exact unchanged inherited poses, preview-only fields/history, cancellation/invalid sizes, atomic release/Undo/Redo and a resized live cutter’s changed outcome. The controller bridge tests exercise both logical hands using real ray targets and trigger ownership. Browser testing created the 40 × 30 × 10 mm box, retained and edited its cylinder to 3 mm, rotated it 90°, and displayed the hole; console errors/warnings were empty.

Run `node scripts/benchmark-live-boolean.mjs` for the 64³ empty-base fixture and three cutter relocations at each cap. The recorded Node v26.8.1 run used 112³ at caps 128/192, about 216,040 triangles and roughly 0.65–0.68 s wall per refinement. Sampling slices reached 3.05 ms and extraction/colour slices 5.80 ms. Maximum tracked source+cache memory was 37,288,816 bytes (35.6 MiB). Cap 64 was detail-limited and is refused for live export. These nine host observations do not establish headset p95, GPU/RSS peaks or sustained-session behavior.

## Physical Quest 3 acceptance — all pending

- [ ] Record Quest OS/Browser/app revision. In Studio and Passthrough, exercise both dominance settings, menu discovery, exact keypad entry, source selection, enable/operation/reorder/remove and Undo/Redo. Confirm Cut remains independently discoverable and unchanged.
- [ ] Reproduce the 40 × 30 × 10 mm box with 3 mm cylinder hole; relocate/resize/rotate the cutter, nest operands under rotated/scaled parents and verify mm/cm/in calibration while navigating the workspace.
- [ ] Test continuous dragging, pause/refinement, visibility/locks, hidden parents, tracking loss/reconnect, menu/grip ownership, session suspension/re-entry and project replacement during evaluation. Confirm no stray strokes, ghost cutters or stale result flashes.
- [ ] Save, Save As, duplicate, reopen and recover live projects with paint/masks, references, guides and thumbnails. Verify calibrated controller-guide clearance and Studio Skybox remain correct.
- [ ] Bake explicitly, sculpt/paint/mask/Cut the independent result and Undo/Redo. Confirm unchanged retained sources, material provenance and masks. Inspect calibrated GLB/STL in the intended slicer, including the bore, dimensions and export exclusions.
- [ ] Measure XR frame timing, responsiveness, GPU/process memory and repeated edit/Bake/delete lifecycle over a sustained session. No hardware release approval is implied by host tests.

Roadmap: **6.4 Surface Snapping / Alignment**, then **6.5 Radial Repetition**.
