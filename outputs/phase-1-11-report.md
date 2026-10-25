# Phase 1.11 completion report

## 1. What changed

The existing Shape Library now applies individual Sphere, Box, Triangular Prism and Square Pyramid stamps. Select Add/Subtract, adjust dimensions/rotation/uniform scale, hover a visible surface and left-click once. Dragging never repeats stamps. Numeric position edits disable pointer following; **Stamp once at preview** explicitly applies that pose. Shape parameters remain between stamps. Escape/hiding the ghost restores brushes and layer gizmos. Preview geometry stays separate and temporary.

Layers remain independent. Hidden/locked targets are protected. Existing brushes, transforms, layer Booleans, explicit Bake, project persistence (including layer colours), history shortcuts and separate/Boolean GLB exports remain operational. No dependency changes or old project-file removals.

## 2. Technical decisions

A validated stamp definition freezes its target-layer ID. Read-only preparation evaluates a cached procedural kernel in target-local distance units. Add=min(old,shape), Subtract=max(old,-shape), rounded to Float32. All parameters and staged values validate before writes. Changed samples use one sparse `shape-stamp` history transaction and one global layer-bound action; no-op commands retain redo. Stamps do not change layer transforms, dimensions, Boolean operation or order.

Exact CSG changes distance values beyond geometric shape bounds. The conservative candidate AABB expands by the maximum supported stored distance; this can encompass the entire dense volume. Per-voxel AABB lower bounds prune expensive primitive evaluations, and only genuinely changed samples are written/stored. This preserves exact far-field semantics rather than silently truncating the SDF. Add shapes must fit inside fixed volume bounds with a one-voxel margin; clipping/growth/resampling is never automatic. Subtract may extend outside within distance/stability limits.

Per-sample chunk invalidation includes the existing gradient halo. Surface-bearing chunks update when their samples change; sign changes also schedule affected empty chunks that may gain geometry. Undo/redo uses the same exact replay notification. Full-reference tests compare every chunk's positions and normals. CSG cache invalidation remains separate and non-destructive.

Pointer placement converts world hits into the active layer's local coordinates. Shape centres sit on the hit, without changing rotation. A five-pixel completed primary click applies once. Camera-button combinations, secondary touches, drags, cancellation, focus loss, changing commands/targets and releases outside the canvas cannot commit a pending stamp. UI buttons cannot trigger viewport stamping.

Changed existing files: `src/history.ts`, `src/main.ts`, `src/shape-ui.ts`, `src/mesh.ts`, `src/ui.ts`, `src/independent-layers.ts`, `src/shape-preview.ts`, `src/shapes.ts`, `scripts/compile-core.mjs`, `package.json`, README and `docs/DEVELOPMENT_STATUS.md`.

New files: `src/shape-stamp.ts`, `src/shape-placement.ts`, `tests/shape-stamp.test.mjs`, `scripts/benchmark-stamps.mjs`.

There is no Git repository; the pre-change source archive `phase-1-10-before-1-11.tar.gz` and SHA-256 provide the checkpoint.

## 3. Build and tests

- `npm run build`: passed strict TypeScript and Vite production build. JS 686.69 kB / 181.12 kB gzip. Existing >500 kB bundle advisory remains.
- `npm test`: **167 passed, zero failures**. All 145 previous tests retained; 22 new tests cover exact Add/Subtract for every primitive, transformed targets, independent grids/resolutions, local/empty chunk updates, full-reference normals, boundaries/validation, sparse single-action history, redo, placement/gesture guards, native colour/data round trips, CSG refresh, binary GLBs and subsequent brush edits.
- Browser: rotated box click at 64³ applied once; Cmd+Z/Shift restored geometry; dragging produced no extra history. At 128³, one click changed 41,569 voxels, rebuilt 27/512 chunks and produced 131,596 triangles. Saved native files verified **zero changes** in the unrelated hidden 64³ Base and unchanged metadata for both layers.
- Actual separate/Boolean GLBs each contained one visible opaque neutral sculpture node, 131,596 triangles and no ghost. Reopen→Save of the stamped project was byte-identical. Numeric-pose Apply changed 18,234 voxels in one action; Undo restored the prior mesh. Locking disabled Apply.

## 4. Performance

Single-sample CPU benchmark per primitive/operation/resolution; no UI/GPU or CSG refresh included. Timings vary by machine/load and are not frame guarantees.

| Resolution | Evaluation | Mesh | Total stamp | Rebuilt chunks |
| --- | --- | --- | --- | --- |
| 64³ | 5.6–18.4 ms | 12.3–31.8 ms | 27.4–42.2 ms | 9–12 / 64 |
| 128³ | 35.0–100.5 ms | 22.8–47.1 ms | 75.1–168.2 ms | 13–24 / 512 |
| 192³ | 118.2–339.5 ms | 37.1–85.4 ms | 177.0–581.7 ms | 21–43 / 1,728 |

Source brush local-remesh medians: **14.4 / 10.8 / 11.2 ms** at 64³/128³/192³, versus previous **14.9 / 10.8 / 11.6 ms**. No detected source-brush CPU regression within uncontrolled run variability. Stamp meshes affect more chunks, so their totals should not be equated with the prior 12–15 ms brush baseline. Browser samples: 48.5 ms for the 64³ cutter and 111.1 ms for the 128³ cutter.

Reproduce with `npm run benchmark:stamps` and `node scripts/benchmark.mjs outputs/source-benchmark.json`. Detailed JSON accompanies this report.

## 5. Known limitations

- Dense scans and exact far-field deltas can be large; high-resolution Add/convex stamps may briefly block the main thread (~0.58 seconds in this test). Sparse staging plus history Map capture uses transient memory. Existing history budget is soft for the newest action.
- Fixed volume bounds: Add is conservatively rejected if its transformed AABB comes within one voxel of the outer boundary. No automatic expansion/resampling. Large cutters may exceed supported stored distances and are rejected.
- Positive uniform layer/shape scales only. Surface placement is centre-on-hit; no automatic normal alignment, depth drag, placement plane or ghost gizmo.
- Small details and sharp edges remain limited by voxel spacing and isosurface sampling. Sphere ghost is tessellated; analytic stamping is not.
- Native load clears session history and ghost state. Colour preferences are saved. Existing camera, aggregate voxel and import triangle limits remain.
- No worker/cancellation for stamp execution. Validation failures occur before writes; allocation exhaustion/renderer failures are not recoverable transactional jobs.
- No repeated drag stamping, VR, thumbstick scaling, implicit merges or deformation tools.

## 6. Next-phase recommendations

Phase 1.12 should prioritize a ghost-only transform gizmo, surface alignment/depth controls, target-volume bounds feedback and worker-based large-stamp preparation with cancellation and frozen volume revisions. Preserve one-click/one-action, target-local math, colour metadata and exact undo. Optimize bulk sparse history to consume typed patches without duplicate Map staging; consider block range caches for exact candidate pruning. Keep continuous stamping and VR separate explicit scope.

Required handover is updated at `docs/DEVELOPMENT_STATUS.md`; an identical copy is supplied beside this report.

## Try it

1. Run `npm run dev`; open http://localhost:5173.
2. Expand Shape Library, select Cube / Box and Subtract, and rotate Y to 25°.
3. Hover the sculpture and click once. Verify Undo/Redo and that a drag does not repeat.
4. Create another layer at a different resolution; stamp it and verify the original remains intact.
5. Save/Open Project; export separate layers or the Boolean result. For precise numeric placement, uncheck Follow pointer and use Stamp once at preview.
