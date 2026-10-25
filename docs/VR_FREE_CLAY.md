# Phase 1.13f.1 — Free-space Clay sculpting

Implemented 2026-10-25. Build and **340 tests pass**. Quest 3 physical acceptance is pending.

## Cause and changes

The previous follow-up removed Clay's mesh-hit requirement, but kept the displacement kernel: Add subtracted a tiny time-scaled amount from the existing positive field. A distant or empty field could take seconds to cross zero. Its tests held the brush for seconds, so they did not prove usable moving free-space drawing. Fixed bounds and aim-relative placement were additional constraints. Empty positive fields and disconnected chunk meshing were already supported.

Default **Free space** now uses the tracked Tool Hand **grip pose**, with a 12 cm applicator offset along its local forward axis. The actual visible sphere is the application position; it does not depend on pointing at geometry. This is a fixed virtual applicator offset, not a measured Touch Plus housing calibration. Target-ray pose remains for optional Surface follow. Full inverse surface world transform converts the physical tip into layer coordinates, including tracking/workspace/sculpture/layer parents. Workspace movement remains navigation only.

Free-space Add constructs the union of the existing field and radius-sized applicator spheres along the existing distance-interpolated trajectory. Material appears on the first valid trigger sample, independent of the previous positive field distance. Subtract uses the complementary constructive difference. Repeated stationary constructive dabs are idempotent; holding does not inflate a blob indefinitely. Strength/hardness control interior field depth, while the zero contour and preview retain the selected radius; they no longer control how many seconds empty space needs to become solid. Smooth retains the original gentle diffusion kernel. A bounded material-presence check skips empty Subtract/Smooth regions before voxel writes, history and chunk invalidation.

Clay and Smooth share Free space / Surface follow placement in Options. Optional Surface follow and desktop mouse strokes retain the earlier displacement behavior. Native brush settings and file format are unchanged. No geometry or SDF resampling is used.

Steady 0 remains live. Steady >0 and Straight Line retain the existing filtered trajectory preview and deliberate release-to-apply transaction; Straight Line takes precedence. The final brush uses that same filtered path. Each completed stroke is one undo action, with exact sparse cancellation and redo retention. Tracking/ownership/workspace interruption cancels unfinished strokes as before.

## Empty-layer and bounds workflow

1. Before entering VR, choose **Empty clay volume** in the New Layer controls, select 64³ or 128³ and click New layer. Starter sphere is still available. Hide any other visible layers if you want a fully empty scene. The new layer is independent and selected; existing volumes are untouched. Layer creation retains the existing non-undoable creation behavior; subsequent strokes are undoable.
2. The default layer occupies **[-1.6, +1.6] on each local axis**, a 3.2-unit cube. At identity layer scale, voxel spacing is 0.05079 for 64³, 0.02520 for 128³, or 0.01675 for 192³. Workspace zoom scales the displayed cube and brush together. Move/zoom the workspace so that this region surrounds the intended drawing area; Reset Workspace View restores the initial navigation placement.
3. For a larger initial drawing area, uniformly scale/position the **empty** layer using desktop layer transforms before drawing. A scale of 2 doubles its project-space extent and voxel spacing. Choose 128³ with scale 2 for approximately the same project-space spacing as identity 64³. This is an explicit setup tradeoff before material exists, not silent detail loss or expansion of populated data. Layer scale changes are undoable metadata edits; save preserves them.
4. Keep the entire brush sphere inside the bounds with one voxel of clearance. It becomes **amber** and shows “Near layer bounds · brush will be clipped” when this margin is crossed. Boundary samples stay positive, so geometry clips/caps inward safely. If the brush center leaves the volume, an unfinished stroke rolls back and requires release/repress after returning inside. Split long boundary-adjacent work into separate completed strokes.

Volume expansion is deferred. Dense cubic storage, 192³ resolution limits, 10-unit native extent limit, project voxel/triangle budgets, and runtime/history ownership make safe expansion a separate command/format-validation task. Preserving spacing would require a larger grid with exact index-offset copying, new empty padding, budget checks including retained undo storage, and a volume-replacement undo entry. Existing resampling changes detail and clears history; it is not an expansion substitute. There is no automatic growth, silent resampling or detail reduction in this phase.

## Validation and performance

TypeScript/Vite build passes; **340 tests, 0 failed/skipped**, including an initially maximally positive empty field, immediate three-component floating smiley, 30/72/120 Hz fast gap-free strokes, Steady and Straight Line, free Add/Subtract/Smooth, transformed tip coordinates, separate grip/aim poses, near/outside bounds, positive boundary clipping, affected chunks only, exact undo/redo/cancel, native round trip, Boolean preview and both binary GLB paths. Existing layer, controller, surface, export and project regressions pass. Logs: `outputs/phase-1-13f-1-{build,tests}.log`. Existing-server browser smoke also confirmed empty-layer creation, 0 triangles after hiding Base, and no application console errors; screenshot `outputs/phase-1-13f-1-empty-layer.png`.

Reproducible Node CPU benchmark: `node scripts/benchmark-free-clay.mjs` after `npm test`; result `outputs/phase-1-13f-1-benchmark.json`. Ninety moving samples with affected-chunk remeshing every third sample:

| Grid | Brush median / p95 | Mesh median / p95 / max | Release finish | Grid + scratch |
| --- | --- | --- | --- | --- |
| 64³ | 0.025 / 0.135 ms | 4.18 / 6.93 / 8.07 ms | 5.25 ms | 2 MiB |
| 128³ | 0.118 / 0.200 ms | 8.21 / 10.46 / 13.56 ms | 12.89 ms | 16 MiB |

Only dirty chunks are invalidated/rebuilt; empty operations create no source history/remesh work. The runtime still remeshes synchronously at up to 30 Hz and drains pending chunks on release. Buffered replay retains its 4 ms/64-sample pump budget, which cannot preempt one expensive sample or the final mesh drain. Mesh work may exceed a headset frame budget, particularly at higher resolution. These are desktop Node timings excluding rendering, GPU, browser and XR; no Quest frame-rate guarantee is claimed. Prefer 64³ for the first headset check. Existing Vite bundle-size advisory remains.

## Quest 3 acceptance checklist

- Create/select an Empty clay volume, hide all other layers, enter VR, select Clay Add and Free space, Steady 0. Confirm the sphere follows the controller applicator rather than the aim-ray intersection.
- Draw left eye, right eye and a curved smile as three trigger strokes in completely empty space. Material must appear while moving, without dwelling or touching existing geometry. Undo/Redo each piece separately.
- Draw quickly at several speeds and workspace zooms; inspect for gaps. Repeat with Steady 75–100 and Straight Line, checking filtered preview versus final stroke and the documented release delay.
- Use Subtract to erase a portion and Smooth to soften it. Trigger in empty space: no material appears or empty undo steps are added.
- Transform the layer and workspace; repeat with either dominant hand. Recheck grips, menus, radius, tracking interruption, cancellation and XR exit/re-entry.
- Approach each face of the layer bounds: amber warning before clipping, no outside edits, exact unfinished-stroke rollback if the center exits. Complete separate strokes before testing this rollback.
- Save/reload; inspect Separate Layers and Boolean Preview, then both GLB exports for all three disconnected pieces. Record headset performance with diagnostics at 64³ before considering 128³.

Git: incoming dirty `main` preserved; checkpoint `work/checkpoints/before-1-13f-1.tar.gz`, SHA-256 `2b7fae62f171d1e5f5dd718e195959a2413800b622088659e485a1a6692fd8a6`. No commit or push.
