# Phase 2.5 — Move precision and usability polish

2026-10-26. **Software implementation complete; physical Quest 3 acceptance pending.** Success criteria about how this feels with real Touch Plus controllers remain unverified until the user confirms. No commit, push or merge.

## Review and protection

Read DEVELOPMENT_STATUS and Phase 2.3/2.4 handovers, traced Move capture/targeting, contextual palette, controller arbitration, asynchronous reconstruction and exact history. Incoming work included uncommitted Phase 2.4 and test-runner changes, all preserved. Checkpoint: `work/checkpoints/before-2-5-precision.tar.gz`, SHA-256 `6cd155e040cb794adc5a02991f8656c01c3ef0e9198a9b8f3fe9110cf762f4cc`. Incoming full suite: **631 passed**.

Already present: active-source spatial ray targeting, layer-local frozen controller reference/pivot/radius, strength and falloff, Non-Elastic/Kelvinlet translation, rotate/twist, original-attribute GPU preview, source/session cancellation guards, worker sampling with cooperative memory fallback, preview-held private staging, atomic SDF/mesh swap, one successful history action, expanded bounds and independent transforms. Phase 2.3's shortest-angle wrist representation could flip at a half turn. No controller-noise suppression or Precision option was present. Actual `XRAlternateTool` excluded Move despite earlier descriptions implying Support-trigger Smooth worked there; that gap is fixed in this phase.

## Interaction design

`MoveGesture` is a reusable, allocation-free held-frame pose response. Translation always derives from the trigger-down grip position in the captured inverse layer/world frame, including the final release pose. Initial displacement is exactly zero even when the grip is offset from the pointing ray. No velocity integration, time smoothing, per-frame mesh edits or accumulating displacement is used.

A small radial translation dead zone suppresses <=**0.3 mm of tracking-space hand travel**. Between .3 and .6 mm a C1 cubic blend returns to the identity response; above .6 mm normal hand travel is unchanged. The frozen world scale converts this physical threshold into local units. Normalized strength, native layer radius conversion and workspace navigation are unchanged. Radius remains a sculpture-space size divided by native uniform layer scale; its displayed world size follows workspace zoom. This is a deterministic noise floor, not adaptive tracking prediction; slower deliberate subthreshold moves are suppressed too.

**Precision** is an idle-only Tool Options setting, default **Off**, captured per gesture. On scales the entire gesture's translation and wrist response by **¼**, in addition to existing strength/sensitivity. It changes no navigation, grip, stick, trigger or workspace mapping. It is session tool state, not new native project metadata. Return-to-start produces zero response; repeated identical poses never accumulate deformation. Very small edits remain limited by SDF resolution and reconstruction accuracy.

Rotation still compares the current grip orientation against captured orientation in the frozen layer frame. A **0.2°** wrist dead zone blends to full response by **0.4°**, before sensitivity/Precision gain. Equivalent quaternion signs and nearest angle branches retain continuity through 180°. Free-axis handling also preserves the oriented axis sign: flipping axis and angle together would preserve ordinary rotation but reverse the progressive twist profile. Layer-local X/Y/Z locks use continuous signed swing/twist projection; the perpendicular half-turn singularity holds its previous angle. Output stays clamped at the existing limit (default 120°, maximum 180°). This is branch continuity within bounded local edits, not unrestricted multi-turn sculpting. A tracking jump greater than half a turn between observations is ambiguous; tracking loss still cancels.

## Target and options feedback

The actual mesh hit remains the target: no temporal smoothing moves it off the surface. Effectively coincident chunk hits use the previous chunk as a tie-break only within **10 micrometres of world ray distance**. A clearly nearer hit wins; a genuine miss hides the marker instead of retaining an invalid floating target. Target/pivot freezes for the gesture. All ray queries remain active-source/spatial-index based.

Move's dense wire sphere is replaced by **three 64-segment depth-tested great-circle rings** at the exact local kernel radius, plus a smaller surface point marker (1.8% of radius). Valid idle targets use pale blue, held targets brighter blue; locked targets amber with an explicit unlock hint and no grab; hidden/invalid targets show no false editable highlight. Rings are an influence-volume boundary, not a projected geodesic footprint. Their depth testing reduces hidden/backside clutter; readability in stereo still needs headset confirmation. Presentation objects remain outside saved/exported source meshes.

Contextual labels use Translate / Rotate region / Twist region, Precision, Edge softness, Elastic firmness and Wrist sensitivity. Rotation compatibility explicitly says fixed-pivot Non-Elastic and suggests locking an axis for twist. The inactive translation-mode row is labeled **Saved translation setting** in angular modes; Elastic is retained for return to Translate, not implied to apply to rotation. Existing unavailable translation strength/firmness controls remain disabled for wrist gestures. Preview-only still works and reports release restoration. The real canvas palette was inspected for fit; Precision is reachable on the first options page for all gestures. Radius stick sizing remains available outside menus/gestures.

## Input and reconstruction policy

| Input | Behaviour |
|---|---|
| Tool trigger | Frozen-reference Move gesture; release reconstructs, or restores in preview-only mode |
| Tool stick up/down | Influence radius while idle |
| Support trigger | Temporary configured alternate brush (Smooth by default), returning to Move with its settings intact |
| Support grip | Workspace grab; cancels pending Move and keeps source |
| Both grips | Workspace scale/rotation; cancels Move ownership |
| Support stick left/right | Existing Undo/Redo shortcuts; pending Move blocks conflicting history |
| Support stick up/down | Existing Tool Wheel / Layers Palette ownership |

Alternate Smooth waits for the Tool trigger and current transaction/reconstruction to finish; it does not split a held Move or steal a pending source. Menu closing, tracking changes and grip takeover retain release/rearm rules. Actual controller bridge tests cover both dominant hands, reversed slots, precision response, sizing, temporary Smooth, menus and both grips.

Phase 2.4's worker/snapshot/generation, memory admission, cancellation and atomic publication paths are reused. Final release also repaints the marker for the final preview pose. Progress says preview held; success says **Move committed · ready to edit · one Undo action**; errors explicitly say **source kept**; pending cancellation feedback survives repeated idle cancellation calls and asks for trigger release/rearm. The last deformed preview stays active until publication or explicit cancellation/failure. Other-layer gestures/selection/deletion/Undo/Redo remain blocked while pending; cancel first. Project/session/tool/tracking changes invalidate the job. Save/load/GLB semantics, expanded bounds, transforms, Boolean invalidation and neutral export materials are unchanged.

Worker CPU sampling remains off-thread only when snapshot admission fits. Million-vertex cases use the existing cooperative fallback. Main-thread allocations, history preparation and individual chunk extraction can still exceed a 3 ms slice. This phase adds no hard frame-time guarantee or architectural reconstruction rewrite.

## Verification

- Baseline **631/631**, final **659/659 full tests passed**, no failures/skips. TypeScript (`npx tsc --noEmit`), production build and whitespace checks pass; existing Vite bundle-size advisory remains.
- **89/89** worker-enabled Move contract/precision tests pass using the actual worker module via Node worker_threads adapter. `npm run test:worker` now includes precision suites.
- New **28 tests**: offset-grip zero start, noise floor/continuous response/no drift, precision in both translation modes, transformed workspace/layer/radius, angular noise, free/locked rotate/twist through half/full turns and reversal, quaternion aliases, exact-half-turn direction, locked/hidden/miss targeting and coincident-hit tie-break, actual palette setting, alternate Smooth restoration, final-preview hold, one-action native/Undo/Redo, tracking/session/tool/project/layer/history interruption, injected history failure and retry, and full controller-bridge arbitration.
- Existing Clay, Smooth, Stamp, history, GLB/Boolean, growth, transformed source, >300k/million-vertex, CPU/GLSL normal and source-buffer tests remain. No SDF field/shader formula changed; shared original-position field and duplicate-vertex seam contract retained.

Desktop browser harness: `scripts/move-precision-browser.html` on an isolated fresh local Vite server (`node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174`). Existing 5173 servers were left running untouched; one initially served cached older tool state. Restart/refresh the intended development server before physical testing and verify Precision is visible. Harness pose buttons update synchronously as well as through requestAnimationFrame so hidden-tab throttling does not leave stale displayed test values; this is not a frame benchmark.

Actual WebGL browser evidence: normal 1 mm input produced `.001000` local translation; Precision produced `.000250`. Precision Twist wrist 170° then 190° showed 42.50° then 47.50° with a consistent axis/profile. Release displayed preview-held meshing, then one worker commit: **128.4 ms wall**, **103.9 ms worker wait**, **22.8 ms main CPU estimate**, **18.4 ms aggregate meshing**, **6.1 ms observed max slice**. Native round-trip PASS, Undo restored original bytes, Redo restored the committed source, zero shader errors. Locked target blocked grab. Screenshots: `outputs/phase-2-5-{browser,palette}.png`. These are synthetic desktop poses, not physical controller verification or a guarantee against every possible one-frame artifact.

## Actual performance and reconstruction comparison

Reproduce with `node scripts/benchmark-move-precision.mjs`. Report: `outputs/phase-2-5-precision-benchmark.json`. Twenty-four actual XRMoveTool cases: 94,608 /305,640 /1,088,784 vertices, all four modes with Precision off/on, radius .2, 240 held updates each, one persistent commit each. All committed once with preview held at release. Main-thread held update p99 across cases **0.0016–0.0711 ms**; maximum preparation **1.89 ms**. CPU observations exclude GPU/render submission, stereo, real controllers and headset frame timing. Worker thread startup is included in release. Single commit per configuration: no operation latency percentile claim.

Preview comparison samples up to 128 original mesh vertices inside the influence, deforms them with the preview field, then samples absolute committed trilinear SDF distance divided by voxel step. Maximum observed error across these fixtures **.36 voxel steps**, p95 at most **.254**; Precision cases at most **.109** maximum. This measures surface-sample agreement on these small sphere pulls/turns; it is not a Hausdorff bound, guarantees for folds/thin geometry, topology preservation or an estimate of all lost detail. Precision's smaller deformation naturally changes reconstruction costs/errors, so no speedup claim from normal-versus-Precision comparisons.

| Vertices | Mode | Precision | Held CPU p99 ms | Release ms | Backend | Surface error p95 / max voxels |
|---:|---|---|---:|---:|---|---:|
| 94,608 | non-elastic | Off | 0.0711 | 100.5 | worker | 0.178 / 0.295 |
| 94,608 | non-elastic | On | 0.0105 | 94.3 | worker | 0.044 / 0.068 |
| 94,608 | elastic | Off | 0.0110 | 141.0 | worker | 0.254 / 0.360 |
| 94,608 | elastic | On | 0.0058 | 99.5 | worker | 0.056 / 0.109 |
| 94,608 | rotate | Off | 0.0180 | 87.1 | worker | 0.055 / 0.128 |
| 94,608 | rotate | On | 0.0083 | 91.2 | worker | 0.007 / 0.023 |
| 94,608 | twist | Off | 0.0110 | 85.8 | worker | 0.019 / 0.045 |
| 94,608 | twist | On | 0.0053 | 83.4 | worker | 0.004 / 0.010 |
| 305,640 | non-elastic | Off | 0.0052 | 213.1 | worker | 0.113 / 0.170 |
| 305,640 | non-elastic | On | 0.0054 | 190.0 | worker | 0.021 / 0.030 |
| 305,640 | elastic | Off | 0.0022 | 371.8 | worker | 0.095 / 0.238 |
| 305,640 | elastic | On | 0.0023 | 206.3 | worker | 0.031 / 0.056 |
| 305,640 | rotate | Off | 0.0020 | 178.1 | worker | 0.054 / 0.084 |
| 305,640 | rotate | On | 0.0028 | 179.0 | worker | 0.013 / 0.019 |
| 305,640 | twist | Off | 0.0046 | 177.4 | worker | 0.030 / 0.041 |
| 305,640 | twist | On | 0.0018 | 181.1 | worker | 0.007 / 0.011 |
| 1,088,784 | non-elastic | Off | 0.0056 | 871.5 | cooperative | 0.038 / 0.068 |
| 1,088,784 | non-elastic | On | 0.0048 | 699.3 | cooperative | 0.014 / 0.020 |
| 1,088,784 | elastic | Off | 0.0041 | 2018.9 | cooperative | 0.023 / 0.155 |
| 1,088,784 | elastic | On | 0.0019 | 783.4 | cooperative | 0.021 / 0.046 |
| 1,088,784 | rotate | Off | 0.0016 | 643.8 | cooperative | 0.053 / 0.060 |
| 1,088,784 | rotate | On | 0.0074 | 604.5 | cooperative | 0.004 / 0.008 |
| 1,088,784 | twist | Off | 0.0017 | 631.3 | cooperative | 0.011 / 0.015 |
| 1,088,784 | twist | On | 0.0016 | 585.0 | cooperative | 0.002 / 0.004 |

## Remaining limitations

- No new physical Quest 3 acceptance, immersive frame statistics, stereo marker readability, real tracking-noise calibration, thermal measurements or trustworthy worker/GPU peak memory. Default thresholds/gain need real-controller feedback.
- Noise floors suppress deliberate motion below their thresholds. No temporal low-pass lag is introduced, but jitter above those thresholds remains. Free wrist-axis changes near singularities can still feel less predictable than a locked local axis.
- A clamp can cause a deliberate saturated response until the wrist reverses below it; extreme angular folds and thin/subvoxel features retain existing reconstruction limitations. Stored SDF is not an exact copy of preview triangles.
- Million-vertex memory fallback and synchronous allocations/history/chunks retain Phase 2.4 limits. No new global vertex cap. Non-uniform legacy native layer scales still need uniform scale before sculpting.
- Precision/options remain session state. Existing native schema, capacity/triangle guards and Undo growth-capacity retention are unchanged.

## Quest 3 physical acceptance checklist — pending user confirmation

Use a trusted HTTPS Quest Browser/WebXR session with Touch Plus controllers. Start on 64³ and small radius before larger volumes. In Move Options verify Precision defaults Off; use asymmetric geometry for wrist tests.

1. Grab and pull a small clay area; confirm the trigger-down pose does not jump, even with the ray/grip offset.
2. Make tiny adjustments; compare Precision Off/On with the same hand travel. Confirm quarter sensitivity helps without changing workspace grab/scale feel. Evaluate whether the .3 mm / .2° noise floors feel appropriate.
3. Compare Non-Elastic direct pull and Elastic soft pull, firmness, strength and edge softness. Confirm no drift while holding still or returning to the original pose.
4. Rotate a region from the fixed surface pivot with pure wrist movement. Then translate the hand without rotating; angular gestures should keep their pivot.
5. Twist an asymmetric feature; compare Wrist axis and local X/Y/Z locks. Slowly cross 180° and reverse; expect no axis/profile reversal. Confirm clamp behaviour and no chunk seams; do not infer unrestricted multi-turn support.
6. Test small/large influence radii and idle Tool-stick sizing. Check marker and three-circle boundary match the affected region, remain readable and do not obscure detail.
7. Lock the active layer: amber target and no deformation. Hide it or miss the surface: no false active highlight. Target a transformed layer and sweep chunk boundaries.
8. Release and watch final preview stay visible throughout worker/cooperative reconstruction; check a single final swap and ready-to-edit feedback. Compare silhouette/detail, then continue Clay/Smooth.
9. Undo/Redo once, save/reopen native and export separate/Boolean GLB; verify result, layer transforms and grown bounds. Tiny edits may be limited by voxel resolution.
10. During pending work cancel using Support grip, then retry; test tracking loss, session exit, tool/project changes and blocked layer/history actions. Expect source retained and no late/double action.
11. Move/rotate/scale workspace with Support/both grips and repeat precision tests on translated/rotated/uniformly scaled native layers. Confirm no accidental held-trigger regrab after menus/navigation.
12. Hold Support trigger for temporary Smooth before and after Move, including a queued request during a Move; release returns to Move/Precision settings. Verify Tool Wheel/Layers and Undo/Redo stick directions still feel natural in both handedness configurations.
13. Repeat on >300k and ~1.09m vertices, radius .2 then .4; record backend, first-grab preparation, held/pending/publish immersive frame p50/p95/p99, release latency, errors and available memory counters with scope. Record at least 100 frames per phase and repeated operations; no desktop-to-Quest inference.

## Files changed in Phase 2.5

- New `src/move-gesture.ts`; updates `src/xr-move-tool.ts`, `src/editor-tool-state.ts`, `src/xr-alternate-tool.ts`.
- `scripts/compile-core.mjs` adds the new module to the existing cached build list; `package.json` extends the worker-focused command.
- New `tests/move-precision.test.mjs`, `tests/move-precision-input.test.mjs`, `scripts/fixtures/move-precision-fixture.mjs`, `scripts/benchmark-move-precision.mjs`, `scripts/move-precision-browser.html`.
- `README.md`, `docs/DEVELOPMENT_STATUS.md`, this handover and outputs above. Incoming Phase 2.4/test-runner files retained, not reset or mixed into a new commit.

## Phase 3.0 recommendation

First obtain Quest acceptance and tune the noise floors/gain/target visibility from actual controller feedback. Then focus Phase 3.0 on sculpt fidelity and predictable reconstruction: thin-feature/fold diagnostics and better preview-to-SDF agreement, alongside reduced worker snapshot memory and resumable/off-thread chunk/history preparation. Keep topology refinement and fidelity controls scoped by measured hardware budgets before adding further deformation modes or unrestricted turns.
