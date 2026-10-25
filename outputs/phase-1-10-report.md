# Phase 1.10 — Procedural SDF Shape Library

## 1. What changed

Added Sphere, Cube/rectangular Box, Triangular Prism and Square Pyramid primitives, a Shape Library selector with recognisable SVG icons, dimensions, Add/Subtract selection and a live ghost preview. Numeric controls support layer-local/world position, Euler XYZ rotation and positive uniform scale. Sphere diameters and pyramid square-base dimensions are linked. Target names, bounds, validation errors and preview timing/cache feedback are visible.

Ghosts are explicitly preview-only. They do not modify layers, voxels, transforms, history, native files, Boolean evaluation, Bake or GLB. They follow active-layer selection and valid parent transforms; hidden/locked or nonuniform legacy targets hide the ghost and disable preview edits. Brushing and layer gizmos pause while enabled; Hide/Escape restores normal tools. Camera controls remain available. Narrow-screen preview layout keeps the viewport visible while fields scroll.

A verified pre-edit checkpoint is `phase-1-9-before-1-10.tar.gz` with SHA-256. Git is unavailable in this workspace. No existing files were removed; previous reports and benchmarks were preserved. No new dependencies were needed.

## 2. Key architectural decisions

- Stable shape IDs, immutable human metadata, dimension rules and validated ShapeDefinition remain separate from UI/device logic.
- Sphere and box use analytic Euclidean SDFs. Prism/pyramid prepare exact convex boundaries and use cached triangle closest-point distance plus outward-plane sign classification, so caps, apex, edges and corners are truly three-dimensional.
- Full dimensions are shape-local extents with bounding-box-centred origin. Shape pose maps shape-local to target-layer-local. Prepared world sampling composes layer × shape matrices and scales distances by the combined uniform scale. World pose edits validate the converted local metadata, including compound scale/position and tiny-endpoint cases.
- A session-only model and ghost group live outside project/export roots. Four canonical mesh/edge pairs are cached lazily. Pose/dimension changes update matrices/scales without high-resolution meshing or geometry allocation. Raycasts ignore the ghost.
- Native format remains v3, with unchanged codecs and independent voxel payloads. Existing layer/history/compositor/Bake/export implementations were reused without changes. No stamp executor or Apply button is registered; future stamp intents remain data-only.

| File | Change |
| --- | --- |
| `src/shapes.ts` | Metadata/catalog and stricter uniform/square-base parameter validation; future ports retained |
| `src/shape-library.ts` (new) | Prepared 3D SDF kernels, topology, local/world bounds and sampling |
| `src/shape-preview.ts` (new) | Session preview model, target guards, pose conversion, cached ghost renderer |
| `src/shape-ui.ts` (new) | Selector/icons, parameters, operation controls, local/world fields and feedback |
| `src/main.ts` | Scene integration, input gating, Escape and load/selection synchronization |
| `src/ui.ts` | Library slot and phase header |
| `src/style.css` | Library controls and scoped narrow-screen sticky viewport |
| `tests/shape-library.test.mjs` (new) | 20 focused/integrated tests |
| `scripts/compile-core.mjs` | Compile math/preview modules for verification |
| `scripts/benchmark-shapes.mjs` (new) | Preview/kernel/cache/immutability measurements |
| `package.json` | Add `benchmark:shapes` |
| `README.md` | Current controls, architecture and validation |
| `docs/DEVELOPMENT_STATUS.md` (new) | Full architecture/development handover and Phase 1.11 guidance |

## 3. Build and test results

- `npm run build`: strict TypeScript and Vite production build passed. Bundle approximately 678 kB minified / 178 kB gzip. The existing 500 kB Vite advisory remains.
- `npm test`: **141 passed, 0 failed**. All previous 121 tests retained, plus 20 shape tests. No old test was removed or relaxed.
- Coverage includes primitive distances/signs/surfaces/sharp features; exact bounds/winding; invalid parameters and extreme aspect ratios; translated/rotated/scaled shape/parent math; compound world limits; prepared snapshot independence; preview voxel/geometry/history independence; cache reuse and idle skip; preview/kernel surface agreement; target selection/flags; world/local conversion; legacy nonuniform/invalid targets; raycast/input exclusion; reset/future intent; Boolean/Bake/native/binary-GLB regressions.
- Browser selected all four types, adjusted a rectangular box, rotated it, switched to a rust Subtract pyramid, verified linked square-base axes, and edited world position/scale on the transformed baked layer.
- A held viewport click and W shortcut with the ghost enabled created no sculpt or layer-transform action. Source triangles/timing stayed unchanged and history remained **0 undo · 0 redo**. Hidden/locked target selection correctly hid the ghost and disabled its fields. Unlock/target restoration and Escape worked. Successful native import restored the sculpture but cleared the procedural preview.
- Native files before and after all preview changes were **byte-identical**. All three 64³/128³/128³ saved Phase 1.9 source layers retained exact voxels, IDs and metadata, with **zero changed voxels**.
- Both actual downloaded GLBs contained **one sculpture node, 121,172 triangles and one opaque clay material**, with no ghost mesh, preview extras or translucent ghost material. Detailed assertions: `phase-1-10-file-verification.json`.

## 4. Benchmarks and regressions

`npm run benchmark:shapes`, Node v26.8.1 on this machine; active 128³ layer plus independent 64³ Base. Four cold canonical builds, 2,000 warm validated state updates per primitive, 20,000 prepared world samples and 10,000 idle syncs:

| Shape | Cold geometry + pose | Warm preview mean | Prepared world sample |
| --- | --- | --- | --- |
| sphere | 1.0676 ms | 0.0046 ms | 0.103 µs |
| box | 0.5043 ms | 0.0027 ms | 0.115 µs |
| triangular-prism | 0.1237 ms | 0.0024 ms | 0.340 µs |
| pyramid | 0.1356 ms | 0.0024 ms | 0.238 µs |

Idle synchronization averaged **0.0008 ms**. Exactly four geometry pairs were built and reused. Source voxel arrays, mesh identities, dirty chunks and history were unchanged. Timing excludes DOM, rendering/GPU, picking and end-to-end frame guarantees. The overlay adds two rendered objects; GPU performance is not yet profiled.

Isolated source local-mesh medians were **14.9 / 10.8 / 11.6 ms** at 64³/128³/192³ versus the latest comparable Phase 1.8 source run's 15.2 / 11.7 / 12.1 ms (−0.3 / −0.9 / −0.5 ms). This shows no detected source-CPU regression within uncontrolled run variability; the benchmark excludes the browser/ghost render loop. New bundle growth is about 18 kB minified / 6–7 kB gzip over Phase 1.9.

Cold native import remains main-thread work: one browser run measured roughly 0.93–0.95 seconds for the active 128³ source mesh. There is no controlled browser baseline for that observation. Preview edits did not repeat that extraction. Profile import separately if startup becomes a priority.

Evidence: `phase-1-10-shape-benchmarks.json` and `phase-1-10-source-benchmarks.json`.

## 5. Known limitations

- No applying/continuous stamps, VR controls, shape gizmo/click placement, automatic merge or deformation Move tool. Pose control is numeric in this phase.
- Sphere ghost is tessellated while its SDF is analytic; polyhedron surfaces use exact planar boundaries. Transparent/x-ray outlines may overlap visually.
- Positive uniform parent/shape pose only; independent box/prism aspect ratios use dimensions. Extreme values can exceed current camera/rendering precision; no automatic reframing is added.
- Dimensions stay shape-local even in World pose mode. Ghosts may extend outside finite layer bounds; Phase 1.11 must define clipping/rejection and far-field update semantics before stamping.
- Preview settings are session-only, not sculpture undo actions. They are excluded from native files and cleared on successful import. Colours and source history remain session-only as before.
- Dense-grid/source capacity limits, synchronous/cooperative CPU meshing and existing native triangle limits remain. Prepared convex kernels are synchronous and should be prepared per job; nonconvex future shapes need different kernels.
- Existing compact main/UI orchestration and unprofiled cold import/GPU/UI performance remain technical debt. Source/document hot reload can reset unsaved in-memory sculptures during development; save first. Work/test/script/output generation is ignored by Vite.

## 6. Next phase / handover

`docs/DEVELOPMENT_STATUS.md` contains completed phases/current status, important architecture decisions, Phase 1.9 summary, changed files, features, test totals, benchmarks/regressions, limitations, debt and detailed Phase 1.11 recommendations. A deliverable copy is `phase-1-10-development-status.md`.

Phase 1.11 should add an explicit one-shot Apply command using a frozen intent/target ID and prepared kernel, convert distances into layer-local units, enforce flags/positive boundaries/capacity, and record one sparse `shape-stamp` transaction. Decide finite-volume clipping, narrow-band versus far-field updates and interruption rollback. Reuse existing chunk/composite invalidation. Keep ghost rendering, source-layer ownership and preview preferences separate from voxel writes; do not use Bake or mesh concatenation as the stamping implementation.

Maintain this same six-part completion-report structure for every later phase.

## Manual acceptance

1. Run `npm run dev`; open http://localhost:5173 and load an existing project.
2. Open Shape Library. Browse Sphere, Cube/Box, Triangular Prism and Square Pyramid. Adjust full dimensions, position, XYZ rotation and uniform scale; switch Layer local/World pose. Choose Add/Subtract and inspect teal/rust ghosts.
3. Verify source triangle/mesh stats and undo/redo counts stay unchanged. Try a held click/W while the ghost is enabled; brushing/layer gizmos should pause with feedback. Hide/Escape to resume existing tools.
4. Select another visible editable layer: target/parent pose should follow. Select a hidden or locked layer: ghost and editing should disable clearly. Restore the original target/flags.
5. Save/open, then inspect the source volumes. Preview should clear on import. Export both workflows; no ghost should be included. Existing Boolean/Bake and brush actions should remain operational.
6. Run `npm run build`, `npm test`, `npm run benchmark:shapes`. For an isolated source comparison: `node scripts/benchmark.mjs outputs/phase-1-10-source-benchmarks.json`.
