# Phase 2.2 — Elastic Move

2026-10-26. Software implemented and validated; user reported successful physical Quest 3 testing (“works well tested”) after USB ADB forwarding and the development server were restored. This confirms overall workflow testing, without separately reported edge-case coverage, XR timings, memory peaks or thermal results. Incoming Phase 2.1 source was already dirty. No commit, push or merge. Source checkpoint: `work/checkpoints/before-2-2-elastic.tar.gz`, SHA-256 `f692a2f6a2ce56336627ce66d07f5230d48a4d356e63e429829d442329906b39`. Reviewed HEAD `db59667` and the recent history; preserved all incoming changes.

## Phase 2.1 retrospective and gate

Read the entire DEVELOPMENT_STATUS handover and inspected Move field/preview, XR targeting/ownership, reconstruction/index, candidate publication/history, growth and regression coverage. Baseline `npm test`: **580 passed**, zero failed/skipped; baseline `npm run build`: PASS (includes strict TypeScript). Logs: `outputs/phase-2-2-baseline-{tests,build}.log`.

No significant blocking software defect was reproduced in Phase 2.1. Existing tests cover nearest active-source surface targeting, empty/hidden/locked sources, frozen workspace/layer inverse transforms, final release pose, authoritative reconstructed SDF, Clay/Smooth continuation, exactly one action and exact undo/redo, positive/negative growth, source/geometry preservation on abort/allocation/history/meshing failure, interruption/rearming and native/GLB output. Existing large invariants and persistence benchmarks cover 305,640 / 603,072 / 1,088,784 vertices without a global preview cap. Analytic cofactor normals and duplicate boundary vertices share the field; source normals/remesh have existing halo coverage.

Async work stages private buffers and checks AbortSignal/source/session identity before timer yields and publication. Small jobs/no-op paths can finish without a timer yield; there is no alternate synchronous deformation algorithm. Individual typed-array allocation, triangle queries, chunk extraction and staging/publication remain synchronous. Tests exercise no-op/redo preservation, each progress-stage abort, late workspace mutation without another XR frame, and prepublication faults. This is cooperative main-thread work, not a worker or a hard frame deadline.

Remaining acceptance blockers: physical persistent-operation release latency, first-use shader cost, XR frame tails, peak memory, thermal behavior and fidelity under extreme folds. Prior user acceptance of Non-Elastic preview/full hand travel remains historical evidence, not acceptance of new persistent/Elastic commits. The current request authorizes proceeding beyond the previous stop-for-testing handover.

## Implementation and kernel

Move Options now selects **Non-Elastic / Elastic / Preview only**. Non-Elastic remains the default. Elastic uses the regularized grab tensor from [de Goes and James, Regularized Kelvinlets (2017)](https://graphics.stanford.edu/~djames/publication/kelvinlets/), with fixed Poisson ratio 0.5, center calibration and an explicit compact window. It is a localized adaptation of the infinite-support linear-elastic kernel, not an exact bounded-body elasticity solve.

For local offset `r=x-center`, radius `R`, `epsilon=R/3`, `s=sqrt(dot(r,r)+epsilon²)`:

```
A = epsilon * (0.5/s + 0.5*epsilon²/s³)
B = 0.5*epsilon/s³
w = max(0, 1-dot(r,r)/R²)^(falloff+1)
u(x) = w/stiffness * (A*d + B*r*dot(r,d))
x' = x + u(x), d = strength * local_controller_translation
```

At the center `A=1`, `B*r*dot(r,d)=0`, so `u(0)=d/stiffness`; no singular division by radius-to-center distance. Radius is the exact support boundary and controls regularization width. Strength (.01–1) scales hand displacement; stiffness (.25–4, default 1) scales inverse compliance relative to that calibration. Falloff (1–4) controls the smooth window. Stiffness is a dimensionless artistic control, not a measured material modulus. Settings are frozen on grab and remain session preferences; committed SDF samples persist normally. Invalid mode/stiffness rejects before publishing a preview.

CPU and GLSL implement the same tensor and analytic derivatives. Oriented normals use Jacobian cofactors, with finite source-normal fallback for collapsed tangent planes. At/outside support the displacement and its first derivatives vanish. Held updates only change the captured displacement uniform; they always evaluate original vertex attributes and do not accumulate edits or upload mesh arrays. Chunk sphere/BVH selection and the existing soft 12 ms preparation guard remain; there is no new vertex-count gate. Initial material cloning/compilation can still stall.

Full actual surface-world inverse converts controller translation into the frozen layer frame. The target marker now follows the evaluated center, including inverse stiffness. Separate-layer isolation, uniform layer scale convention, Tool/Support handedness, menus/grip arbitration, temporary Smooth, free Clay, Steady/Line, Smooth, Stamp, history/save/export routing all retain their existing paths.

Elastic delegates to the existing persistent command. It copies mode/stiffness before its first await, stages mesh-to-SDF reconstruction, planned volume growth, exact history/lattice remaps, dirty meshes, spatial index, timeline and Boolean invalidation, then synchronously publishes one action. Guard/abort failures retain source and redo. Preview stays visible until publication. Cancel/tracking/menu/tool/grip/session interruptions clear material overrides and require release/repress.

The normalized tensor's radial eigenvalue is `epsilon/s <= 1`, and tangential eigenvalue is no larger. Thus `|u| <= |d|/stiffness`. Elastic bounds use the original support sphere AABB expanded in **every axis** by that amount. This includes transverse displacement even when a controller delta component is zero. Same-spacing dense growth preserves old samples and existing budgets. Conservative bounds can grow empty capacity earlier than Non-Elastic; Undo intentionally retains this capacity.

## Validation and measured evidence

- Final `npx tsc --noEmit`, `npm run build`, `git diff --check`: PASS. Existing >500 kB bundle advisory remains; build JS about 970 kB / 264 kB gzip. No new dependencies.
- Final `npm test`: **614 passed, zero failed/cancelled/skipped**, about 11.4 seconds on the final run. Logs `outputs/phase-2-2-{typescript,build,tests}.log`. +34 tests: 27 persistence cases now run for both modes, five kernel tests, two dedicated preview/commit integration cases.
- Numerical tests: center calibration, finite support, independent tensor formula, transverse response, stiffness/strength, rotation equivariance, conservative long-pull bounds, analytic normals versus finite-difference tangents including inversions, parameter validation, alias-safe and noncumulative evaluation.
- Both-mode integration: transformed layers/workspaces, release pose, repeated edits, exact history, Clay/Smooth continuation, cancellation at all stages, stale source/session/world, fault injection, positive/negative growth, native reload and separate/Boolean binary GLBs. Repeated-growth history asserts every lattice sample including retained exterior capacity; whole native bytes are intentionally different after retained growth. An initial test assumed byte-identical allocation on Undo, causing an enormous byte-array failure diff; corrected to the actual documented lattice contract. No source-history defect was found.
- Dedicated 64³ / 192³ (1,088,784 vertices) integration: localized candidate count, unchanged source attributes/versions throughout 100 alternating held updates, duplicate boundary normal agreement, deformed preview-vertex to committed SDF distance < two voxel spacings for the tested small pull, exact undo/redo samples/native reload. This does not promise sub-voxel fidelity for all pulls.
- Actual desktop WebGL2 transform feedback using the exported preview shader: 27 radius/stiffness/falloff cases × 300 points; max CPU/GPU position error **2.7084e-7**, normal error **1.9792e-6**. `scripts/elastic-kernel-browser.html`, `outputs/phase-2-2-gpu-agreement.txt`. GPU readback test wall time is harness overhead, not a frame/FPS benchmark.
- Actual desktop Three/WebGL XRMoveTool harness: Elastic grab/pull kept source exact, release held preview during reconstruction, committed 3,454 voxels in one action, native roundtrip passed, Undo restored original native bytes, Redo restored committed source, zero shader errors. Wall **376.9 ms**, reported max cooperative slice **7.2 ms** for this 64³/radius .22 synthetic-controller operation. `scripts/persistent-move-browser.html?mode=elastic`; `outputs/phase-2-2-browser-committed.{txt,png}`. No physical controller/headset inference.

Reproduce release benchmark: `node scripts/benchmark-persistent-move.mjs --elastic`. Raw JSON/log: `outputs/phase-2-2-elastic-benchmark.{json,log}`. One operation/configuration with default memory/work guards, Node on this Mac; uncontrolled host load (some checks overlapped), no operation percentile or controlled before/after speed claim. All eight committed and exact mapped Undo checks passed.

| Vertices | Radius | Wall ms | Max slice ms | Estimated peak MiB |
| ---: | ---: | ---: | ---: | ---: |
| 94,608 | .2 | 244.4 | 10.8 | 8.8 |
| 94,608 | .4 | 677.6 | 5.5 | 10.3 |
| 305,640 | .2 | 929.0 | 6.5 | 37.1 |
| 305,640 | .4 | 3476.4 | 6.1 | 42.7 |
| 603,072 | .2 | 2490.5 | 6.7 | 90.9 |
| 603,072 | .4 | 10418.4 | 12.4 | 99.7 |
| 1,088,784 | .2 | 4666.4 | 7.1 | 156.4 |
| 1,088,784 | .4 | 19725.4 | 9.2 | 177.6 |

Peak values are internal accounting estimates, not observed total process/GPU peaks. JSON contains process memory snapshots (not transient peaks). The shared pipeline still copies dense storage and indexes the entire source mesh; the larger conservative Elastic sampling AABB costs materially more work. Earlier Non-Elastic million-vertex observations were about 1.0/6.6 seconds, but runs were not controlled comparisons. Three-ms target slices are not hard deadlines.

## Changed files relative to the incoming Phase 2.1 checkpoint

| File | Change |
| --- | --- |
| `src/move-field.ts` | Selectable compact Kelvinlet, validated mode/stiffness, analytic normal derivatives, safe bounds |
| `src/move-mesh-preview.ts` | Shared GLSL tensor/derivatives and mode/stiffness uniforms; original-attribute preview retained |
| `src/independent-layers.ts` | Freeze/copy field mode and stiffness into persistent candidate job |
| `src/editor-tool-state.ts` | Elastic choice and stiffness option; Non-Elastic default retained |
| `src/xr-experience.ts` | Updated desktop diagnostic help for Elastic and stiffness |
| `src/xr-move-tool.ts` | Frozen Elastic configuration, persistent release, mode feedback, evaluated target marker |
| `tests/persistent-move.test.mjs` | Parameterize all persistence contracts by mode; exact lattice replay across retained growth |
| `tests/move-preview.test.mjs` | Enabled-mode/options and updated shared shader call expectations |
| `tests/elastic-kernel.test.mjs` (new) | Five numerical kernel tests |
| `tests/elastic-integration.test.mjs` (new) | Small/million-vertex preview/commit/history integration |
| `scripts/benchmark-persistent-move.mjs` | `--elastic` mode with separate output report |
| `scripts/persistent-move-browser.html` | `?mode=elastic` rendered release/Undo/reload harness |
| `scripts/elastic-kernel-browser.html` (new) | Actual GPU transform-feedback formula/normal validation |
| `docs/DEVELOPMENT_STATUS.md`, this guide (new) | Distinct retrospective, implementation, evidence, limits and hardware checklist |

Existing dirty Phase 2.0/2.1 files and evidence remain. No changes to SDF schema, dependencies, primary controls, brush kernels or export implementation in this phase.

## Limits and physical Quest 3 checklist (detailed coverage pending)

Linear Kelvinlets with a compact window are not volume preserving, topology preserving, collision aware or a full nonlinear elasticity simulation. Long pulls can fold/stretch triangles and lose detail on reconstruction; repeated coarse-grid edits can soften detail. Degenerate/ambiguous signs may safely reject. Dense memory/axis/project triangle budgets, soft preparation guard, uniform-transform support and retained capacity remain. No worker, adaptive refinement, sparse/unlimited storage or measured physical performance acceptance is claimed.

1. Start with an empty/test 64³ sphere, small radius, Non-Elastic baseline; select Elastic via Move Options. Confirm both hands/role swap and default Non-Elastic remain usable.
2. Compare radius .12/.3/.5, strength .25/1, stiffness .25/1/4: increasing stiffness reduces center travel; nearby side motion should be elastic, boundary stationary. Check marker, preview normals and chunk seams under Matte/Glossy.
3. Release moderate and long pulls; final pose must match release. Observe held progress and single history entry. Record runtime/OS, wall time, max slices and visible hitches; inspect thin/folded detail.
4. Repeat three deformations, Clay Add/Subtract/Smooth on the result; Undo/Redo each action. Test positive/negative boundary growth and retained empty capacity after Undo.
5. Repeat on translated/rotated/scaled layer and zoomed/rotated workspace; other/hidden/locked layers must be untouched. Test disconnected components inside/outside influence.
6. Cancel while held and at each progress stage using Support grip, menu, tool change, tracking loss, controller disconnect, system blur and XR exit. Source/redo must stay exact; release/repress must rearm; re-enter session without stale materials/locks.
7. Verify Tool Wheel/Layers Palette, menu trigger/grip exclusion, four Support shortcuts, temporary Support-trigger Smooth with radius changes, free-space Clay, Steady, Straight Line, Smooth, Stamp and workspace/both-grip navigation.
8. Save/reload after XR exit, continue edits, export separate and Boolean GLBs; compare transformed placement and grown regions. History is intentionally session-only.
9. Scale up through 305k/603k/1.09m fixtures. Measure first-use/steady held XR frame tails, release delay, available heap versus real peak memory, repeated cancellation and thermal behavior. Stop increasing complexity if resource rejection or discomfort appears; rejection must preserve the source.

## Phase 2.3 recommendation

Prioritize measured reconstruction latency and physical acceptance before adding further deformation primitives: tighten proven conservative bounds, profile full-source indexing and cooperative chunk extraction, then evaluate worker staging with the same source guards, one-action publication and exact history. Collect Quest peak-memory/frame traces before selecting budgets or sparse storage. Twist/scale/pinch could reuse the field boundary later; they are not implemented or scheduled by this change.
