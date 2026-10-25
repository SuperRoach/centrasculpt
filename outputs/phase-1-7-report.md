# Phase 1.7 — Independent Layer Transforms

Implemented in the existing workspace, preserving independent dense SDF volumes, local chunk rebuilding, brushes, layer management, native projects and GLB export.

## Project protection

Git was unavailable: this workspace has no repository and Git initialization is blocked by the environment. A complete pre-edit source archive was created instead: `phase-1-6-before-1-7.tar.gz`. Its SHA-256 verification passed against `phase-1-6-before-1-7.sha256`. Existing source files were extended, not replaced wholesale; previous phase reports and benchmarks remain.

## Behavior and architecture

- Move / Rotate / uniform Scale gizmos use Three.js TransformControls. W/E/R activate them outside editable fields; Sculpt returns to brushing. World/Local sets gizmo axes. Every scale handle uses uniform XYZ scaling.
- Numeric position, XYZ rotation in degrees, uniform scale and Reset Transform edit the active visible, unlocked layer. Internal rotation remains Euler XYZ radians.
- Transform transactions store only before/after metadata and target layer ID. A full drag is one action; each committed numeric edit and Reset is one action. Mixed voxel/transform undo/redo remains chronological. Empty/cancelled/invalid edits preserve redo. New committed edits invalidate redo across action types.
- Scene groups receive transform metadata directly. Pure transforms preserve volume/runtime/geometry identity and bytes, never dirty chunks or resample. Deletion removes only the deleted layer's history. Resolution changes invalidate only that layer's voxel actions and retain valid transform actions.
- Active-layer raycasts use transformed groups; hits convert back into layer-local coordinates. Local radius equals world radius divided by uniform scale, while preview radius stays in world units. Other layers remain untouched, even when overlapping.
- Exclusive gesture ownership prevents sculpting or camera orbit during a gizmo drag. OrbitControls damping updates also pause until ownership ends. Hidden/locked layers reject edits and history replay until shown/unlocked.
- Native format remains v3 because it already supports per-layer TRS. Legacy v1/v2 migration remains. GLB preserves separate nodes, local geometry and transform matrices, with the existing neutral clay material. Viewport colours remain session-only.

## Changed files

| File | Change |
| --- | --- |
| `src/transform-tools.ts` (new) | Uniform TransformControls, event lifecycle, attachment and camera ownership |
| `src/interaction.ts` (new) | Testable exclusive sculpt/transform/camera gesture state |
| `src/transform.ts` | Transform copying, comparison, uniform-scale and edit validation |
| `src/independent-layers.ts` | Metadata transactions, mixed layer-aware history, matrix-only updates, world brush radius conversion |
| `src/main.ts` | Gizmos, W/E/R, numeric actions, camera gating, world preview, lifecycle integration |
| `src/ui.ts` | Tool modes, World/Local, numeric fields, Reset Transform, state/lock feedback |
| `src/style.css` | Transform controls and numeric field layout |
| `scripts/compile-core.mjs` | Compile new core modules for tests |
| `scripts/benchmark.mjs` | Measure metadata updates and assert no voxel/geometry/remesh changes |
| `tests/layer-transforms.test.mjs` (new) | 16 transform regression tests |
| `README.md` | Launch instructions, controls, architecture, validation and limits |

No changes to SDF brush mathematics, meshing algorithms, native codec or VolumeStore were needed.

## Validation

- `npm run build`: passed strict TypeScript and production Vite build. Existing bundle-size advisory remains; the Three.js bundle exceeds Vite's 500 kB warning threshold.
- `npm test`: **78 passed, 0 failed**. Existing 62 tests retained, plus 16 covering coordinate round trips; unchanged voxel/geometry storage; single-drag history; numeric/reset actions; invalid/no-op/cancel behavior; mixed layer history; redo invalidation; transformed sculpting; visibility/locks; resampling/deletion; legacy nonuniform metadata; native round trips; actual binary GLB node matrices; input ownership; uniform scale handles; gizmo event/camera wiring.
- Browser: real Move, Rotate and Scale handle drags each produced one action without changing mesh timings. Cmd+Z restored poses. Tested W/E/R, field-focus guard, numeric pose changes, Reset/undo, locks, world/local selector, transformed Add sculpting, mixed stroke/transform undo/redo, camera zoom recovery, actual native Save/Open and GLB export.
- Actual downloaded native project: Base 64³ at X −0.85 / Z rotation −30° / scale 0.8; Layer 2 128³ at X 0.75 / Y rotation 35° / scale 0.8. Base's voxel array exactly matched its initial sphere after transforms. Layer 2 had 6,041 locally changed voxels from its Add stroke. Both poses/resolutions restored on Open; history intentionally started fresh.
- Actual downloaded GLB contained two separate named mesh nodes; matrices matched native metadata. Native metadata had no viewport colour preferences. Details: `phase-1-7-file-verification.json`.

## Performance

`npm run benchmark`, Node v26.8.1 on this machine, 16³-cell chunks, active tested grid plus untouched 64³ layer, radius .22, strength .35, hardness .5, dt 1/60:

| Resolution | Initial mesh | Local mesh median | Add median | Smooth median | Dirty/total | Transform update mean |
| --- | --- | --- | --- | --- | --- | --- |
| 64³ | 71.6 ms | 14.1 ms | 0.12 ms | 0.12 ms | 8/64 | 0.0022 ms |
| 128³ | 231.9 ms | 13.5 ms | 0.47 ms | 0.44 ms | 8/512 | 0.0026 ms |
| 192³ | 674.9 ms | 11.1 ms | 1.23 ms | 1.18 ms | 12/1728 | 0.0045 ms |

The transform mean covers 1,000 metadata/scene updates per resolution. All resolutions verified unchanged voxels, unchanged geometry identity and zero remeshing. Inactive-layer SDF bytes and geometry remained unchanged during active-layer brush benchmarks.

Phase 1.6 local mesh medians were 16.6 / 10.8 / 11.0 ms: this run improved 64³ by 2.5 ms, increased 128³ by 2.7 ms and increased 192³ by 0.1 ms. The new results remain near the earlier 12–15 ms range; timing variability prevents claiming a controlled regression or frame-rate guarantee. Timings exclude rendering/GPU, picking and DOM work. Full data: `phase-1-7-benchmarks.json`.

## Manual acceptance sequence

1. Run `npm run dev`, open http://localhost:5173. Create a 128³ layer beside the 64³ Base.
2. Select Base; choose Move/W and drag a handle. Try Rotate/E and Scale/R, switch World/Local. Confirm one Undo per completed drag. Numeric edits and Reset should undo separately.
3. Give the second layer a different position, rotation and scale. Select Sculpt and brush it; choose Subtract/Smooth too. Verify the other layer stays unchanged. Test overlapping surfaces by selecting each layer explicitly.
4. Lock or hide the selected layer: gizmo detaches, numeric edits disable, sculpting cannot change it. Show/unlock to resume. Right drag/orbit, middle pan and zoom remain available outside edit gestures.
5. Save Project, alter the scene, then Open it. Verify both independent resolutions, poses and sculpted surfaces return. Export GLB and inspect two separate transformed nodes.
6. Run `npm test`, `npm run build` and optionally `npm run benchmark`.

## Known limitations

- Positive uniform scale only (0.001–1000); no nonuniform deformation, negative scale, snapping, pivot editing or interactive hierarchy.
- Legacy nonuniform metadata remains readable and can Move/Rotate, but sculpting and Scale require an explicit uniform numeric scale or Reset. No implicit normalization/resampling occurs; undo can restore legacy metadata.
- Extreme scale can put world brush radius below voxel spacing; extreme position/scale can exceed existing camera bounds. No automatic reframing or resolution changes.
- Structural layer management and display preferences are not undoable; history is session-only. Transform history retains 100 actions per layer separately from sparse voxel history's existing limits.
- CPU meshing/resampling/import/export remain synchronous, with existing memory/triangle limits. More layers increase draw calls/overdraw. Overlaps stay independent and may occlude each other.
- No Boolean compositing, Merge/Bake, shape stamping, VR controllers or Medium-style Move deformation was added.
