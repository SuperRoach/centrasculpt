# Phase 2.3 — Rotational and Twisting Move

Implemented 2026-10-26; software validation only. Physical Quest 3 acceptance pending. Incoming Git workspace was clean. Baseline 614 tests passed before edits; Phase 2.2's existing persistent Non-Elastic and Kelvinlet tests were retained. No commit, push or merge.

## Interaction and compatibility

Move Tool Options adds **Move gesture: Translate / Local rotate / Progressive twist**. Translate remains default and retains existing full hand travel and Elastic stiffness behavior. Angular gestures use **Non-Elastic rotation**, explicitly identified in Options, even if Elastic translation was selected. The selected translation mode is retained for return to Translate. Preview only still restores on release. Translation strength and Elastic stiffness are disabled for angular gestures. Angular strength (.1–2), angle limit (15–180°, default 120°), existing radius/falloff, and optional layer-local X/Y/Z axis lock control the field. These are local sculpt deformations; Transform Layer remains the rigid whole-layer operation.

Trigger-down captures the surface hit as a fixed layer-local pivot, controller orientation, source identity/revision and frozen layer/world transform. Held and final release poses evaluate from this original pose, never accumulating incremental mesh edits. Grip pose rotation is inverse-converted into the captured layer frame, normalized, and compared to captured orientation. Free axis uses shortest quaternion axis/angle; axis lock uses swing/twist projection (degenerate perpendicular half turn produces zero locked twist). Angular strength is applied before the clamp. Hand translation is ignored for angular gestures. Free axis follows the captured-pose delta axis; use an explicit axis for predictable directional twist.

Rotation uses Rodrigues with angle `angle * (1-|p-pivot|²/radius²)^(falloff+1)` inside the sphere. Twist additionally multiplies by `(1 + dot(p-pivot,axis)/radius)/2`, giving signed-axis progression from the negative to positive side. Radius defines both spherical support and axial span. There is no separate axis-length control. Both fields have identity position/Jacobian at the support boundary, preserve pivot and distance to pivot, and use analytic Jacobian cofactors for normals. Shared CPU/GLSL formulas evaluate duplicate chunk vertices identically. A conservative sphere encloses all rotated points; reconstruction keeps its existing three-cell growth margin.

## Pipeline and input

Original mesh attribute GPU preview, spatial affected-chunk selection, held uniform updates, candidate mesh-to-SDF reconstruction, expansion/resource guards, private staging, exact history and synchronous atomic publication are reused. Pure wrist gestures have a separate angular no-op check; field copies preserve rotation during asynchronous reconstruction. One completed gesture creates one voxel history transaction. Failure, cancellation and abort preserve source. No global vertex cap, dependency, schema or layer-transform change.

Existing arbitration remains authoritative: Support-trigger temporary Smooth, menu ownership, Tool/Support grips, tracking loss, session visibility/end, role/handedness changes, source/layer/world changes and tool switching retain cancel/rearm paths. Existing grab/release haptics are reused; held feedback identifies gesture and release behavior. Both handedness configurations retain baseline regression coverage. No new controller button mapping.

## Evidence

Full automated suite: **625 passed**, zero failures/skips. Build (TypeScript + Vite) and whitespace checks pass; existing bundle-size advisory remains. New coverage: known Rodrigues rotations, pivot invariance, radial boundary/normal continuity, twist progression on all three axes, analytic normals vs finite-difference tangents, aliases, repeated original-position evaluation, bounds and large angles. Controller tests cover free/locked wrist delta, clamp, transformed/scaled workspace, explicit Elastic compatibility, return-to-start and tracking cancellation. Rotate and Twist integration run on 64³ and 192³ / 1,088,784 vertices: unchanged original buffers/native bytes during preview, duplicate-vertex normal continuity, zero-translation persistent commit, preview-to-SDF agreement within two voxel steps, exact Undo/Redo/native reload, repeated deformation and aborted reconstruction. Existing suites cover expansion, atomic publication failure, transformed persistence, alternate Smooth, menus, grips, XR lifecycle, handedness, Clay/Stamp/history/GLB regressions.

Browser harness `scripts/rotation-kernel-browser.html`: actual desktop WebGL2 transform feedback, **54 × 300 points** covering both gestures, three radii, three falloffs and -π/.8/+π. Maximum position error **2.4394e-7**, normal error **3.9270e-7**; PASS, 70.6 ms harness wall time. This is shader agreement, not frame timing or a full interactive UI benchmark.

Actual Node preview/reconstruction benchmarks: `node scripts/benchmark-rotational-move.mjs` and `--twist`. Raw reports in `outputs/phase-2-3-{rotation,twist}-benchmark.json`. Four actual SDF mesh sizes (94,608 / 305,640 / 603,072 / 1,088,784 vertices), radii .2/.4, .8-radian Y gesture. All 16 commits passed default guards with exact lattice Undo verification. Preview preparation uses default 12 ms soft guard, and 180 held uniform updates are measured per case. No GPU draw, physical headset, operation percentile, process peak or thermal claim. See reports for per-case timing, slice and accounting estimates.


Measured on this Mac: million-vertex rotation release **0.62 s / 3.84 s**, twist **0.67 s / 4.20 s** (radii .2/.4). Million-vertex accounting estimates **154–157 MiB**. Across all cases preview preparation max **4.38 ms**, 180-update observed CPU maximum **0.010 ms**, reconstruction observed slice maximum **9.20 ms** despite the 3 ms cooperative target. Single observations; no XR timing claim.

## Limits and Quest 3 manual checklist

Shortest captured-pose rotation is deliberately bounded to a half turn. Crossing 180° can change the chosen direction; multiple-turn unwrapping is unsupported. Release/regrab for additional rotation. This is a compact finite rotation field, not rotational Kelvinlets or volume-preserving elasticity. Free-axis changing wrist gestures can change the twist axis; lock X/Y/Z when needed. High-angle small-radius edits can fold triangles, lose sub-voxel detail or reject safely in reconstruction. Dense reconstruction remains release-time work with potentially multi-second waits and synchronous slice overruns. Existing memory estimates are not measured total memory peaks. New angular controls and haptics have not been physically validated.

1. On a small 64³ asymmetric sculpt, compare default Translate in Non-Elastic and Elastic with Phase 2.2 behavior, including full travel and stiffness.
2. Select Local rotate; rotate wrist without translation, then translate without rotation. Confirm stable target pivot, local influence and explicit Non-Elastic label. Confirm layer transform values remain unchanged.
3. Twist an elongated asymmetric feature. Test free axis and each layer-local axis, positive/negative directions, strengths, clamp and radius/falloff; inspect support boundary and chunk seams.
4. Return wrist to trigger-down orientation before release; expect unchanged result. Test near limit and approaching half turn; regrab for further turns.
5. Release: preview stays visible while reconstructing, then editable SDF persists; one Undo and Redo restore exact results. Save/reopen/export; repeat deformation then Clay/Smooth.
6. Test translated/rotated layers and small/large uniform layer/workspace scales; ensure layer-local axis labels match actual behavior.
7. Test Support-trigger alternate Smooth, Tool/Support grips, menus, tool changes and source changes. During reconstruction cancel with Support grip. Check no hidden action or leaked held trigger.
8. Lose tracking, remove headset, end/reenter XR, switch dominant hand and reverse controller connection order. Confirm cancellation/rearm and grab/release feedback/haptics.
9. Repeat on >300k, >600k and million-vertex layers, small then large radius. Record first-use hitch, immersive stereo held-frame tails, release wait, peak memory and thermal behavior. Begin with small radius; desktop timings do not establish headset performance.

## Phase 2.4 recommendation

First complete angular Quest acceptance and profile reconstruction latency, memory and first-use shader cost. Then stage CPU mesh indexing/reconstruction in a worker or smaller resumable units while preserving authoritative source guards and atomic publication. Adaptive topology refinement / fold detection should precede unrestricted multi-turn twist or additional deformation modes.
