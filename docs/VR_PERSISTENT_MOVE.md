# Phase 2.1 — Persistent Non-Elastic Move

Software implemented 2026-10-26; **awaiting physical Quest 3 testing**. The incoming request was Phase 2.2 Elastic Move. Inspection found that Phase 2.1 was only a plan plus interfaces. The user explicitly selected **implement Phase 2.1 first, then stop for testing**. Elastic/Kelvinlets remain disabled and unimplemented.

## Result and controls

Move defaults to **Non-Elastic**. Point at active visible/unlocked clay in Separate Layers, hold Tool trigger, pull with the full accepted hand travel, and release. The final preview stays visible during preparation. A successful operation publishes the editable SDF and exactly one Undo action. Support stick Left/Right undoes/redoes it. Tool Options can choose **Preview only**, which still restores on release and makes no action. Mode/radius/falloff/strength are captured for the gesture; Tool stick sizing remains idle-only. Existing four-direction Support shortcuts, alternate Clay/Smooth, realistic controllers, neutral background, workspace grips/dual-grip scaling and independent layer transforms remain.

The release frame's actual controller pose is captured, including motion since the previous held frame. Input/session/source/transform changes cancel safely. Support grip explicitly cancels a pending job and can then navigate the workspace. Menus/history/stamps/layer edits cannot modify the source while the Move owns it; tool switching aborts an unfinished job. After interruption, release/repress to rearm. A zero-displacement gesture preserves redo and creates no action. A resource or numerical rejection reports the reason and keeps the original source/history.

## Field and reconstruction

The Non-Elastic field preserves the accepted radial preview:

`p' = p + delta * max(0, 1 - |p-centre|²/radius²)^(falloff+1)`.

`delta` is strength-scaled controller translation in the frozen layer-local coordinate frame. It has no short pull-distance cap. Radius controls the initial support. Preview normals use the oriented Jacobian cofactor and a finite collapsed-plane fallback; original attributes are not uploaded or mutated. This is a compact radial deformation, not an Elastic material simulation or an exact volume-preserving operation.

On release, `IndependentLayers.commitMove` freezes its own field snapshot, pins source/runtime/volume/history ownership, captures transforms/revision and prepares a separate candidate. A same-spacing dense copy preserves exact Float32 rows and signed lattice coordinates; new capacity follows the established positive saturated exterior policy. Growth uses the actual rectangular extents and Phase 1.15 limits. It never resamples old detail or changes workspace/layer metadata.

`reconstructMove` snapshots the deformed closed triangle surface once per commit. It builds a compact Morton-ordered BVH and evaluates nearest triangle distance plus **oriented ray crossing** sign only in the swept support AABB with a three-sample halo. The snapshot includes the active layer's complete surface so disconnected pieces, cavities and unchanged nearby geometry participate in inside/outside queries; this global preparation occurs at release, not on every preview frame. Sampling and chunk extraction remain local. Rays meeting shared edges/vertices, nearly tangent faces or coincident crossings retry three deterministic non-axis directions; unresolved ambiguity rejects safely.

A nonzero oriented crossing count handles overlapping consistently oriented closed components without XOR-cutting their overlap. Original material at samples outside the compact initial support is retained, including unrelated components overlapped by a pull. Other unchanged samples retain exact old values when their nearest triangle and sign remain unchanged. Distances saturate to existing native limits. This is a bounded local distance reconstruction of the displayed triangle approximation; it is not a global exact signed-distance/Boolean solver for arbitrary defective meshes. Internal overlap surfaces, folds and sub-voxel structures can still produce detail artifacts.

Algorithm context: [CGAL's closed-mesh ray test](https://doc.cgal.org/latest/Polygon_mesh_processing/classCGAL_1_1Side__of__triangle__mesh.html) documents boundary-hit retry handling. [Jacobson, Kavan and Sorkine-Hornung's winding-number work](https://igl.ethz.ch/projects/winding-number/) explains orientation-aware inside/outside classification. This implementation uses integer oriented ray crossings on native closed SDF-derived triangles; it does not implement that paper's generalized winding-number/graph-cut algorithm and adds no CGAL/libigl dependency.

## Atomic publication, history and resource ownership

All sampling is read-only with respect to the live source. Candidate values, patch before/after arrays, history remaps, timeline arrays, affected chunk meshes and display spatial index are prepared before publication. `SculptHistory.prepareMoveReplacement` stages exact owned deltas and remaps retained history into the new lattice. Capacity remains allocated after Undo; exact old values/coordinates restore, consistent with Phase 1.15. Native project versions, saved-history policy and GLB structure are unchanged.

`IncrementalMesher.forkEdit` borrows unchanged chunk geometry without taking ownership. Only patch/gradient-halo chunks and occupied growth-boundary halos remesh. Cancellation disposes candidate-owned buffers only; success transfers shared ownership before disposing superseded geometry. Source volume, mesher, surface, history and timeline publish synchronously with no await. A preallocated Boolean-cache invalidation prevents stale derived views after growth/replacement. No hidden layer is baked, merged or edited.

The original GPU preview and owned edit locks remain until commit or cancellation. On success the authoritative source group replaces it in the same layer/workspace frame. On failure or tracking/session interruption, the original materials/shape restore and no partial action is retained. Source/project/layer/store/revision/native transform/world matrix are checked across asynchronous slices and immediately before publication.

No 300,000-vertex gate is used. Memory is checked against existing dense/transient/project budgets, including the candidate store/scratch, surface index, patch/history buffers, retained history indices and newly staged geometry. These are conservative byte accounting estimates, not browser-process/GPU peak measurements. Individual allocations, a chunk extraction, native-code operations or GC may exceed the scheduling target.

## Scheduling and diagnostics

`MoveWork` targets about 3 ms of CPU work between cooperative timer yields. Triangle distance/sign traversal is resumable in 64-node blocks with reused traversal buffers, so difficult individual queries can continue after yielding instead of being rejected by a time gate. Morton/radix/index construction and volume copies also yield. Empty padded BVH subtrees are pruned. Whole-sculpture vertex counts do not determine eligibility; actual resource estimates do.

The existing HUD reports stage progress, preserves it ahead of stale radius hints, and announces one-action commit/failure. Performance diagnostics retain preview CPU/p95/affected counts and show the last commit wall time/voxel count. `lastMoveStats` records sampled voxels, changed voxels, index/patch bytes, accounting estimate, CPU/wall/meshing time, maximum observed processing slice, dirty chunks, growth and slice count. These CPU/slice measurements are not XR/GPU frame timings.

## Validation and measurements

- **580 tests passed**, zero failures; TypeScript/production build passed. Existing Vite bundle advisory remains. `git diff --check` passed.
- 27 new persistent Move tests cover analytical distance/sign/cavity/overlap cases, ambiguous-ray retry, bounded traversal/padded-node pruning, atomic failures at history/meshing/publication, cancellation at every preparation stage, exact Undo/Redo and repeated edits, native round-trip, actual positive/negative boundary growth, post-growth editing, transformed/disconnected sources, actual XR release-frame pose, tracking/menu/grip/session/tool interruptions, stale source/workspace checks, Boolean invalidation and both binary GLB paths. Existing preview/large-layer, Clay, Smooth, Steady/Line, Stamp and controller regressions pass.
- Browser WebGL validation used the actual XRMoveTool with synthetic poses: preview retained during reconstruction, source persisted after release, exactly one action, native round-trip, Undo exact original source, Redo, and long-pull growth to **64×64×97**. No shader errors. [Pending state](../outputs/phase-2-1-browser-pending.txt), [growth state](../outputs/phase-2-1-browser-grown.txt), [screenshot](../outputs/phase-2-1-browser-grown.png), [Undo](../outputs/phase-2-1-browser-undo.txt), [Redo](../outputs/phase-2-1-browser-redo.txt). A 64³ browser growth commit observed 343.9 ms wall, 149.3 ms CPU, 6.4 ms maximum slice; uncontrolled desktop run, not Quest timing. Harness: `/scripts/persistent-move-browser.html`.
- Node benchmark: `node --expose-gc scripts/benchmark-persistent-move.mjs`. Real native-compatible sphere meshes; initial 64/114/160 at radius .85, initial 192 at radius .95 to exceed one million vertices. Delta `(0.15,0.03,0.2)`; two influence sizes. One commit/configuration: **no operation p95/p99 is claimed**. Undo exactness is checked after each. Raw [JSON](../outputs/phase-2-1-persistent-benchmark.json) includes process-wide GC-checkpoint RSS/heap/external/arrayBuffers. Estimates below exclude process/runtime/GPU memory and are not measured peaks. Source retained old capacity after Undo can affect the next row's memory footprint.

| Source vertices | Radius | Result | Wall ms | CPU ms | Max processing slice ms | Remeshed chunks | Accounting estimate MiB |
|---|---|---|---|---|---|---|---|
| 94,608 | 0.2 | PASS | 104.0 | 78.5 | 9.8 | 8 | 8.7 |
| 94,608 | 0.4 | PASS | 258.9 | 189.4 | 6.9 | 12 | 10.0 |
| 305,640 | 0.2 | PASS | 284.0 | 211.1 | 6.6 | 27 | 36.6 |
| 305,640 | 0.4 | PASS | 1169.2 | 850.7 | 6.4 | 48 | 37.9 |
| 603,072 | 0.2 | PASS | 562.1 | 411.7 | 6.9 | 24 | 87.6 |
| 603,072 | 0.4 | PASS | 3357.4 | 2436.1 | 9.6 | 64 | 92.3 |
| 1,088,784 | 0.2 | PASS | 1019.7 | 744.3 | 5.5 | 64 | 154.3 |
| 1,088,784 | 0.4 | PASS | 6581.3 | 4768.7 | 6.5 | 120 | 169.2 |

These results demonstrate persistence/cancellation/scale compatibility, not instant commits. The million-vertex larger-radius case took **about 6.6 seconds on this Mac**; actual Quest work may take longer. The live preview remains visible and cancellation stays available between slices. The earlier physically accepted preview and flat-window timings do not validate this new reconstruction path. Formal persistent-operation Quest frame p50/p95/p99, cold/warm latency, thermal endurance and reliable process/GPU peak memory are pending.

## Known limits and next work

- Local reconstruction reinitializes a mesh approximation at unchanged voxel spacing; thin details below that spacing can disappear and repeated deformation can soften features. Full hand travel is retained, but extreme folds/self-intersections can change topology, retain internal surface artifacts, or trigger a safe ambiguity failure. There is no advanced twist/rotation tool or exact volume preservation.
- Candidate copies and a whole active-layer surface index consume memory once per commit. Resource/native-triangle/dense-capacity failures keep the source. Existing maximum initial resolution, aggregate voxel/triangle and transient safety policies remain.
- Work is cooperative on the main thread, not worker-based. Synchronous allocation/chunk/GC costs can still spike beyond 3 ms; the Node table's maximum slices show this. Worker offload and further scheduling/device calibration remain performance work. Do not infer headset smoothness from Node timings.
- Save/export during preparation sees the original authoritative source. Save/export after commit sees the new SDF/geometry. Native history remains session-only, as before. Undo retains harmless expanded capacity.
- Elastic/Kelvinlets are intentionally **not implemented**. Stop here for testing before adding a second field and material parameters. Unlimited/sparse storage remains future work; existing dynamic dense SDF bounds are preserved.

## Physical Quest 3 test — pending for this phase

1. Reload the development app and start with a simple 64³ source. Enter VR with performance enabled; select Move and confirm **Non-Elastic** in Options.
2. Small pull, release, wait for progress to finish: deformation must remain. Check exactly one Undo; Support Left restores, Right reapplies. Repeat three times.
3. Select **Preview only**: pull/release must restore and create no action; return to Non-Elastic.
4. During release-time processing, squeeze Support grip to cancel. Check original source/history, then workspace grab and dual-grip scaling/rearming. Verify menus/tool changes cannot cause conflicting edits.
5. Repeat after workspace and independent layer translation/rotation/uniform scaling. Inspect boundaries/normals and nearby disconnected pieces; other layers remain unchanged.
6. Pull past allocated positive and negative faces; check no clipping, unchanged spacing/transforms, exact Undo/Redo and continued Clay/Smooth/Stamp edits. Retained empty capacity after Undo is expected.
7. Save/reload and export separate/Boolean GLBs after commit. Compare with displayed committed source.
8. Test 300k, 600k and million-vertex scenes progressively, starting with small radius. Record preview and pending-commit XR p50/p95/p99, maximum, commit wall delay, first/warm pulls and memory diagnostics. Larger radii may require seconds; cancel if needed.
9. Tracking loss, visibility/session exit and reentry during pending work must keep original source and release locks. Repeat an extended session and report any resource warning, fold/detail loss or stalled progress.

The user has accepted earlier preview/full-travel interaction on Quest. This checklist concerns **new persistent commits**, which have not yet received physical acceptance.

## Protection and files

Incoming uncommitted work was preserved in `work/checkpoints/before-2-1-persistent-move.tar.gz`; SHA-256 `7efe97fcedcc65d2f870a8a0224f7e325fda0c7813e100c005f8fbc2caa66442`. [Changed files relative to that snapshot](PHASE_2_1_CHANGED_FILES.md). No commit, push or merge. Final logs: `outputs/phase-2-1-{build,tests}.log` and focused tests.
