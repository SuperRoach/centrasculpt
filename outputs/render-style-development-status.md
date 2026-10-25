# Development Status — Centra Sculpt / vrappPOC

Last updated: 2026-10-25. **Current phase: 1.11, completed.** Next recommended phase: **1.12, shape-placement usability and performance**. Keep the six-part completion report structure at the end of this document for every subsequent phase.


## Current Phase 1.11 — Interactive Shape Stamping

Phase 1.10 historical notes below describe the preview-only baseline; this section supersedes those restrictions. All four procedural shapes now support explicit Add/Subtract stamps into the active independent SDF layer. Select a shape, adjust dimensions/rotation/uniform scale, hover a visible sculpture surface and left-click once. One completed click is one sparse undo action. A drag never applies or repeats stamps. Disable **Follow pointer on visible surfaces** for numerical placement, then click **Stamp once at preview** (or the viewport) to apply the current pose. Editing numerical position disables pointer following automatically. Orientation, size and operation remain between stamps. Ghost state still clears on native import and never enters files, Bake, CSG or exports. Hide the ghost/Escape to resume brushes and layer gizmos; right/middle/wheel camera controls remain available.

### Technical decisions and architecture

- New `src/shape-stamp.ts` prepares a frozen validated sparse patch without modifying the source. The explicitly selected target must match the definition, remain visible/unlocked, and have positive uniform scale. Parameters, target identity and all staged distance/boundary limits validate before any writes. Invalid/oversized/clipped commands preserve voxels and redo.
- Definitions map shape-local into target-layer-local space. A prepared kernel/inverse evaluates in local SDF distance units; parent transforms therefore do not resample voxels or multiply parent scale twice. Add uses exact Float32 `min(old, shapeDistance)`; Subtract uses `max(old, -shapeDistance)`. No brush smoothing, layer CSG operation changes, triangle merging or automatic resolution changes occur.
- **Far-field correctness:** a primitive's geometric AABB alone is insufficient for exact min/max. The candidate AABB expands by the maximum supported stored distance (4 × volume extent), so scans can cover the whole dense grid. Per-voxel distance-to-AABB lower bounds skip samples proven unable to change; expensive primitive evaluation runs only on remaining candidates. Only changed values are staged/written/recorded, including legitimate positive/negative far-field changes beyond the solid bounds. This deliberately favors exact stored field semantics over a truncated narrow band.
- The sparse patch grows typed buffers geometrically; it is not a full snapshot. `IndependentLayers.stampShape` records one existing `shape-stamp` history transaction and one global layer-aware timeline entry. No-op stamps retain redo. Layer-level operations/order/transforms are unchanged. New stamps invalidate redo consistently with strokes. Other layers and their chunk geometry retain identity.
- `IncrementalMesher.invalidateSample` uses the existing two-sample gradient/cell halo. A changed sample schedules chunks that already have surface geometry, or any affected chunk if its sign changes (including empty chunks gaining surface). Positive-to-positive/negative-to-negative updates that cannot reach an existing surface skip extraction. Full-reference tests compare positions AND normals across every chunk. Sparse undo/redo now use the same per-sample invalidation callback; source brushes retain their prior update path.
- `src/shape-placement.ts` separates world→layer-local surface placement and click intent handling. Down freezes the definition/target; primary up within five pixels commits once. Secondary buttons, pointer cancel/lost capture, focus loss, changed target, excessive movement and competing command actions cancel. Pointer placement raycasts visible source meshes or the derived Boolean mesh, never the ghost. It positions the shape **centre** on the hit surface and keeps its chosen orientation; no automatic normal alignment.
- Existing compositor dirty notification receives the exact changed bounds. Its next normal tick or export flush refreshes the derived Boolean result. Layers remain independent; explicit Bake remains the only creation/combination workflow.
- Native v3 needs no new sculpture schema: stamped Float32 samples are ordinary target data. The colour-save follow-up remains supported: optional display colours/mode persist; temporary shapes do not. Separate and Boolean GLBs remain neutral and exclude ghost objects.

### Changed files

New: `src/shape-stamp.ts`, `src/shape-placement.ts`, `tests/shape-stamp.test.mjs`, `scripts/benchmark-stamps.mjs`.

Modified: `src/independent-layers.ts` (stamp command/stats and sparse undo invalidation); `src/mesh.ts` (surface-aware per-sample invalidation); `src/history.ts` (optional replay change callback); `src/shape-preview.ts` (session pointer-follow state); `src/shape-ui.ts` (placement toggle, apply button, guidance); `src/main.ts` (surface picking, single-click routing, timings/input guards); `src/ui.ts` (phase label); `src/shapes.ts` (contract comment); `scripts/compile-core.mjs`; `package.json` (`benchmark:stamps`); README; this handover.

Protection: no Git repository is available. Before edits, the complete source was archived in `outputs/phase-1-10-before-1-11.tar.gz`; its SHA-256 file was verified. No existing project file was deleted. No new dependencies or network packages were required.

### Build, tests and performance

`npm run build` passed strict TypeScript and Vite. `npm test` passed **167/167, 0 failures** (145 prior + 22 new). Coverage: all four primitives × Add/Subtract against every exact reference voxel; local bounds/far field; rotated/scaled definitions; transformed independent targets; 64³/128³/192³; full mesh/normal reference equality after local updates and replay; hidden/locked/stale target/invalid transform/bounds protection; disconnected solids/empty volumes; one-action history, redo invalidation and no-op preservation; pointer gestures; source immutability; native data/colour round trips; compositor refresh; neutral binary GLBs; subsequent brush edits. Existing 145 tests, including Bake and project regressions, remain passing.

`node scripts/benchmark-stamps.mjs` / `npm run benchmark:stamps`: Node v26.8.1, one sample per shape/operation/resolution after source initialization, dimension .5, local position [.25,.15,.75], rotation [.2,.35,.1], scale 1. CPU only; total includes history capture, commit, writes and meshing; excludes UI/render/GPU and derived CSG refresh. Uncontrolled timings, not frame guarantees:

| Resolution | Evaluation range | Mesh range | Total stamp range | Chunks rebuilt |
| --- | --- | --- | --- | --- |
| 64³ | 5.6–18.4 ms | 12.3–31.8 ms | 27.4–42.2 ms | 9–12 / 64 |
| 128³ | 35.0–100.5 ms | 22.8–47.1 ms | 75.1–168.2 ms | 13–24 / 512 |
| 192³ | 118.2–339.5 ms | 37.1–85.4 ms | 177.0–581.7 ms | 21–43 / 1,728 |

Source-brush benchmark (`node scripts/benchmark.mjs outputs/phase-1-11-source-benchmarks.json`): local meshing medians **14.4 / 10.8 / 11.2 ms**, versus Phase 1.10 **14.9 / 10.8 / 11.6 ms**. No detected source-brush CPU regression within run variability. Stamp mesh work affects more chunks and is not directly equivalent to the previous 12–15 ms brush baseline. Production JS ~686.7 kB minified / 181.1 kB gzip; existing >500 kB advisory remains. Full evidence: `outputs/phase-1-11-*-benchmarks.json`, build/test logs and completion report.

Browser validation: a rotated box pointer click carved the 64³ sphere, reported **4,583 changed voxels, 12/64 chunks, 48.5 ms total**; Cmd+Z restored 31,536 triangles and Cmd+Shift+Z restored the stamped 32,264-triangle geometry. A subsequent left drag retained **1 undo / 0 redo**, proving no automatic repetition. A second browser check stamped an independent 128³ layer: **41,569 changed voxels, 27/512 chunks, 111.1 ms total**. Before/after native files confirmed zero changed voxels in the hidden 64³ Base and unchanged metadata for both layers. Both real GLBs contained one neutral opaque node and 131,596 triangles, with no ghost. Reopening and saving the stamped native file again produced byte-identical data. The numeric-pose stamp button changed 18,234 voxels in one action; Undo restored the prior geometry, and locking the target disabled the stamp button. Further evidence is recorded in the completion report.

### Known limitations / technical debt

- Dense candidate scans may cover the full layer even for small stamps; exact far-field updates can produce large sparse histories. Existing 32 MiB/action soft budget retains the latest large action; voxel staging and history Map capture add transient memory. Large Add and convex stamps can briefly block the main thread (up to ~0.58 s in this sample). There is no worker or progress/cancel UI for stamp execution.
- Add conservatively rejects any transformed shape AABB extending within one voxel of the fixed volume boundary. It never silently clips, grows bounds or resamples. Subtract can overlap/extend beyond bounds, provided resulting values stay finite, within supported distance limits and positive on boundaries. Very large cutters may be rejected. The UI displays a clear error; a different layer or manual reposition/resize is required.
- Only positive uniform shape/layer scale. Pointer placement is centre-on-surface, keeps orientation, and can use another visible layer as a placement reference while still editing only the active layer. If that hit lies outside the target volume, Add fails clearly. No placement-plane/depth drag or ghost transform gizmo.
- Grid spacing limits sharpness/tiny detail. Marching tetrahedra and gradient normals approximate the sampled sharp boundary. Sphere ghost tessellation remains a display approximation.
- Preview settings are session-only and not undo actions; stamped data is undoable. Native reload intentionally clears all history and preview. Colour preferences continue saving normally. Current aggregate import triangle/voxel limits and camera framing limits still apply.
- Allocation exhaustion and low-level renderer failures are not recoverable transactional jobs. Validation errors occur before writes; normal successful commits have exact sparse undo. Worker/off-thread staged meshing would improve failure isolation.
- No continuous drag stamping, VR input, thumbstick scaling, implicit layer merges or deformation tools were added.

### Recommended Phase 1.12 approach

Prioritize usability and latency: a separate ghost TransformControls proxy with exclusive input ownership, optional surface-normal alignment/depth offset and explicit target-volume bounds feedback; preserve numeric/local/world placement. Keep one-click/one-action semantics and layer-local math shared by all input methods. Move large stamp planning into a worker with a frozen layer ID/volume revision and cancellation; stage sparse buffers off-thread, validate/recheck before commit and schedule chunk work in cooperative batches. Consider per-block SDF range caches for exact candidate pruning before adopting a documented narrow-band field representation. Optimize bulk sparse history capture to accept validated typed patches without Map duplication. Preserve exact undo, colour metadata, native compatibility, hidden/locked rules and neutral separate/Boolean export tests. Continuous stamping or VR should be separate explicit scope, reusing commands instead of bypassing ownership.

## Completed phases

| Phase | Delivered |
| --- | --- |
| 1 baseline | Vite + strict TypeScript + Three.js; sculptable dense SDF sphere; Add/Subtract; orbit/pan/zoom; radius, reset and GLB |
| 1.2 | Gradual clay displacement, Smooth diffusion, strength, stroke spacing and gradient normals |
| 1.3 | Sparse stroke-level undo/redo; keyboard shortcuts; validated native projects |
| 1.4 | Chunk-local extraction/rendering, watertight boundaries, hardness, 64³/128³/192³ resolution, timings |
| 1.5 | VolumeStore, SculptProject/SdfLayer/LayerStack, layer-aware native v3, shape intent definitions |
| 1.6 | Independent sculpting layers, flags/order/duplication, per-layer resolutions, session-only colours, separate GLB nodes |
| 1.7 | Independent metadata/matrix transforms, uniform-scale gizmos/numeric fields, transformed sculpting, transform history |
| 1.8 | Non-destructive ordered Boolean preview, operation/reorder history, derived-grid caching and Boolean GLB |
| 1.9 | Explicit confirmed SDF Bake into a new independent editable layer, source retention, cancellation and one-action replay |
| 1.10 | **Procedural Sphere, Cube/Box, Triangular Prism and Square Pyramid kernels; Shape Library UI and cached non-destructive ghost preview** |
| **1.11** | **Explicit one-click Add/Subtract shape stamps, pointer/numeric placement, exact sparse undo and surface-aware local remeshing** |

## Phase 1.9 summary

Bake / Merge samples the visible ordered Boolean field directly into a fresh 64³/128³/192³ dense grid, never concatenating meshes or modifying source voxels. A confirmation dialog selects name/resolution, previews padded bounds and memory, and defaults to hiding sources. Kept-visible sources select Separate Layers to avoid immediately recombining originals with the approximation. Preparation is cooperative and cancellable, with atomic commit after validation/meshing.

Baked grids use normalized local bounds ±1.6 and TRS metadata restoring world size, maintaining native v3 and brush compatibility. Before/after stack metadata, visibility, active selection and view mode form one creation transaction. Undo detaches the new runtime; redo reinstalls its original voxel arrays and chunk geometry. Retained redo storage counts toward capacity. Ordinary sparse sculpting history and independent resampling continue to work. Source data/metadata were verified intact except requested visibility, and native Save/Open/Save was byte-identical. The previous phase passed 121 tests. Its explicit bake benchmark was approximately 115 / 487 / 1,391 ms total at 64³/128³/192³. Detailed historical evidence remains in `outputs/phase-1-9-*`.

## Historical Phase 1.10 architecture and ownership

- `SculptProject` owns `LayerStack`; each `SdfLayer` owns independent `VolumeStore`/dense `SDFVolume`, local bounds/resolution, stable ID and metadata. No implicit merging or source resampling is permitted.
- `IndependentLayers` owns a runtime per layer: `IncrementalMesher`, `ChunkSurface`, material, sparse `SculptHistory`, timings and global chronological history. TRS changes update matrices only; voxel edits rebuild affected chunks plus the gradient halo.
- `BooleanComposite` reads visible independent volumes via inverse transforms into a disposable bounded world grid. It is rendering/export data, excluded from native serialization. Stack order is top to bottom; the first visible layer initializes the field. Union=min, Difference=max(a,-b), Intersect=max.
- Bake is an explicit new-layer creation command. Its sampling and deferred/batched runtime preparation are separate from commit/history. Sources remain stored.
- `src/shapes.ts` owns stable IDs, immutable human-readable metadata, dimension rules, validated ShapeDefinition and future input/intent ports.
- `src/shape-library.ts` owns side-effect-free primitive preparation, signed distances, local/world bounds and composed transform sampling. It does not write VolumeStore data or depend on UI/controller logic.
- `src/shape-preview.ts` owns session-only `ShapePreviewModel` and `ShapeGhost`. The model associates the preview with the active layer. The ghost is a scene sibling, never a child of project/export groups. It holds at most four small canonical geometry pairs; dimensions/poses update object matrices/scales only.
- `src/shape-ui.ts` owns the generated selector/icons, parameter fields, validation feedback and local/world pose conversion. Existing UI scaffolding only mounts its slot. No Apply/Stamp button or commit executor is registered.
- Preview input pauses sculpting and layer gizmos. Camera orbit/pan/zoom remain available. Hiding the ghost or Escape resumes existing tools. An explicit layer numeric transform still edits that layer through its existing command path.

```mermaid
flowchart LR
  UI[Existing UI] --> Commands[IndependentLayers]
  Commands --> Layers[SdfLayers / independent volumes]
  Layers --> Mesher[ChunkSurface / GLB]
  Layers --> Composite[BooleanComposite cache]
  Composite --> Bake[Explicit Bake / new volume]
  ShapeUI[Shape Library UI] --> State[Session preview model]
  State --> Ghost[Ghost scene sibling]
  State --> Definition[Validated ShapeDefinition]
  Definition --> Kernel[Prepared primitive / world sampler]
  Definition -. Phase 1.11 intent only .-> Commands
```

## Shape contracts and mathematics

Stable type IDs are `sphere`, `box`, `triangular-prism`, `pyramid`. ShapeDefinition.id identifies the current preview/intent; targetLayerId identifies its target. Dimension values are **full unscaled extents XYZ**, not half extents. Local origin is the bounding-box centre. The isosceles prism triangle lies in XY, bottom Y negative/apex Y positive, extruded along Z. Pyramid has a square XZ base at negative Y and centred apex at positive Y.

Sphere dimensions must be equal diameters. Box and prism dimensions are independent. Pyramid width/depth must match; the UI links those axes. Pose scaling is positive uniform only. Dimension and pose values use existing validation limits (dimensions/scales 0.001–1000; finite position/rotation components within ±1000, rotations internally radians). Sample queries reject nonfinite/unreasonably large coordinates (±1e12). The earlier placeholder allowance for anisotropic shape scale/rectangular pyramid was tightened to this phase's requirements; shape definitions were never stored in native projects, so existing sculpture files are unaffected.

Sphere and box use analytic Euclidean SDFs. Prism and pyramid use cached outward-oriented triangular faces, closest-point distance to the entire convex boundary, and half-space interior classification. These are genuine 3D signed distances, including Euclidean edge/corner distances, rather than a max-plane estimate or 2D silhouette. Negative means inside; positive outside. Local bounds are exact axis-aligned boxes; transformed bounds conservatively transform those boxes.

**ShapeDefinition.transform maps shape-local into target-layer-local space.** World matrix = layer matrix × shape pose matrix. `prepareShape(definition, layer)` validates/copies parameters, caches inverse matrices and kernel data, then multiplies local distance by combined uniform scale. Prepare once per batch, not once per voxel. World-space UI edits inverse-transform the requested pose back into the layer. Compound world positions/scales can exceed one local metadata range; validation applies to the converted local pose, with only out-of-bound floating-point endpoint noise snapped back to valid limits. The math helper can read any validated layer metadata; applying an edit must separately enforce active/visible/unlocked rules.

## Phase 1.10 implementation and changed files

| File | Change |
| --- | --- |
| `src/shapes.ts` | Stable metadata/catalog, dimension constraints and positive uniform shape-pose validation; existing intent/controller ports retained |
| `src/shape-library.ts` (new) | Primitive kernels, cached convex-boundary preparation, full 3D local/world sampling and bounds |
| `src/shape-preview.ts` (new) | Session preview state, active-target/edit guards, pose conversion, four-pair geometry cache and ghost renderer |
| `src/shape-ui.ts` (new) | Shape selector, SVG icons, Add/Subtract, dimensions, local/world position/rotation/scale, reset, error/target/performance feedback |
| `src/main.ts` | Ghost scene integration, busy/selection/load synchronization, sculpt/gizmo gating and Escape |
| `src/ui.ts` | Shape Library mount slot and Phase 1.10 header |
| `src/style.css` | Shape controls and scoped narrow-screen sticky viewport while library is open |
| `tests/shape-library.test.mjs` (new) | 20 primitive, transform, preview and regression tests |
| `scripts/compile-core.mjs` | Compile math/preview modules for tests and benchmarks |
| `scripts/benchmark-shapes.mjs` (new) | Cold/warm preview, geometry reuse, idle, prepared SDF and immutability measurements |
| `package.json` | `benchmark:shapes` command; no new dependencies |
| `README.md` | Current phase, controls, math, limits and validation |
| `docs/DEVELOPMENT_STATUS.md` (new) | This development handover |

No changes were needed to SDF brush storage/math, source meshing, IndependentLayers, Boolean composition, Bake, native codec or GLB export implementations.

## Implemented behavior

Open Shape Library and select a primitive. A translucent teal Add / rust Subtract ghost appears; outlines remain visible through the sculpture. Fields control full dimensions, Euler XYZ rotation in degrees, position and positive uniform scale. Pose space can be layer-local or world. Sphere diameter and pyramid square-base axes stay linked. No source volume, dirty chunks or history are changed by these controls.

The ghost follows active-layer selection and metadata transforms; hidden/locked/invalid nonuniform targets hide it and disable edits with a clear reason. Preview state is session-only, cleared on successful Open Project and never saved, composited, baked or exported. The renderer ignores ghost raycasts. Closing the panel, hiding the ghost or Escape restores sculpt/gizmo interaction. On narrow screens the viewport stays visible while the open panel scrolls. Existing camera controls remain available.

No shape stamping, continuous stamping, controller input, automatic layer merge or deformation Move tool is implemented. Future stamp/input types remain data-only interfaces.

## Validation and performance

`npm run build` passed strict TypeScript and Vite production build. `npm test` passed **141 tests, 0 failed**: all previous 121 plus 20 new tests. No old test was removed or relaxed. New coverage includes exact primitive distances/signs, 3D caps/edges/apex/corners, bounds and winding, extreme aspect ratios/Lipschitz stability, invalid parameters, parent/shape transforms, immutable prepared snapshots, preview voxel/history/buffer preservation, geometry reuse/idle skip, analytic/preview-surface agreement, active selection/flags/legacy nonuniform handling, world/local pose conversion, raycast/input exclusion and preview reset/future intent. Integrated regressions cover Boolean evaluation, Bake, native round trips and both binary GLB workflows without ghost data.

Browser checks exercised all four primitives, dimensions, rotation, world pose/scale, linked pyramid base axes, Add/Subtract colours, held viewport click/W shortcut exclusion, active hidden/locked target guards, Escape and native-import clearing. Native files before/after preview editing were byte-identical; all three saved Phase 1.9 layers retained their exact data/metadata. Both actual downloaded GLBs contained one sculpture node, 121,172 triangles and no ghost. Source history remained 0 undo / 0 redo and the browser reached four cached shape pairs. Detailed verification and screenshots are recorded in `outputs/phase-1-10-report.md` and `outputs/phase-1-10-file-verification.json`.

`npm run benchmark:shapes`, Node v26.8.1 on this machine. Active 128³ layer plus independent 64³ Base; 2,000 warm validated state updates per shape, 20,000 prepared world samples, 10,000 idle synchronizations. CPU only:

| Shape | Cold geometry + pose | Warm update mean | Prepared world query mean |
| --- | --- | --- | --- |
| sphere | 1.0676 ms | 0.0046 ms | 0.103 µs |
| box | 0.5043 ms | 0.0027 ms | 0.115 µs |
| triangular-prism | 0.1237 ms | 0.0024 ms | 0.340 µs |
| pyramid | 0.1356 ms | 0.0024 ms | 0.238 µs |

Idle sync averaged **0.0008 ms**. Exactly four geometry pairs were built; all dimensions/pose changes reused them. Source voxels, chunk geometry and project history stayed unchanged. These timings exclude DOM, rendering/GPU and picking; they are not end-to-end frame-rate guarantees.

The isolated source benchmark (`node scripts/benchmark.mjs outputs/phase-1-10-source-benchmarks.json`) measured local meshing medians **14.9 / 10.8 / 11.6 ms** at 64³/128³/192³. The latest comparable Phase 1.8 source run was 15.2 / 11.7 / 12.1 ms; differences −0.3 / −0.9 / −0.5 ms show no detected CPU source-meshing regression, within uncontrolled run variability. The source benchmark excludes the browser/ghost rendering loop. New preview overlays add two draw objects; GPU/frame regressions have not been profiled. Production bundle is approximately **678 kB minified / 178 kB gzip**, up from Phase 1.9's 659 / 172 kB; the existing Vite 500 kB advisory remains.

## Known issues, limitations and technical debt

- Numeric pose controls only for the ghost; no shape gizmo, click placement or stamp executor yet. W/E/R layer gizmos and brushing intentionally pause while a ghost is enabled.
- Sphere render preview is tessellated (32×20); its SDF is analytic. Polyhedron surfaces are exact low-poly boundaries. X-ray outlines and transparent surfaces can overlap visually; they do not affect sculpt geometry or picking.
- Only positive uniform parent/shape scale is supported for preview distance correctness. Hidden/locked/nonuniform targets are explicitly unavailable. Extreme scales/poses can exceed existing camera/navigation framing and rendering precision; there is no auto framing.
- Dimensions are shape-local even when pose fields use world coordinates. The ghost is free to extend outside a target volume; Phase 1.11 must choose explicit clipping/rejection rules before modifying voxels.
- Preview state and history are not native sculpture metadata; the subsequent colour-save follow-up persists display colours/mode. Successful import clears the preview. Shape-selection parameters are not independently undoable because they do not edit the sculpture.
- Dense grids remain 64³/128³/192³ with existing aggregate voxel, eight-layer and native triangle limits. CPU source/composite extraction and Bake remain cooperative/synchronous main-thread work. Initial full composition/resampling can pause; no sparse/GPU/worker backend was introduced.
- Prepared convex kernels reuse scratch vectors and are synchronous; prepare separate instances per independent job. Full-volume per-voxel preparation is prohibitively wasteful. The generic convex distance method only applies to convex solids; torus/etc. need their own kernels.
- Full native import still blocks while source meshes are prepared; one browser run showed roughly 0.93–0.95 seconds for the active 128³ source mesh. There is no controlled browser baseline for that sample; profile cold import separately from the unchanged isolated local-mesh benchmark. Preview parameter changes left that source-mesh timing unchanged.
- Existing main/UI files are still compact and monolithic around command orchestration. Shape UI was isolated; broader UI refactoring is deferred. UI/GPU performance and long-session memory pressure need profiling.
- Vite source/document reloads can reset unsaved in-memory sculptures during development. Save before source edits; generated work/tests/scripts/outputs are ignored. Git is unavailable here; verified source archives provide phase checkpoints.

## Recommended Phase 1.11 implementation

1. Add a deliberate **Apply shape once** command; keep continuous stamping and VR input deferred unless explicitly requested. The ghost remains separate until that action.
2. Freeze `futureStampIntent`/definition and target layer ID at command start; revalidate target existence, active/visible/unlocked state and positive uniform transforms before mutation. Do not let an asynchronous selection change redirect a stamp.
3. Use `prepareShape` or a prepared local kernel once per operation. Target voxels store **layer-local distance**: either inverse-transform layer-local points into shape-local space and multiply by shape scale, or evaluate world distance and divide by layer uniform scale. Do not multiply parent scale twice.
4. Apply Add as `min(old, shapeDistance)` and Subtract as `max(old, -shapeDistance)` to the target volume only. Do not use a triangle merge, Boolean compositor cache or source-layer merge as the stamping path.
5. Compute conservative target-local voxel bounds and gradient halo. Decide/document narrow-band versus full far-field distance updates: exact min/max can change values outside the shape's geometric AABB. Preserve the zero surface, positive outer boundary, finite/stability limits and Smooth behavior. Explicitly reject or explain shapes clipped by finite volume bounds.
6. Record one sparse `SculptHistory.begin('shape-stamp')` transaction with target ID; reuse first-write recording/commit and chunk/composite invalidation. Validate capacity/params before mutation and handle cancellation/error rollback atomically. Do not record one history action per voxel or snapshot every pointer move.
7. Keep preview and device state out of native v3; retain the subsequently added optional colour metadata. Ordinary stamped voxels can use the existing native format. Persisting procedural edit stacks would be a separate format/design decision.
8. If adding a ghost gizmo, use a preview proxy/model and exclusive input ownership. Do not reuse `LayerTransformTools` in a way that changes a SdfLayer or records layer-transform history. Keep world/local conversion and layer selection clear.
9. For future controller scaling, route analogue events into the same model validation. Uniform pose scale remains isotropic; axis-specific changes belong to permitted dimension rules (sphere all equal, pyramid width/depth linked).
10. Add tests for exact stamp locality/signs/transformed layers, source independence, flags/boundaries, one-action undo/redo, redo invalidation, interrupted operations, native/export regression and measured local rebuild cost. Extend primitives by registering stable metadata + kernel + canonical preview geometry/icon and focused tests; never silently fall back to another shape.

## Required completion report format for future phases

End each development phase with six concise items: **(1) What changed; (2) architectural decisions; (3) build/test results; (4) benchmarks/regressions; (5) known limitations; (6) next-phase considerations.** Update this handover with actual files, commands, pass/fail counts and measured results, and link detailed evidence.

## Protection and launch

No existing project files were removed. A verified Phase 1.9 source checkpoint is `outputs/phase-1-9-before-1-10.tar.gz` with SHA-256. Dependencies were already installed; no new packages were added. Start with `npm run dev` and open http://localhost:5173. Validate with `npm run build`, `npm test` and `npm run benchmark:shapes`.


## Phase 1.10 follow-up — save layer colours (2026-10-25)

The user changed the earlier session-only colour requirement: Save/Open Project now preserves per-layer viewport RGB colours and Clay/Layer Colours mode. Colours remain display data, separate from SDF voxel storage and neutral GLB materials. Shape ghosts remain session-only and excluded from saves/exports.

- Native v3 gains an optional `displayPreferences` object, validated before import. Stable layer IDs map to normalized `#rrggbb` strings. Unknown layer targets, invalid colours and invalid display modes are rejected. No format bump or voxel resampling is needed; old v1/v2/v3 files still load.
- `LayerDisplayPreferences.snapshot` explicitly captures current layers only (excluding stale/deleted IDs); `restore` applies stored preferences. The project codec preserves this optional metadata through further round trips. The application Save handler supplies the snapshot, and layer runtime creation restores saved preferences before presenting materials.
- Changed: `src/display-preferences.ts`, `src/layers.ts`, `src/project.ts`, `src/independent-layers.ts`, `src/main.ts`, `src/ui.ts`, `tests/project-colours.test.mjs`, README and this handover. Existing source files were checkpointed under `work/colour-save-checkpoint/` before editing; Git is unavailable in this workspace.
- Validation: `npm run build` passed; `npm test` passed **145/145**, including four new tests for fresh-session colour/mode restoration, Clay-mode colour retention, legacy compatibility and malformed metadata. Separate GLB remains neutral and respects hidden layers. No dependency changes. Existing Vite bundle-size advisory remains.
- Performance: no sculpting or meshing path changes; only a small JSON metadata object added at save/load. No new benchmark was warranted for this persistence update.
- Limitations: older files cannot recover colours they never stored. Colour edits are display preferences, not undoable voxel actions. Boolean Preview and both GLB exports remain neutral; Layer Colours applies to Separate Layers.
- Phase 1.11 must retain optional display metadata while keeping shape preview state excluded from native files.


## LAN access and brush shortcut follow-up (2026-10-25)

- `vite.config.ts` explicitly binds `0.0.0.0:5173` and allows `bretts-macbook-pro.local`; watcher exclusions remain intact. Confirmed this Mac's LocalHostName is `Bretts-MacBook-Pro`. Open `http://bretts-macbook-pro.local:5173/` from a phone on the same LAN, with Node incoming firewall access if prompted. IP fallback works when local mDNS resolution is unavailable. No router/public hosting changes were made.
- `src/main.ts` adds B to return to the selected Add/Subtract/Smooth brush, stopping existing gestures, hiding the ghost and exiting layer transform mode. Text/numeric editing, modifiers and busy/modal states are respected. Selecting Sculpt also hides the ghost. `src/ui.ts` exposes Sculpt (B) and shortcut help; README documents LAN launch/testing.
- LAN HTTP exposed a secure-context restriction: `crypto.randomUUID` was unavailable and prevented startup. `src/layers.ts` now falls back to RFC 4122 v4 IDs using `crypto.getRandomValues` on such origins, retaining secure random IDs and unchanged file compatibility.
- Validation: build passed; **168 tests passed, zero failures**, including `tests/lan-ids.test.mjs` with randomUUID disabled. Real browser checks verified complete startup and the B shortcut from transform and shape modes at the hostname URL. No physical phone was available for end-to-end device testing. No meshing/storage path changes or new benchmark needed. Existing bundle-size advisory remains.


## Centra Sculpt branding and circular viewport tools follow-up (2026-10-25)

The product is now **Centra Sculpt**. The browser title, header/mark, footer, invalid-file wording and GLB download names use the new name. Existing `.form` extensions and binary magic are intentionally retained so all native files remain compatible. The source workspace/folder is unchanged.

The viewport has two circular overlay controls. **Sculpt tools** opens Brush / Boolean; per user clarification, Boolean means the procedural Add/Subtract shape stamping library, not the separate layer Boolean Preview display. Selecting Boolean opens/enables the shape ghost; Brush/B hides it and returns to sculpt mode. **Layer transforms** opens Move / Rotate / Scale and uses existing layer command/gizmo routing, stopping gestures and hiding/collapsing shape tools first. Locked/hidden layers disable that wheel; modal/busy states disable both. W/E/R and sidebar controls remain supported and synchronize the wheel state. Opening a wheel does not edit any voxel, layer transform or history.

`src/viewport-tools.ts` is a scene-independent DOM overlay with inline SVG icons, explicit aria-expanded/pressed states, focus return, arrow/Home/End navigation, Enter/Space activation, Escape and outside-click dismissal. Only one menu opens at once. Pointer events stay off the WebGL canvas. Existing `shape-ui.ts` gains an explicit setOpen API; main command handlers retain ownership. Per-frame wheel synchronization skips unchanged state. No native schema, SDF, mesher or history model changed.

The shell now has a compact header, clearer studio panels and contrasting green/ink circular menus. Desktop sidebars scroll internally; the header/footer remain visible. Phone layouts reserve enough viewport height for a complete menu; shape-library mode retains the sticky viewport. Browser testing at 390×844 confirmed a 224px menu entirely within the viewport and no horizontal overflow (page width=390). Original viewport sizing was restored afterward.

Changed: `index.html`, `src/ui.ts`, `src/style.css`, `src/main.ts`, `src/shape-ui.ts`, `src/project.ts`, new `src/viewport-tools.ts`, README and this handover. `tests/history-project.test.mjs` updates the precise invalid-file error assertion for the renamed app; validation coverage is unchanged. A source archive checkpoint is `outputs/before-centra-ui.tar.gz`.

Validation: strict TypeScript/Vite build passed; **168/168 tests passed**. Browser checks exercised Boolean opening the stamping panel, layer Rotate/Scale/Move selection, Brush/B restoration, keyboard radial selection and locked-layer disabling. Repeated menu actions retained 0 undo/0 redo and 31,536 triangles on the unedited test sphere. No sculpting benchmark rerun was needed for DOM/style/name changes; production bundle is ~692 kB JS minified with the existing bundle-size advisory. No new dependencies.

Known limits: radial tools select modes; drag manipulation continues through the existing gizmos. No ghost gizmo or new touch-camera gesture system was added. Phone verification used a browser viewport override, not physical hardware. Native files still use `.form`. Next phase should reuse the command/preview ownership boundary for future tool wheels and controller UI rather than manipulating SDF data from controls.


## Sculpt wheel Smooth follow-up (2026-10-25)

Added Smooth as a third circular Sculpt tools option beside Brush and Boolean, with a wave icon and synchronized sidebar selection. Smooth activates the existing smoothing brush, hides shape ghosts and exits layer transforms. Brush/B restores the most recent Add/Subtract choice from this session. Sidebar Smooth selection and saved Smooth settings also update the wheel caption/icon. No SDF smoothing algorithm changed. Files: `src/viewport-tools.ts`, `src/ui.ts`, `src/main.ts`. Build passed; all **168 tests passed**. Browser checks verified Smooth activation, hidden ghost, zero history changes on selection, and B restoring Subtract.


## Stamp ghost rotation / T follow-up (2026-10-25)

Implemented a separate Three.js rotation gizmo for shape previews. **T** toggles it, with visible buttons in the Shape Library and a new viewport quick toolbar. Rotation enables only for an editable visible ghost target and freezes pointer following. Applying a stamp is disabled during rotation mode. T finishes, leaving the preview pose fixed; the user can explicitly apply once or re-enable Follow pointer. Numeric angles and local/world pose controls remain available; local rings align with the ghost orientation, while numeric local coordinates remain relative to the layer. B/tool changes hide the ghost and detach the gizmo. Text-entry/modifier/repeat/busy guards protect shortcuts.

New `src/shape-rotation.ts` owns a scene-sibling world-space Group proxy and rotation-only TransformControls. It never attaches to layer geometry. World proxy edits inverse-convert through `ShapePreviewModel.setWorldTransform`, preserving target-local position/scale and independent layer data. InputOwnership adds a preview owner to block camera/sculpt/layer drags while a ring drag runs. Selection/visibility/lock/busy changes or cancellation release ownership and finish/detach controls safely. Proxy/helpers remain outside project/export roots. Rotation is session state, not source history; explicit later stamps use existing one-action history.

Changed: new `src/shape-rotation.ts`, `src/interaction.ts`, `src/shape-preview.ts`, `src/shape-ui.ts`, `src/main.ts`, `src/ui.ts`, `src/style.css`, `scripts/compile-core.mjs`, new `tests/ghost-rotation.test.mjs`, README and this handover. A pre-change source checkpoint is `outputs/before-ghost-rotation.tar.gz`. No new dependencies or file-format changes.

Validation: build passed; **173 tests passed, 0 failed** (168 previous + 5 new). Tests cover transformed parent/world-local conversion, unchanged native bytes/metadata/voxel arrays/chunk geometry/history, preview ownership/camera exclusion, locked/hidden/busy targets, target switching, local/world axes, reset/hide and subsequent one-action stamping/undo. Browser checks: T toggled rings; a real ring drag changed X to 4.912241° while keeping 31,536 triangles and 0/0 history; finishing and applying the rotated cutter changed 6,908 voxels in one action, and Undo restored the sculpture. The viewport shows ROTATING / STAMPING PAUSED and disabled Apply during rotation.

Performance: no SDF/meshing path changes or rebuilds during preview rotation. Proxy and gizmo allocated once; orientation uses matrices/metadata. Source benchmark was not rerun for this UI interaction change. Bundle is ~698 kB JS minified; existing Vite size advisory remains. Known limits: no ghost move/scale gizmo, VR or snapping controls. Rotation is not itself undoable source history; dimensions and numeric pose fields remain the precise controls. Physical touch-device gesture testing remains deferred. Next phase can reuse this proxy/ownership boundary for preview translation/uniform scaling rather than attaching controls to layer meshes.


## Held-preview movement / G follow-up (2026-10-25)

Resolved the unintuitive numeric-only placement when surface following is off. Added **Move preview (G)** in the Shape Library and **Move G** in the viewport quick toolbar. Drag standard Three.js translation arrows/plane handles, then G to finish and enable Apply. T switches to ghost rotation; G switches back to movement. Surface following stays off so the held position does not jump. Numeric XYZ fields remain precise placement controls. Toolbar/status feedback explicitly says Preview held / G to move. The mobile toolbar wraps for the extra button.

The existing preview proxy now supports translation and rotation, mutually exclusively, while retaining the `ShapeRotationTool` name/file for compatibility. `ShapePreviewModel.moveMode` and `manipulating` keep canvas stamping, Apply buttons, camera ownership and pointer-follow guards consistent across both modes. Translation inverse-converts world proxy poses to target-local coordinates, preserving orientation/uniform scale and independent layer data. Hidden/locked/busy targets and hiding/import/reset clear/release movement safely. No source geometry, voxel data, layer transform or history changes until explicit Apply. Existing Add bounds constraints remain; no automatic resampling/clipping.

Files: `src/shape-preview.ts`, `src/shape-rotation.ts`, `src/main.ts`, `src/shape-ui.ts`, `src/ui.ts`, `src/style.css`, new `tests/ghost-move.test.mjs`, README and this handover. Build passed; **177/177 tests passed** (173 prior + 4 new). Tests cover mode switching/follow freeze, transformed layer world/local movement without changing rotation/scale/native bytes/history/chunk identities, locks/hiding/reset and a moved+rotated stamp remaining one undo action. Browser: with Follow Pointer off, an arrow drag moved X from 1.05 to 0.689773 with 31,536 triangles and 0/0 history unchanged; G finished and re-enabled Apply. No new dependencies or source meshing changes; no benchmark rerun needed. Preview translation is not a sculpting deformation tool or a layer transform.


## Default Move for manual stamp placement follow-up (2026-10-25)

Follow Pointer off now automatically activates preview Move handles; enabling a previously held ghost does the same. Finishing T rotation returns to Move. Numeric position edits also enter manual Move, while preserving an explicitly active rotation tool. G can still optionally hide/show handles; Apply no longer requires leaving idle Move mode. Camera/sculpt/stamp exclusion remains active during a drag, and canvas clicks with Move active never create stamps. Apply is an explicit UI action and is enabled for idle Move, disabled during actual dragging, rotation, busy operations or hidden/locked/invalid targets.

`ShapePreviewModel.setEnabled`, `setSurfaceFollow` and `canApply` centralize this policy. Preview drag state updates Apply buttons immediately. Re-enabling Follow clears gizmo modes. `ShapeRotationTool` still edits only its preview proxy; no source layer transform, voxel/resampling or history behavior changed. Files: `src/shape-preview.ts`, `src/shape-rotation.ts`, `src/shape-ui.ts`, `src/main.ts`, two preview test files, README and this handover. Existing tests were updated to assert the intentionally changed return-to-Move behavior; no coverage was removed. Build passed and **178/178 tests passed**, including a new manual-placement/Apply gating test. No meshing benchmark was needed for this interaction policy change.


## Rendering styles follow-up (2026-10-25)

Added Normal, Glossy and Wireframe rendering styles, independent of Clay/Layer Colours. A lower-right viewport button cycles them; the Layers panel also offers a named selector. Normal preserves the previous clay material/light setup. Glossy uses low roughness (.14), slight metalness (.12), a lazily generated/cached RoomEnvironment PMREM studio reflection texture and ACES tone mapping/exposure .9 to avoid blown highlights. Normal/Wireframe restore the original tone mapping and clear the scene environment. Wireframe darkens display colours for contrast without modifying stored layer colours.

New `src/render-style.ts` defines validated styles and applies material properties. `IndependentLayers` retains its neutral export material and now owns a separate composite display material. `BooleanComposite` accepts an optional export material so Boolean rendering can be glossy/wireframe while GLB remains neutral and solid. Existing separate-layer exports already use the unchanged neutral material. Source voxel buffers, mesh geometries/normals, chunk rebuild state and undo are untouched by style changes. The ghost/helper objects remain separate from exports.

Optional `displayPreferences.renderStyle` persists non-default styles in native v3. Absent values restore Normal; invalid enums reject import/save. Normal snapshots omit the field, preserving prior normal project metadata. Colour and style preferences remain display data, not SDF content.

Changed: new `src/render-style.ts`, `src/display-preferences.ts`, `src/independent-layers.ts`, `src/compositor.ts`, `src/main.ts`, `src/ui.ts`, `src/style.css`, `scripts/compile-core.mjs`, new `tests/render-style.test.mjs`, README and this handover. No dependency changes.

Validation: TypeScript/Vite build passed; **181/181 tests passed**, including 3 new tests for no voxel/geometry/history/remesh changes, preservation of display colours, styled Boolean cache reuse without recomposition, neutral solid separate/Boolean export materials, optional style save/load/defaults and invalid values. Browser cycling verified all three styles on the LAN hostname; source triangles and history remained unchanged. Screenshots are under `outputs/centra-normal.png`, `centra-glossy.png`, `centra-wireframe.png`.

Performance/limits: style changes update existing materials; no source-meshing benchmark was warranted. First Glossy use can briefly pause for PMREM generation/shader compilation; its environment is reused thereafter. GPU FPS/thermal behavior and physical-phone performance were not measured. Wireframe can be visually dense at high resolutions. Production JS is approximately 711 kB; existing Vite bundle advisory remains. Future useful inspection modes could include matcap or curvature/cavity shading; these were not implemented in this update.
