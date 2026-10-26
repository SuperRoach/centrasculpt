# Move large-layer prerequisite — spatial preview queries

**Current successor:** [Phase 2.1 persistent Non-Elastic Move](VR_PERSISTENT_MOVE.md) now commits by default; the preview-only behavior below remains available as an explicit mode. Earlier hardware acceptance/timings below concern preview, not the new commit path.

Implemented 2026-10-26. Software validation, desktop WebGL profiling and a physical Quest 3 flat-window browser run are recorded. **User has accepted real-controller Move and the full-travel adjustment on the million-vertex Quest scene. Formal immersive timing, peak memory and other untested recovery cases remain pending.** Phase 2.1 persistent deformation has not started. Move remains preview-only; release/cancel restores the authoritative shape.

## Full-travel pull adjustment — 2026-10-26 (current)

The user confirmed the requested release-restoration, larger-radius and workspace-grab checks were done and otherwise good, but reported that Move stopped far too close to the starting point. This was a **second, independent limit**: `RadialMoveField.setDisplacement` capped translation to `radius * 0.4 / sqrt((falloff + 1)/2)` to avoid folds. It was unrelated to the already-removed 300,000-candidate guard. At default radius 0.3/falloff 2, only about 0.098 model units of displacement survived, further reduced in world space by the workspace fit.

That short-distance cap is now removed. The initial radius determines which original vertices receive influence, not how far the hand may move. Displacement is the full captured layer-local controller translation times strength (default 1). The grabbed centre follows that displacement. No cumulative remapping, voxel writes, capacity growth or extra per-frame geometry work was added. The user subsequently retested this revision on the Quest and confirmed **“it worked, we can wrap this up.”** Full-travel Move interaction is accepted by the user on the prepared million-vertex scene. Formal immersive timing and peak memory remain unmeasured.

Normals now use the oriented Jacobian cofactor `n' = (1 + gradient·delta) * n - gradient * (delta·n)` followed by normalization, matching displaced surface tangent cross-products without dividing by a small/negative determinant. A collapsed-plane degeneracy falls back to the original normal. CPU and shader use the same expression; shader program key updated to avoid reusing the old shader. Original geometry/material restoration, chunk seam agreement, frustum handling, transformed displacement and source/export authority remain intact.

This remains a simple radial preview, not a finished Non-Elastic deformation algorithm. Long pulls stretch the existing triangles; extreme sideways/reversing pulls can fold or overlap surfaces, and no new tessellation is generated. Correct local normals do not resolve self-intersections. Those are geometric preview limitations rather than a reason to stop controller travel. Phase 2.1 needs a defined reconstruction/fold policy before persistent commits. The existing preparation-time/memory guards stay in place.

Validation: production build/TypeScript passed; **553 tests passed**. Added full-travel checks across radii/falloffs/strength, long transformed controller movement and exact release restoration, oriented numerical tangent agreement through large displacements/inversions and finite collapsed-plane handling. Browser WebGL long-pull render and release checks passed with authoritative bytes/history/allocation unchanged and no shader errors: [image](../outputs/move-long-pull-browser.png), [visible state](../outputs/move-long-pull-browser.txt), [restoration](../outputs/move-long-pull-restored.txt).

A fresh foreground desktop long-pull run (`/scripts/move-large-browser.html?pull=long`) exercises 1.5 model units outward plus ±0.8 lateral at the three existing sculpture sizes and both radii. All six cases active; zero shader errors/history actions/expansion. Steady held frame p95/p99 **9.3 / 9.4 ms**, held update CPU p99 ≤0.2 ms. Same 30 warmup + 180 measured intervals per phase, host cadence/load uncontrolled; these are not a headset performance claim or a controlled speed comparison. [Raw long-pull measurements](../outputs/move-long-pull-benchmark.json). First-use render submissions still reached 8.8–10.5 ms on desktop. Previous capped-pull Quest timings below are historical and do not establish the new revision's device timings.

Changed: `move-field.ts`, `move-mesh-preview.ts`, `xr-move-tool.ts`, Move tests, browser render/performance harnesses and handover docs. Prior work checkpoint: `work/checkpoints/before-move-long-pull.tar.gz`. No push/merge/commit.

Retest on Quest: reopen the updated million-vertex fixture, select Move, pull outward much farther than the influence radius, then test sideways/backtracking, release restoration and a mid-pull workspace grab. Compare small/large radii and first/warm grabs; report visual stretching/folding separately from responsiveness. The updated test URL was sent to Quest Browser: `http://localhost:5173/?moveXRFixture=1m&moveTravel=full` (the extra `moveTravel` tag identifies the fresh test tab; the code change applies to all Move sessions).

## Exact original restriction

`src/move-mesh-preview.ts` originally exported `MAX_MOVE_PREVIEW_VERTICES=300000`. `MoveMeshPreview.begin` iterated source children, rejected bounding spheres outside the influence, then added **the complete position attribute count of each intersecting chunk**. If that candidate sum exceeded 300,000 it threw before publishing temporary materials. It was a conservative deformation-preview preparation guard, not a rendering, meshing, buffer, GLB or native save limit. It could reject a large local influence even if few vertices were actually influenced. A sculpture over 300k could already pass when its candidate subset was small. Held frames already used uniforms rather than CPU mesh copies; this change preserves that design.

Baseline profiling uses the exact prior implementation preserved in `scripts/fixtures/move-preview-before-spatial.txt`, compiled only by the benchmark. Its whole-sculpture radius-2 stress grab rejected all three fixtures; the new default-budget implementation accepted all 20 grabs/configuration, including **1,088,784 affected vertices**. This is removal of the count gate, not an increased number. Raw baseline comparisons, including failures, are retained.

## Solution and resource behavior

- `ChunkSpatialIndex` is a layer-local BVH over existing tight chunk bounding boxes. `ChunkSurface.update` rebuilds it at changed mesh publication, including replacement/removal, undo/redo and expandable-volume remeshing. Existing geometry boxes are reused; new geometry computes its box once. Tree allocations occur on publication, not during Move hover/held queries. Layer disposal clears references.
- `XRMoveTool` transforms the world aim ray into layer-local coordinates, queries the index, and triangle-raycasts only intersecting chunks; target selection still obeys world distance, active layer, visibility/lock and transforms. It reuses query/hit arrays. Existing Three raycasts can allocate individual intersections; no complete-mesh array is allocated/copied per frame.
- Grab preparation sphere-queries the same index and inspects only candidate chunk vertices once, using scalar distance arithmetic. Only chunks containing influenced vertices receive preview materials. The GPU applies the radial field inside the influence and leaves other vertices unchanged. This is chunk-granular GPU work: vertices outside the sphere in an intersecting draw chunk still run the vertex shader with zero weight. No per-frame SDF read/remesh or vertex attribute upload.
- Held frames update shared uniforms and validate the affected bindings; no index rebuild or candidate/vertex rescan. Original-position evaluation and the unchanged analytic normal Jacobian preserve consistent deformation/normals at duplicate chunk boundary positions. The original geometric pull cap was independent of this count gate and has since been removed by the full-travel adjustment above.
- A **12 ms preparation time budget**, checked between chunk scans, replaces the vertex gate. Exceeding it restores everything, releases owned locks and displays “Move preparation took too long · reduce radius or scene detail and retry.” Allocation/material errors use the same cleanup path. This is a soft CPU work guard, not a guaranteed frame deadline: one chunk, final material binding, shader compilation, rendering or OS scheduling can overshoot. No new global layer vertex limit. GPU/driver resource limits and actual rendering complexity still apply.

The existing source uses identity-local chunk meshes below independently transformed layer groups; the index follows that invariant. World/layer transforms need no index rebuild. Mesh revision invalidation remains part of capture validation. Separate Layers/active editable source, input precedence, save/export authority, preview cancellation and session recovery remain unchanged.

## Reproduction and measurement scope

`node --expose-gc scripts/benchmark-move-large.mjs` creates actual chunked SDF sphere sculptures, not replicated vertex arrays. Initial resolutions 114 and 160 use radius 0.85; initial 192 uses radius 0.95 to exceed one million vertices **within supported native format limits**. Two local radii (0.25 and 0.6) plus whole-sculpture radius 2; 0.6 and 2 are stress values beyond the current 0.5 UI maximum. 200 hover samples after 30 warmup, 20 grabs/configuration, 1,600 held samples/configuration. Old raw raycast and new adapter measurements are not identical scopes; both are recorded, and no universal hover speedup is claimed. Tight old chunk sphere culling already performs well on these simple spheres. Spatial pruning is independently tested over signed, dispersed chunks.

[Node report](../outputs/move-large-benchmark.json) records CPU p95/p99, grab/release, failures and process memory snapshots. There are only 20 preparations, so no preparation p99 claim. Local full-adapter grab p95 ranged 0.397–1.226 ms; whole-sculpture stress grab p95 0.668 / 1.154 / 2.054 ms at the three sizes. Local held CPU p99 stayed below 0.005 ms in Node. These exclude GPU/XR work and do not establish headset framerate.

Open `/scripts/move-large-browser.html` on the Vite server and press **Run all sizes**. Keep it foreground. [Recorded browser JSON](../outputs/move-large-browser.json), [visible-state evidence](../outputs/move-large-browser.txt), [screenshot](../outputs/move-large-browser.png). It draws one actual sculpture in WebGL at 1000×420, pixel ratio 1. Every hover/held phase uses 30 warmup and 180 measured requestAnimationFrame intervals. First preview submission includes CPU grab and render submission (including initial shader setup); it is not input-to-photon or GPU completion latency. No `gl.finish` is inserted. Counters are desktop Chrome 156 on this Mac, not Quest Browser or WebXR. All six local cases active; zero shader errors, preview history actions or volume expansions; tab remained visible.

### Desktop WebGL measurements (milliseconds)

| Sculpture vertices | Radius | Candidate / affected vertices | Hover frame p95 / p99 | Held frame p95 / p99 | Held CPU p95 / p99 | Grab CPU / first preview submission |
|---|---|---|---|---|---|---|
| 305,640 | 0.25 | 26,928 / 6,269 | 10.10 / 10.40 | 10.30 / 10.30 | 0.20 / 0.20 | 2.40 / 10.90 |
| 305,640 | 0.6 | 83,076 / 37,374 | 10.20 / 10.30 | 10.20 / 10.40 | 0.20 / 0.20 | 1.90 / 2.30 |
| 603,072 | 0.25 | 29,064 / 12,912 | 10.20 / 10.40 | 10.30 / 10.40 | 0.10 / 0.20 | 2.30 / 9.80 |
| 603,072 | 0.6 | 140,040 / 74,677 | 10.30 / 10.40 | 10.20 / 10.40 | 0.20 / 0.20 | 1.40 / 1.90 |
| 1,088,784 | 0.25 | 27,936 / 17,932 | 10.00 / 10.40 | 10.20 / 10.30 | 0.10 / 0.20 | 1.70 / 9.50 |
| 1,088,784 | 0.6 | 193,020 / 109,853 | 10.30 / 10.40 | 10.30 / 10.30 | 0.10 / 0.20 | 1.20 / 1.60 |

These intervals track the host browser/display cadence (median 8.3 ms). They must not be interpreted as Quest 90/120 Hz acceptance. First preview submission was 9.5–10.9 ms for each size's first grab versus 1.6–2.3 ms for the following larger-radius grab: first-use shader/render setup remains a visible timing risk.

### Memory measurements (MiB)

| Sculpture vertices | Geometry attribute arrays | Dense values + scratch | Peak sampled browser JS heap | Node RSS after construction |
|---|---|---|---|---|
| 305,640 | 7.00 | 11.30 | 40.92 | 249.44 |
| 603,072 | 13.80 | 31.25 | 84.72 | 282.12 |
| 1,088,784 | 24.92 | 54.00 | 151.68 | 329.98 |

Geometry/dense bytes are exact retained typed-array sizes. Browser heap is the optional `performance.memory` counter and includes runtime, fixtures, garbage awaiting collection and earlier runs; it is neither isolated preview memory nor GPU memory. Node RSS includes compiler/runtime/allocator and retained reservations, with GC checkpoint snapshots; it is not attributable only to the sculpture. Raw reports include heap/external/arrayBuffers and active/released checkpoints. GPU peak and Quest process peak memory remain unmeasured. Preview adds no full-sized position/normal copies; material/index bookkeeping scales with chunks rather than all vertices.

## Validation and remaining limits

`npm run build` (including TypeScript) passed; existing bundle-size advisory remains. **550 tests passed**, including four additional tests beyond Phase 2.0: BVH/brute-force equivalence over expanded signed coordinates, local subtree pruning, publication/removal/hidden chunk invalidation, no reads of distant vertex attributes, >300k affected preview without a count gate, and real **1,088,784-vertex** source exact native save/load, position/normal reference preservation, full-geometry binary GLB accessor counts during preview, exact stroke undo/redo, expanded-volume native round-trip and post-growth local Move. Existing transform/controller/session/brush/Stamp/normal/seam/export suites pass. Time-budget rejection restores materials and authoritative bytes and frees cached clones. Logs: `outputs/move-spatial-{build,tests}.log`, `outputs/move-large-invariants.log`.

Changed implementation: `src/chunk-spatial-index.ts`, `surface.ts`, `move-mesh-preview.ts`, `xr-move-tool.ts`, runtime disposal in `independent-layers.ts`, core compile list. Tests: `chunk-spatial-index.test.mjs`, `move-large-invariants.test.mjs`, prior Move budget test. Benchmark script/legacy fixture/browser harness, outputs and docs added/updated. Incoming uncommitted Phase 2.0 work was preserved in place and checkpointed as `work/checkpoints/before-move-spatial.tar.gz`. No commit, push or merge.

Remaining independent limits: native format initial resolution ≤192, aggregate ≤2×192³ voxels and ≤1,000,000 **triangles** (up to 3,000,000 unindexed vertices); dense growth per-axis/sample/transient-memory checks; mesh/GPU/device capacity; current uniform layer scale, spherical back-side influence and translation-only preview. The geometric pull cap described historically was subsequently removed (see current full-travel adjustment). This change does not relax codec/storage protections or implement persistent Move. Dynamic dense SDF growth remains implemented; unlimited/sparse storage stays future work.

## Physical Quest 3 flat-window run — recorded 2026-10-26

The user ran the benchmark on the connected physical Quest 3 and reported completion. Results were read directly from the completed page accessibility tree and saved unchanged as [Quest Browser JSON](../outputs/move-large-quest-browser.json). User agent identifies Quest 3, OculusBrowser 154.1.0.26.54 and Chrome 154.0.8037.126. The raw report's `scope` text says “desktop” because the original harness hardcoded that description; the actual device is established by the user agent and connected-device capture. It is a flat-window WebGL run with synthetic controller poses, not an immersive WebXR test.

All six local cases became active, remained foreground, reported zero shader errors and left history/allocation unchanged. Each hover and held phase contains 180 measured intervals after 30 warmup frames. All reported held p95/p99 were **14.0 / 14.0 ms**, median 13.9 ms (approximately 72 Hz browser callback cadence). These are steady-state samples; they exclude the initial grab from the frame percentile distribution. They do not establish the full application's immersive stereo rendering performance or physical controller latency.

| Vertices | Held frame p95 / p99 ms (both radii) | Held update CPU p99 ms (worst radius) | First grab CPU / preview submission ms | Next grab CPU / preview submission ms |
|---|---|---|---|---|
| 305,640 | 14.0 / 14.0 | 0.3 | 6.8 / 47.2 | 2.9 / 3.5 |
| 603,072 | 14.0 / 14.0 | 0.3 | 6.2 / 25.2 | 2.2 / 3.6 |
| 1,088,784 | 14.0 / 14.0 | 0.3 | 4.5 / 23.9 | 3.2 / 4.8 |

First-use preview submission is appreciably slower than subsequent grabs. The measurement includes render/shader setup and submission; it is not GPU completion or input-to-photon latency. The first-use work is outside the 12 ms preparation scan guard and remains a hardware hitch to investigate before claiming seamless interaction. The run does not independently isolate how much of that time is shader compilation.

**Memory counter limitation:** Quest returned the identical 42,100,000-byte `usedJSHeapSize` value for every size/phase. Treat it as stale/coarse/uninformative, not as evidence of a constant 40 MiB footprint. Exact dense/geometry byte accounting above remains valid; real Quest process/GPU peak memory is still unmeasured.

Next acceptance step: enter the actual sculpting app in immersive WebXR with a large source, test real Tool-trigger pulls, first/warm grabs, chunk seams/normals, workspace/layer transforms and interruption recovery while recording existing XR frame diagnostics. No persistent Non-Elastic deformation is implied by this preview run.

## Physical real-controller feedback — 2026-10-26

After the actual sculpting app loaded the validated **1,088,784-vertex / 362,928-triangle, initial 192³** scene on the connected Quest 3 and Show VR performance was enabled, the user was instructed to enter VR, select Move and perform repeated real Tool-trigger pulls. The user reported **“feels great.”** This records positive subjective feedback for real-controller Move responsiveness on the prepared million-vertex scene. It does not establish numerical immersive p95/p99, input-to-photon latency or peak memory. That initial reply did not individually confirm the remaining checks. The user subsequently confirmed the prompted release-restoration, larger-radius and workspace-grab checks were done and otherwise good; specifically requested longer controller travel. Seam/normal quality, numeric immersive measurements and other tracking/session checks remain open. No persistent deformation or reconstruction is implemented.

## Remaining immersive physical Quest 3 acceptance

1. Use a supported native scene above 300k, 600k and one million vertices (matching fixtures or detailed real sculpts), retaining independent layers. Record exact count and voxel/storage footprint.
2. Enter XR; select Move; test radius 0.12–0.5 at transformed layers/workspaces, including expanded positive/negative extents. Pull across chunk seams and inspect normals; release restores and creates no action.
3. Enable existing performance diagnostics. Record cold/warm grabs, hover and held frame p95/p99, Move CPU tails, first deformation appearance and memory/high-water readings; available JS heap is not GPU/process peak. Compare idle rendering with local preview. Do not accept smoothness based solely on desktop CPU figures.
4. Try the largest influence on a dense source; verify slow-preparation warnings release ownership, preserve exact geometry/history, and recover with smaller radius/fresh press. A first shader/driver stall may still exceed the preparation budget.
5. Verify menus, Support shortcuts, alternate brush sizing, workspace grabs/dual-grip scaling, tool change, tracking loss and session exit recover; save/reload, undo/redo, independent/Boolean GLBs and expanded Clay continue working.
6. Record Quest Browser version, refresh rate, scene, radii, sample counts, p95/p99/maximum, first-grab latency and memory. Hardware acceptance remains open until the user supplies or confirms these measurements.

## Preparing native scenes for the real-controller session

Run `node scripts/prepare-move-xr-fixtures.mjs` to write validated native .form fixtures and a download page into ignored `work/quest-move-fixtures/`. On the USB-forwarded Quest, open `http://localhost:5173/work/quest-move-fixtures/index.html`. Download the one-million-vertex file, open a fresh sculpture tab, and use Open .form to load it. This preserves any other open sculpt tabs. Enable Show VR performance in VR / WebXR Diagnostics before entering VR. Actual controller acceptance remains pending until tested and reported; scene preparation is not acceptance.

Development server alternative: `http://localhost:5173/?moveXRFixture=1m` (also `300k` or `600k`) explicitly loads only a generated fixture through the same validated native-project open function. The allowlist is development-only and removed from production builds; it accepts no arbitrary URL. This was added after the Quest file chooser returned to a fresh default scene rather than opening the selected fixture; the underlying picker issue is not diagnosed. Direct loading was verified on the physical headset: Project opened, 362,928 triangles / 1,088,784 vertices, active 192³; performance checkbox enabled. Setup evidence: `outputs/quest-million-xr-ready.png`. This verifies setup only, not real controller acceptance. Production build and all 550 tests passed after sharing the existing file-open function with this development entry.

## Final handover — user acceptance, 2026-10-26

The user confirmed the updated longer pull **worked** on Quest and requested wrap-up. The previously prompted release-restoration, larger-radius and workspace-grab checks were also reported done and otherwise good. Close this interaction/preview milestone with that acceptance. Do not imply persistent deformation: release/cancel still restores the authoritative SDF surface and creates no undo action.

Final validation: **553/553 tests passed**, TypeScript/production build passed, whitespace check passed. Exact source/native/export/history and expanded-volume regression checks remain covered. Current long-pull GPU rendering/restoration and desktop 300k/600k/1.09m performance results are recorded above; capped-pull physical Quest flat-window timings remain historical evidence. Formal full-travel immersive p95/p99, first-use latency isolation, reliable device/GPU peak memory and other tracking/session recovery cases remain unmeasured/unconfirmed. Extreme radial-preview pulls can stretch/fold triangles.

Next implementation is a separately scheduled Phase 2.1 persistent Non-Elastic field/reconstruction command with atomic growth/history/remeshing, as described in [the reconstruction plan](PHASE_2_1_NON_ELASTIC_MOVE.md). Kelvinlet Elastic remains Phase 2.2. Existing dense dynamic SDF growth is implemented and preserved; unlimited/sparse storage remains future work. All working-tree changes remain uncommitted; no push or merge performed.
