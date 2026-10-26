# Phase 3.3 — High-quality GLB export and mesh optimisation

2026-10-26. Implemented locally in the Git-backed `vrappPOC` checkout. Incoming tree clean at `1f8f95053574151448600893aafab9ae213e2a23`. Read Development Status and the Phase 3.2 handover first. No reset/stash. User subsequently authorized commit/push; no merge. No source resampling, native schema, persistent dependencies or controller mapping changes.

## Presets and source authority

**Fast (default)** retains existing non-indexed committed triangles and normals, neutral material, layer grouping/transforms and GLB filenames. The original synchronous `exportGroup()` APIs remain available for compatibility. New UI exports use a background pipeline and safety admission even for Fast; binary files are not promised byte-identical to the old serializer.

**Standard** exactly welds coincident positions within each layer across all chunks (including negative coordinates), normalises/combines their SDF-derived normals, removes repeated faces and zero-area triangles, and makes connected surface winding consistent. Uses a 32-bit indexed mesh. No spatial quantisation/tolerance welding that could collapse thin separated components. Existing shared canonical positions generally already match; the main gains are explicit shared topology and much smaller files, rather than a fictitious new geometric resolution.

**High** adds up to three conservative planar one-ring removal passes and 16-bit index packing when the compacted vertex count permits it. A vertex is removed only when its entire closed incident fan has a convex planar boundary, consistent outward orientation and aligned SDF normals. Boundary vertices, creases, concave rings, existing conflicting diagonals and curved regions are retained. Disjoint stars per pass prevent conflicting edits. Three triangles can become one, or a larger planar fan can become `ring size − 2` triangles, without moving retained vertices. The planarity tolerance is at most **1e−6 local voxel steps per accepted fan**, covering floating-point roundoff; actual maximum deviation is recorded. Flat benchmark boxes have zero measured deviation. No forced output triangle target, general QEM collapse, smoothing or invented sub-voxel detail. Curved sculptures may retain every triangle; compact indices can still reduce their file size.

The original mesher is Marching Tetrahedra with canonical zero crossings and global SDF gradient normals. Phase 3.2 corrected Clay's discontinuous exterior field and added true swept deposition. Export presets keep that authoritative committed surface. They do not repair old stored Clay or infer missing 64³ features.

New collectors borrow **committed mesher buffers**, not presentation-scene traversal, materials, ghost geometry or deformation shaders. Snapshot copies are made in bounded blocks, with source identity, revision, metadata and layer selection guards. Pending strokes/transforms/Move previews/reconstruction are rejected; completed Non-Elastic/Elastic/twist reconstruction exports its new committed SDF surface. No mesh buffer is detached from the editor. No allocation assumes cubic extents or nonnegative chunk/sample origins.

Visible layers remain independent GLB nodes, welded only within each source layer. **Export Selected Layer** explicitly includes the selected layer even when hidden. Native layer position/XYZ rotation/positive scale are preserved; workspace navigation/tracking transforms are excluded. Project units remain glTF metres; no automatic millimetre conversion. Boolean Result remains one explicit derived result at the existing **user-selected Boolean cap**, with its native center retained. High does not secretly raise that cap or merge independent sources.

## Topology decisions and safety

Winding is propagated using shared-edge parity, then each connected component's outward sign is chosen from its SDF normals. An initial per-face normal test incorrectly flipped two tiny pyramid-apex triangles; the connected-component method keeps the correct neighbourhood orientation and is covered by the pyramid regression. Non-manifold edges with more than two incident faces and non-orientable surfaces reject Standard/High with a useful error; Fast retains the original surface for external repair. Open boundaries are reported, not silently capped. Duplicate removal, welding and planar optimisation do not promise to turn arbitrary invalid input into a watertight solid. All intended closed compatibility fixtures have zero boundary/non-manifold/inconsistent edges after cleaned export.

The admission budget is a **conservative geometry-work estimate**, not an OS/browser memory cap: `corners × 112 / 288 / 480 bytes` for Fast/Standard/High, plus per-layer metadata. The UI subtracts tracked source/history bytes from a 256 MiB working allowance. Input triangle ceilings are 1,000,000 / 600,000 / 300,000. These caps bound structural entries before snapshots, Maps and adjacency allocation; the actual JS engine, worker startup, renderer and GLB serializer have additional overhead. Output bytes are checked too. Allocation/worker/validation failures do not publish partial files or modify the source. There is no silent quality downgrade or destructive reduction to make a budget fit.

Browser workers perform welding, cleanup, optimisation, continuity checks and GLTFExporter packing. Main-thread snapshot copying yields around a 3 ms cooperative target in 16,384-float blocks; indivisible allocations and scheduler delays can exceed it. Worker termination cancels even during GLB packing. Stale IDs/results/source changes are rejected. Unsupported environments have a cooperative fallback only for meshes up to 10,000 input triangles; larger work clearly requires Web Workers. No expensive automatic fallback runs on the render thread after worker failure.

## Controls and actual browser checks

Existing export area now has Fast/Standard/High, visible-source triangle estimate, preflight feedback, selected/visible/Boolean buttons, per-stage progress, final count/size, Cancel and Escape. Editing/other project operations stay disabled until success/failure/cancellation; rendering remains independent of worker processing. Exports continue through the existing desktop controls after leaving immersive VR; an in-headset file/download menu was not added. Composed-cache preparation remains the existing cooperative scheduler; cancellation stops the export wait, while that shared preview cache may finish rebuilding.

Actual desktop WebGL browser check: High exported the 64³ starter sphere through the real browser worker; the source stayed at **31,536 triangles / 0 undo**. A new disposable 128³ starter layer was created; High selected-layer export was cancelled through the visible button, returned “Export cancelled. Source sculpture kept.” and restored enabled controls without captured console errors. The browser check preceded the final cosmetic selector styling and compact-index addition; those changes passed build/tests and the latter was independently validated in all compatibility GLBs. No physical Quest, GPU frame or thermal claim. The temporary test server was stopped.

## Measured benchmarks

Reproduce: `node scripts/benchmark-export.mjs outputs/phase-3-3-export.json`.

Actual complete worker jobs (snapshot, worker startup, optimisation, serialization), isolated Mac Node processes, **one observation per row**, no medians or speedup guarantees. RSS sampled every 5 ms during export includes source arrays, Node runtime and worker. OS process maxRSS is also in the raw report, and includes fixture extraction and independent GLB reload; neither number is a Quest/browser peak. This distinction matters: the 256 MiB admission estimate is not a process RSS guarantee. Main-thread timer-gap maximum in these admitted jobs was **6.54 ms** with a 5 ms interval, not an XR frame measurement.

Surface error probes retained vertices and triangle centroids against analytic sphere/box fields, **not Hausdorff distance or a universal bound**. High had **no increase** in this measured error in any admitted fixture. Its accepted planar removals in these fixtures had zero recorded deviation. GLBs were actually encoded and independently reloaded before counting nodes/triangles. Four-layer fixtures retain four nodes and transforms.

| Resolution / scene | Preset | Export ms | GLB MiB | Triangles | Sampled RSS peak MiB | Max analytic error (voxels) |
|---|---|---:|---:|---:|---:|---:|
| 64³ sphere | fast | 52.4 | 2.166 | 31,536 | 142.9 | 0.021330 |
| 64³ sphere | standard | 129.7 | 0.723 | 31,536 | 173.2 | 0.021330 |
| 64³ sphere | high | 288.8 | 0.543 | 31,536 | 207.3 | 0.021330 |
| 64³ box | fast | 53.6 | 2.539 | 36,960 | 153.8 | 0.115258 |
| 64³ box | standard | 134.6 | 0.847 | 36,960 | 181.1 | 0.115258 |
| 64³ box | high | 242.5 | 0.448 | 26,040 | 219.7 | 0.115258 |
| 128³ sphere | fast | 76.6 | 8.811 | 128,304 | 237.4 | 0.011006 |
| 128³ sphere | standard | 406.4 | 2.938 | 128,304 | 320.7 | 0.011006 |
| 128³ sphere | high | 993.0 | 2.204 | 128,304 | 359.5 | 0.011006 |
| 128³ box | fast | 78.6 | 10.245 | 149,184 | 251.2 | 0.115258 |
| 128³ box | standard | 477.1 | 3.416 | 149,184 | 355.2 | 0.115258 |
| 128³ box | high | 921.7 | 1.720 | 100,116 | 415.2 | 0.115258 |
| 192³ sphere | fast | 102.4 | 19.938 | 290,352 | 367.9 | 0.007353 |
| 192³ box | fast | 107.3 | 23.118 | 336,672 | 403.1 | 0.115258 |
| 64³ four-layers | fast | 74.7 | 8.665 | 126,144 | 231.5 | 0.021330 |
| 64³ four-layers | standard | 341.5 | 2.891 | 126,144 | 268.0 | 0.021330 |
| 64³ four-layers | high | 702.3 | 2.169 | 126,144 | 284.4 | 0.021330 |

Safety rejections are actual benchmark outcomes: Standard and High on the dense 192³ sphere and box exceeded admission, as did all presets for four 128³ spheres in this fixed total budget. They rejected before snapshot allocation, in under 1 ms in these observations. Use Fast where admitted or export individual layers; increasing limits is not silently offered as safe for Quest. Dense 192³ clean/High exports and large multi-layer batch streaming remain limitations, not claimed delivered. Raw rows include rejection reason, source accounting and measured process memory.

Examples: 64³ box **36,960→26,040 triangles** in High (29.5% fewer). 128³ box **149,184→100,116** (32.9% fewer). Standard 64³ sphere file drops from about 2.17 to .72 MiB with unchanged geometry; High compact indices reduce it further. Flat geometry benefits from planar removal; spheres retain their triangles.

## Validation and compatibility

* **715/715 complete tests pass** with the default runner; also **715/715** at concurrency 4 and **89/89 actual-worker Move contracts**. One earlier parallel run hit an existing wall-clock-sensitive XR grab assertion under load; the final default run and bounded-concurrency full run passed. No existing tests were removed or timing guards relaxed.
* Strict TypeScript / production build / whitespace checks pass. Existing main bundle advisory remains; the new export worker is approximately 170 kB minified.
* **36 actual GLBs, zero Khronos errors and zero warnings**, plus successful independent GLTFLoader import. Matrix: sphere, cube, triangular prism, pyramid; free curved Clay with three components; mirrored/constrained Line with negative expanded coordinates, transformed and independent layers; Boolean Union/Difference/Intersect; completed Non-Elastic, Elastic and twist Move. All three presets in each case. [Raw validator report](../outputs/phase-3-3-glb-validation.json).
* New tests cover exact cross-chunk welding, near-but-distinct surfaces, duplicate/degenerate removal, normal normalisation, winding, closed seams, geometric dimensions/area, planar reduction, transformed metre-scale bounds, disconnected components, selected hidden layers, navigation exclusion, source/native byte preservation, admission rejection, pending Move guards, real worker cancellation during cleanup/packing, retry and large (128³) indexed meshes. Existing source/history/save/load/Boolean/Bake/GLB/sculpt/controller suites remain.

Khronos Validator is temporary tooling only, not a project dependency. Reproduce with `npm install --prefix /tmp/centra-export-validation --cache /tmp/centra-export-npm-cache gltf-validator@2.0.0-dev.3.10`, then `node scripts/validate-export-glb.mjs /tmp/centra-export-validation/node_modules/gltf-validator/index.js`. This validates glTF 2.0 interoperability; actual Blender/CAD application opening still belongs in manual acceptance, not a claimed test.

## Files and remaining work

Core: `src/export-mesh.ts`, `src/glb-export.ts`, `src/export-client.ts`, `src/export-worker.ts`. Source contracts: `src/independent-layers.ts`, `src/compositor.ts`. UI: `src/main.ts`, `src/ui.ts`, `src/style.css`. Tests/tooling: `tests/export-quality.test.mjs`, `scripts/compile-core.mjs`, `scripts/benchmark-export.mjs`, `scripts/validate-export-glb.mjs`, `scripts/fixtures/{export-node,node-export-worker}.mjs`. Evidence: `outputs/phase-3-3-{export,glb-validation}.json`, [browser screenshot](../outputs/phase-3-3-export-ui.png) and this handover / Development Status. No changes to voxel resolution, project format, Move algorithms, controller routes, Boolean sampling cap or GLB neutral-material policy.

Quest 3 acceptance checklist:

1. Draw fresh 64³/128³ Clay, mirrored and Straight Line strokes with disconnected islands. Export each preset after leaving immersive mode. Compare silhouettes, normals and creases to the source in Blender or another external viewer. Older coarse Clay should not magically acquire missing detail.
2. Export selected hidden/transformed layers and multiple visible layers; confirm distinct nodes, dimensions/metres and origin against native project coordinates, excluding workspace presentation scale. Export negative-side expanded material and Boolean results at known cap.
3. Finish Non-Elastic/Elastic/rotate/twist Move, then export; attempt export while reconstruction is pending and verify the wait/cancel message. Verify no preview helpers or temporary deformed shader surfaces enter GLB.
4. During expensive exports inspect real Quest browser responsiveness, worker progress/cancel/retry, memory/thermal traces, source history and save/reload. Check memory rejection before allocation on large 192³/multi-layer work. No hard headset frame/memory guarantee is inferred from Node.
5. Validate/open the resulting GLBs externally and inspect normals, component count, closed topology and dimensions. Compare Fast/Standard/High actual size/count; High should keep curved detail when no safe planar simplification exists.

**Recommended Phase 3.4:** layer-by-layer / streaming export to lift current memory admission limits, measured browser/Quest memory accounting and physical acceptance, then optional curved-mesh simplification only with a bidirectional surface-error bound, feature/boundary constraints and topology preservation. Consider an immersive export/download workflow separately. Retain SDF authority and source guards.
