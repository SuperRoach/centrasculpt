# Phase 1.13h — VR Layer Selection and Transform UX

Implemented 2026-10-26. Build and **404 tests pass**. Browser smoke complete; physical Quest 3 acceptance is pending.

## Using layers in VR

Select **Transform Layer** from Support stick Up → Tool Wheel. Point the Tool Hand ray at a visible layer and tap its trigger. The nearest intersected layer becomes selected, including locked layers for inspection. A mint box outlines the selected layer; a subtler blue box marks a different hovered layer. A status card names the selected/hovered layers and marks Hidden or Locked. During manipulation it identifies moving/rotating and release-to-commit. The selected outline also remains available in other tools in Separate Layers; hover selection is restricted to Transform Layer.

Hold **Tool grip** to move and rotate the selected visible unlocked layer. Release commits one transform action. Support Left/Right Undo/Redo restores that layer's exact transform. Only metadata changes; voxels, resolution and other layers are untouched. Tool grip alone cannot move a layer in Clay, Smooth or Stamp.

**Support grip** still moves/rotates the workspace; **both grips** still rotate/scale the workspace with the existing anchors and rebasing. Navigation never enters native project transforms or history. These ordinary transitions retain the existing manipulation code.

Support stick Down opens **Layers**. Each row shows name, selected/active indicator, resolution, saved viewport colour swatch, Boolean operation, visibility and lock state. Trigger selects a row or toggles visibility/locking. Swatches identify the saved per-layer colour even when the viewport uses neutral Clay display. Boolean operation is informational here; no Merge/Bake/delete control was added. The palette can select hidden, fully occluded or empty layers, which have no pointable surface.

Transform Options retains Move/Rotate numeric values, Surface View, and the existing explicit **uniform numeric Scale** mode. New rows identify the selected layer, explain Support/both = view versus Tool = saved layer, report grip status and offer **Reset Layer Transform…**. Reset opens a confirmation naming the layer. Release the trigger and separately tap Reset layer or Cancel. It sets position/rotation to zero and uniform scale to one as a single undoable metadata edit when something changed. Selection/project/tool changes, menu closure or busy interactions invalidate the confirmation; hidden/locked layers cannot confirm. No new analogue layer scaling gesture competes with workspace two-hand scaling.

## Pointing, highlighting and priorities

`XRLayerSelection` raycasts the existing source chunk meshes, never SDF samples or a reconstructed mesh. It uses their actual world matrices, including XR tracking, workspace, sculpture root and layer transforms. Range is five physical world metres. Hidden layers are skipped. The nearest hit wins; hits within 0.000001 world metre use stable layer stack order as the tie-break. Fully coincident/occluded layers remain available through the palette.

Direct pointing and outlines use **Separate Layers**. Boolean Preview is an evaluated surface without an unambiguous source identity; select a source through Layers, then choose Separate Layers in Transform Options to point/grab. Nonuniform layer scale remains inspectable but the existing grip command requires positive uniform scale.

Highlights are **bounding boxes, not surface silhouettes**. Two LineSegments share one 24-vertex geometry (12 edges each), with separate mint/blue materials, at most two extra draw calls. They reuse actual local mesh bounds cached by `ChunkSurface.revision`; remeshing invalidates this derived cache, while moving/rotating/scaling updates only matrices. No source material tint/emissive mutation, mesh duplication or geometry rebuilding is needed for navigation. Their presentation group lives under controller tracking, outside source/composite/export roots. Empty layers have no outline; the status card and palette still identify selection. Hidden layers have no outline.

Menus and diagnostics reserve trigger input before direct selection. Menus also reserve grip input: pressing a grip while a menu is open dismisses the menu but **consumes that held grip**; release and press again to grab. This deliberately replaces the old “dismiss menu and immediately grab” behavior. All normal grip transitions outside menus remain on the existing path. Raw grip intent prevents selection while a grab is rejected or still arming. A trigger held through menus, tracking/role loss, busy work, tool changes or session interruption cannot select on recovery without release/repress.

Selection itself changes the existing active layer ID (which native saves already preserve) and refreshes the existing UI; it creates no undo action or voxel/transform edit. Layer grabs continue through `XRLayerGrab` → `IndependentLayers` metadata transactions. Existing loss-of-grip-tracking/tool-switch cancellation rolls back unfinished movement. Workspace takeover of a layer grab retains the existing finish/rebase policy. Completed edits survive session exit and remain undoable.

`XRMenuModel` holds only a temporary reset confirmation target, scoped to the actual project and active layer; it does not duplicate layer properties. The existing pointer menu release latch requires a second trigger press to confirm. Reset uses `setActiveTransform(identityTransform())`, including existing history, composite invalidation and save/export behavior.

## Validation and performance

TypeScript/Vite build PASS, full suite **404 passed, 0 failed/skipped** (374 previous + 30 new), `git diff --check` PASS. Logs: `outputs/phase-1-13h-{build,tests}.log`. Existing Vite bundle-size advisory remains (~907 kB / 245 kB gzip).

New coverage includes nearest/coincident hits, hidden/locked/empty layers, nondestructive selection, cached highlights in both viewport colour modes, full transformed parent chains and workspace zoom, input rejection and release/rearm, palette metadata/toggles, reset confirmation/held trigger and invalidation, exact reset/transform undo/redo/native save, GLB helper exclusion, both handedness/reversed-slot controller bridge paths, metadata-only translation/rotation, navigation isolation, ordinary two-grip transitions, menu priority, tracking rollback, session end, and Clay/Smooth/Stamp protection. Existing sculpting, Steady, Straight Line, stamp, Boolean, Bake, transform and export regression suites pass. Prior menu tests were updated only for the intentional consumed-grip behavior.

`node scripts/benchmark-layer-selection.mjs` uses 33³ overlapping spheres, 40 warmup + 200 measured updates, plus 200 outlines-only updates. Results: `outputs/phase-1-13h-selection-benchmark.json`.

| Layers / triangles | Raycast median / p95 | Highlight p95 | Total selection p95 |
| --- | --- | --- | --- |
| 1 / 8,088 | 0.101 / 0.120 ms | 0.0021 ms | 0.123 ms |
| 4 / 32,352 | 0.436 / 0.851 ms | 0.0100 ms | 0.865 ms |
| 8 / 64,704 | 0.797 / 1.359 ms | 0.0015 ms | 1.360 ms |

The warm cache required only 1–2 local bounds builds per scene and zero undo actions. These are desktop Node CPU timings, excluding browser, controller polling, GPU/draw calls and headset work. Initial bounding-volume creation/cache misses and later remesh updates are not represented by warm p95. Triangle intersections scale with source detail/overlap; no BVH or raycast throttling was added. Real Quest 3 timing is unverified. Existing synchronous Clay/stamp/remesh pauses from earlier phases remain separate limitations, not resolved by this UX phase.

Browser smoke used the user's existing server: selected desktop Move mode, entered the Quest emulator, inspected selected bounds/status and realistic controllers on neutral gray, then exited with desktop controls restored and zero undo actions. No application console errors. Screenshot: `outputs/phase-1-13h-browser-stereo.jpg`. This smoke did not exercise controller-driven selection/grabbing; automated bridge tests cover those semantics. No physical Quest verification is claimed.

## Files and protection

Added `src/xr-layer-selection.ts`, `tests/xr-layer-selection.test.mjs`, `scripts/benchmark-layer-selection.mjs`, this guide and benchmark/browser evidence. Updated `src/surface.ts` (derived revision), `xr-controllers.ts`, `xr-experience.ts`, `xr-shortcut-view.ts`, `xr-actions.ts`, `editor-tool-state.ts`, `xr-menu-model.ts`, `xr-menu-view.ts`, compile script, prior menu/shortcut regression expectations and development status. No SDF engine, shape kernel, project format, storage bounds, workspace navigation math or layer-grab math changes.

Incoming dirty `main` preserved in `work/checkpoints/before-1-13h.tar.gz`, SHA-256 `6756fc34ece0ca3d735c57ac257211bfc9703c3b74288bbc09f418f8bf390fa9`. No commit, merge or push.

## Quest 3 checklist — pending

1. Enter VR with at least two visible layers. Open Tool Wheel and choose Transform Layer.
2. Point at one layer: blue hover box appears, mint selected box remains, and names are clear. Tap trigger to select; verify no sculpt/stamp/history action occurs.
3. Hold Tool grip. Check no initial jump, then translate and rotate independently. Release; Support Left/Right should undo/redo exactly one transform.
4. Point at and select another layer without opening Layers. Try overlapping/coincident layers; nearest wins, and Layers can select the obscured source.
5. Open Layers. Verify name, Active marker, resolution, saved colour, operation, Visible/Hidden and Locked/Unlocked. Toggle visibility/lock and select rows.
6. Confirm hidden layers cannot be pointed at. Confirm locked visible layers can be selected but cannot move. Empty layers remain selectable through Layers.
7. Use both grips to scale/rotate the workspace. Release either grip and confirm smooth rebasing, then continue layer manipulation. Support-only navigation must leave project/history unchanged.
8. Repeat after moving/rotating/scaling both workspace and layer. Check pointer hits and oriented boxes track the rendered source.
9. Inspect Move/Rotate/Scale numeric options. Try uniform numeric layer scale and undo it; verify both grips still scale the workspace only.
10. Try Reset Layer Transform… then Cancel. Try again and confirm with a released/separate trigger press. Verify one-action Undo/Redo; workspace view and voxels stay unchanged.
11. While confirmation is open, close the menu/change selection; verify a stale confirmation cannot reset another layer. Locked/hidden targets must not reset.
12. Open a menu and press/hold a grip. It may dismiss the menu, but cannot start a grab until release/repress. Menu trigger clicks must not select scene layers, sculpt or stamp.
13. Swap dominant hands. Repeat pointing and grabbing. Interrupt tracking during movement, then end/re-enter XR with held input; unfinished movement cancels safely and held input does not leak.
14. Return to Clay, Smooth and Stamp; verify normal tool triggers, continuous strokes, Steady/Straight Line and sizing. Tool grip alone cannot transform layers there.
15. Check active outline in Clay and Layer Colours, and absence of hidden/empty outlines. Switch Boolean Preview ↔ Separate Layers; use source selection in Separate Layers.
16. Save/reload and inspect both GLBs for correct source transforms and absence of selection boxes/cards. Recheck Boolean Preview/Bake using their existing explicit workflows.
17. Record Quest frame/raycast feel with high-detail and overlapping layers. Desktop benchmark numbers do not establish headset frame rate.

Recommended Phase 1.13i: physical Quest validation first; profile high-detail raycasting/cache updates, consider measured BVH or bounded hit-test cadence, and address the shared synchronous stamp/remesh pipeline with cooperative work/progress/atomic cancellation. Do not expand storage as part of selection UX.

**Future Phase 3.1 — Expandable SDF bounds and/or sparse voxel storage** remains deferred: creation must eventually extend beyond original layer bounds without losing detail or requiring manual resampling.
