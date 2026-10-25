# Phase 1.8 — Non-Destructive Boolean Layer Operations

Implemented in the existing workspace, preserving independent layers and source voxel data. No Merge/Bake or destructive composition was added.

## Protection

The workspace is not a Git repository; Git initialization has been unavailable in this environment. A pre-edit archive was created instead: `phase-1-7-before-1-8.tar.gz`, verified against `phase-1-7-before-1-8.sha256`. Existing files were extended; previous phase reports and benchmarks are retained.

## Architecture and behavior

`IndependentLayers` still owns one independent VolumeStore, chunk mesher, surface, transform and sparse history per source. The new `BooleanComposite` is a disposable derived cache. It reads prepared inverse transforms and borrowed source arrays, never writes/resamples source volumes, and is excluded from native serialization.

Evaluation follows explicit **top-to-bottom panel order**, ascending stack order. The first visible layer initializes the result even if marked Subtract/Intersect. Subsequent operations are Union `min(a,b)`, Difference `max(a,-b)`, Intersect `max(a,b)`. Hidden sources are excluded. Locked sources contribute but cannot be sculpted. Empty sources remain mathematical operands; a positive empty field used with Intersect produces an empty result.

The sampler handles independent 64³/128³/192³ sources, translation, Euler XYZ rotation and positive uniform scale. It converts world points with the inverse matrix, trilinearly samples local voxels, and scales distances by uniform scale. Outside each local cube it explicitly adds Euclidean distance outside the bounds to the positive boundary field, preserving continuity and avoiding constant clamped slabs or unwanted outside material. It does not reconstruct exact Euclidean distances after sculpting.

The world-space derived grid encloses transformed bounds with positive padding and targets the finest visible world voxel spacing. It is bounded by a selectable 64³/128³/192³ quality cap, default 192³. Actual adaptive sizes may fall between these caps. The UI reports actual spacing and capped-detail warnings. Small uniformly scaled sources retain proportionally small physical composite bounds; the derived grid skips initialization of a default sphere. Original SDF constructor behavior remains unchanged by default.

Separate Layers renders original surfaces. Boolean Preview hides the entire source group and displays only the evaluated surface. Colours apply to Separate Layers; preview remains neutral clay. Mode changes preserve sculpture data/history. Selection stays in the Layers panel. Preview raycasts hit the evaluated surface while brushes edit only the active visible/unlocked source. Add on a Difference layer grows its cutter. Fully removed areas can be edited by returning to Separate Layers. Gizmos continue to transform original source groups, including while their render parent is hidden.

Local voxel edits/undo/redo map source dirty bounds into the composite grid, coalescing nearby regions and preserving normal-gradient halos. Source transforms, operations, order, visibility and resolution invalidate the whole derived cache; grid allocation changes only when layout changes. Names, locks and viewport colours do not invalidate composition. Idle previews skip work. Rebuilds debounce for a 120 ms quiet period, yield after four sample slices/eight mesh chunks, and cancel stale in-flight work on new edits. Finished chunk surfaces are tested watertight with continuous shared gradient normals.

Operation changes and reordering are small undoable metadata actions on the existing chronological, layer-ID-addressed timeline. New nonempty edits clear redo; no-ops preserve it. Deletion removes the deleted target's history, and order replay filters missing IDs safely. Resampling invalidates target voxel actions while retaining valid metadata actions. Structural creation/deletion, locks, names and display preferences remain outside history.

Native **v3** already persists validated operation/order/transform metadata and independent voxel payloads, so no incompatible format bump was needed. Legacy v1/v2 and Phase 1.6/1.7 v3 files remain readable. Preview grids, surface-view preference, quality cap, history and viewport colours are not saved.

Two explicit export buttons work from either viewport mode:

- **Export Separate Layers:** original visible source nodes, layer-local geometry and independent transforms.
- **Export Boolean Result:** flush composition, then export one evaluated world-space mesh.

Both preserve the native sources and use the existing neutral clay material. Empty Boolean results report that no surface can be exported.

## Changed files

| File | Change |
| --- | --- |
| `src/compositor.ts` (new) | Ordered Boolean mathematics, prepared world samplers, adaptive bounded derived grid, local invalidation, debounce/cancellation, batched rebuilds, stats and composite export |
| `src/independent-layers.ts` | Own compositor cache; route voxel dirty regions; operation/reorder metadata history; safe mixed replay/deletion/resampling |
| `src/mesh.ts` | Optional bounded chunk batch size; existing default rebuild behavior retained |
| `src/sdf.ts` | Optional uninitialized sampled-grid construction for derived fields, including small physical extents; default source behavior unchanged |
| `src/main.ts` | Surface modes, preview lifecycle/status/raycasting, operation commands and both export workflows |
| `src/ui.ts` | Layer operation selectors and order explanation, surface/quality controls, separate exports and composite statistics |
| `scripts/compile-core.mjs` | Compile compositor for tests/benchmarks |
| `scripts/benchmark-composite.mjs` (new) | Full/local/idle composite benchmark and source-preservation checks |
| `scripts/benchmark.mjs` | Preserve previous results; write source benchmark to the Phase 1.8 output |
| `package.json` | Add `benchmark:composite` script; no new dependencies |
| `tests/boolean-composite.test.mjs` (new) | 22 Boolean regression tests |
| `tests/independent-layers.test.mjs` | Update reorder expectation to one undoable action while preserving earlier sculpt history |
| `README.md` | Current controls, architecture, native compatibility, performance and limitations |

Existing project serialization/validation, transforms, surface export helpers and brush mathematics were reused.

## Validation

- `npm run build`: passed strict TypeScript and Vite production build. Existing advisory: the Three.js bundle exceeds Vite's 500 kB warning threshold (approximately 647 kB minified, 168 kB gzip).
- `npm test`: **100 passed, 0 failed**, including existing 78 tests and 22 Boolean tests.
- Tests cover Boolean signs and order/initialization; empty/disjoint fields; source-byte preservation; different resolutions; transformed/distance-scaled sampling and exterior bounds; hidden/locked rules; operation/order/mixed history and redo invalidation; deletion/resampling safety; native/legacy/malformed-file cases; separate/composite binary GLBs; closed shared edges/continuous normals for all operations; local/full extraction equality; idle caching; in-flight cancellation; small-scale detail and clear nonuniform-preview errors. A transformed box-like cutter is a test fixture only, with no shape tools/UI.
- Browser: created 64³ Base + 128³ cutter, translated/scaled it, selected Difference, saved/reopened, viewed Union/Intersect/Difference, undid operation changes, switched to coloured Separate Layers and back, exported both workflows, sculpted through the evaluated surface, and undid a real gizmo drag on the hidden source group.
- Downloaded native files before/after mode changes/operation undo were byte-identical. Both original source voxel arrays remained equal to their initial spheres. A real preview Add stroke changed **346 Base voxels and zero cutter voxels**; Undo restored both arrays exactly. That stroke updated **36/1728 composite chunks**, and its undo updated 27/1728.
- Actual separate GLB: **2 nodes, 159,840 triangles**, with metadata-matching source transform matrices. Actual Boolean GLB: **1 node, 277,396 triangles**. Native metadata excluded viewport preferences; both GLBs used the existing neutral material. See `phase-1-8-file-verification.json`.

## Benchmarks

Run `npm run benchmark:composite`. Node v26.8.1 on this machine; tested Base plus rotated/translated/uniformly scaled 64³ Difference cutter; cap 192³. Five local Add edits, radius .22, strength .35, hardness .5, dt 1/60:

| Base grid | Derived grid | Full sampling | Full meshing | Full elapsed | Local CPU median | Local chunks / total |
| --- | --- | --- | --- | --- | --- | --- |
| 64³ | 114³ | 87.8 ms | 182.6 ms | 385.2 ms | 24.1 ms | 18 / 512 |
| 128³ | 147³ | 190.6 ms | 351.7 ms | 749.8 ms | 18.0 ms | 12 / 1000 |
| 192³ | 192³ | 420.9 ms | 732.8 ms | 1501.0 ms | 12.2 ms | 8 / 1728 |

Full elapsed includes cooperative yields; local CPU median sums sampling and mesh extraction. The 192³ row was quality capped. Local sampling processed 7,600 / 11,638 / 21,168 samples rather than full 1.48 / 3.18 / 7.08 million grids. Idle checks took approximately 0.01 ms and skipped all extraction. Sources were verified unchanged by composition; the inactive cutter remained unchanged by brush edits.

Source-only chunk mesh medians were **15.2 / 11.7 / 12.1 ms** at 64³/128³/192³ versus Phase 1.7's **14.1 / 13.5 / 11.1 ms**. Differences were +1.1 / −1.8 / +1.0 ms, with no consistent regression trend. Pure source transform updates still caused zero source remeshing. These are CPU measurements excluding rendering/GPU, picking and DOM, not controlled regression measurements or frame-rate guarantees. Boolean evaluation adds work beyond source meshing; full composition is substantially slower than local updates.

Detailed results: `phase-1-8-composite-benchmarks.json` and `phase-1-8-source-benchmarks.json`.

## Manual acceptance

1. Run `npm run dev`; open http://localhost:5173. Create a new 128³ layer alongside the default 64³ Base.
2. Move the second layer to X 0.55 / Z 0.4 and uniform scale 0.7. Set its operation to Subtract/Difference. Leave Base first, cutter second.
3. Choose Boolean Preview. A spherical cutout should appear with no duplicate cutter/source surfaces. Try Union and Intersect; Undo/Redo should restore operations and evaluated results. Reorder with arrows and undo it to verify direction.
4. Return to Separate Layers / Layer Colours: both original volumes should remain intact. Switch back without losing history. Hide the cutter to exclude it; lock it to keep its contribution while disabling edits.
5. Select Base, choose Sculpt and brush an evaluated outer surface. Only Base changes. Undo it. Select/move the cutter in preview; a completed drag is one action and must not orbit/sculpt. Undo the transform.
6. Save Project and reopen it. Verify both resolutions, poses, flags, order and operations. Native files keep independent editable sources; successful load starts fresh history.
7. Export Separate Layers and inspect two source nodes/TRS. Export Boolean Result and inspect one evaluated mesh. Both workflows work in either surface view.
8. Run `npm test`, `npm run build`, `npm run benchmark` and `npm run benchmark:composite`.

## Known limitations

- Positive uniform scales only for Boolean Preview. Legacy nonuniform metadata remains available in Separate Layers/native files; preview reports an error until explicitly normalized. No implicit resampling/normalization occurs.
- Composite sampling is limited to 192³; large combined bounds, scale differences and rotations can lose fine source detail, with an explicit capped warning. Source SDFs remain untouched. Sharp Boolean creases are approximated with the existing interpolated gradient normals; they can look softened or slightly jagged at finite resolution.
- Full metadata/layout rebuilds can take approximately 0.4–1.5 seconds in the benchmark; continuous strokes/drags defer preview until a short pause. Jobs remain on the main CPU thread with cooperative yields. Allocation and each sample/mesh batch may still briefly pause rendering.
- Chunk updates display progressively during rebuild, so temporary transitions may appear. Finished meshes and exports are tested watertight; exports flush pending work first. More than one million composite triangles produces a clear error and retains sources.
- The derived 192³ field adds up to 54 MiB SDF/scratch storage plus mesh buffers. Existing source aggregate voxel, native triangle/import and camera limits remain.
- Fully occluded/removed regions have no evaluated surface to raycast; use Separate Layers to edit those source areas. The active source is explicitly selected in the panel.
- Source management/display preferences remain outside history; history is session-only. Surface view and quality cap are session preferences. Native v3 remains compatible with earlier supported projects.
- No destructive Merge/Bake, sparse octree, GPU compute, shape stamping/library UI, VR controllers or deformation Move tools were added.
