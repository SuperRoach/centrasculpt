# Phase 2.0 — Move preview foundation

**Current successor:** [Phase 2.1 persistent Non-Elastic Move](VR_PERSISTENT_MOVE.md) now commits by default; the preview-only behavior below remains available as an explicit mode. Earlier hardware acceptance/timings below concern preview, not the new commit path.

The original 300,000-candidate guard and short geometric pull cap below were superseded by the [large-layer spatial-query prerequisite](VR_MOVE_LARGE_LAYERS.md); its current 553-test full-travel validation and newer measurements take precedence.

Implemented 2026-10-26. Software validation complete; physical Quest 3 acceptance pending. **Move is experimental and preview-only. Release restores the original surface. No SDF edit, volume growth or undo action is created.** Non-Elastic (2.1) and Elastic (2.2) remain disabled planned modes.

## Controls and ownership

Choose Move from the Tool Wheel in Separate Layers. Point at visible, unlocked geometry on the active layer; empty space and other layers cannot become targets. A blue target marker and influence sphere show the captured region. Hold Tool trigger and translate the controller to pull it; release restores. Tool stick up/down changes the independent Move influence radius while idle. Radius, falloff, strength, source and transforms are frozen during a grab; release before resizing. Tool Options shows the experimental mode and planned modes explicitly.

Support stick keeps all four shortcuts (undo/redo, Wheel/Layers); Support grip grabs the workspace, both grips scale/rotate. Menus, grabs, tracking loss, controller replacement, role changes, target changes and XR exit cancel the preview and require a fresh trigger press. Tool selection cancels safely. Temporary alternate Clay/Smooth remains available in its existing appropriate brush modes; Support trigger does not override Move. Clay/Steady/Line, Stamp, realistic controller models and the neutral background use their existing paths.

`EditorToolState` and `IndependentLayers` hold owned preview locks. Layer commands, history mutation, strokes, stamps and transforms cannot concurrently edit a grabbed source. Read-only exports still use authoritative geometry; a native save/export during preview cannot serialize the GPU pull. Tool options/sizing cannot change the captured field mid-grab. Workspace transformations cancel through existing controller arbitration; additional identity/revision/native-transform/world-matrix checks defend the captured source.

## Rendering and reusable interfaces

`XRMoveTool` raycasts the existing active surface without SDF sampling. On fresh trigger press it captures the controller pose, target, layer/runtime/volume identity, surface revision, native transform and world matrix. Translation is transformed into the frozen layer-local frame. Radius uses the existing layer-scale convention; current rectangular spatial extents are never treated as an original fixed cube.

`RadialMoveField` implements `DeformationField.position`, `.normal` and `.affectedBounds`. The temporary weight is `(1 - distanceSquared / radiusSquared)^(falloff + 1)` inside the sphere and zero outside. It is C1 at the boundary. Strength scales translation. A conservative displacement cap `radius * 0.4 / sqrt((falloff + 1)/2)` prevents this prototype's field from folding or approaching singular normals; HUD says “pull capped”. This is a temporary radial translation field, not the final Non-Elastic or Kelvinlet algorithm.

`MoveMeshPreview` clones only affected MeshStandardMaterials, adds shared shader uniforms, and evaluates from original vertex positions every frame. Identical positions on neighbouring chunks evaluate identically, avoiding accumulated drift and seam separation. Analytic inverse-transpose Jacobian normals keep lighting coherent. Source position/normal arrays, geometry versions, SDF and mesh topology remain untouched. Original material references and frustum-culling flags restore exactly on release/cancel. Culling is disabled on affected meshes during the GPU pull. Materials are cached across ordinary grabs and disposed on cancellation/tool/session exit; reusable influence/marker geometry lives with the interaction and is disposed by its disposal method.

Preparation scans intersecting chunk vertices once, rejecting a grab above 300,000 candidate vertices before binding temporary materials. No per-frame vertex uploads, remeshing or voxel writes occur. Held updates reuse vectors/matrices/uniforms. Hover uses existing triangle raycasting and therefore still costs CPU on large surfaces. Preview helpers sit outside project/export roots. The shader integration uses Three's [Material.onBeforeCompile](https://threejs.org/docs/pages/Material.html); the current sculpt MeshStandardMaterial path is the supported preview material.

`deformation-contract.ts` defines future immutable intent, owned reconstructed patch buffers, progress stages and an abortable async preparer. It is a type boundary only; no reconstruction is invoked. See [Phase 2.1 plan](PHASE_2_1_NON_ELASTIC_MOVE.md).

## Verification

- `tsc --noEmit`: passed.
- `npm run build`: passed; existing Vite >500 kB bundle advisory remains (945.60 kB JavaScript before gzip).
- `npm test`: **546 passed, 0 failed**, including 40 new Move tests. Covers selection/options, math/normals, transformed workspace/layers, invalid/hidden/locked targets, exact attribute/native/export/history restoration, independent layers, expanded coordinates without allocation, budget rejection, material cleanup/reuse and both-handed controller bridge interruptions. Existing brush/stamp/history/save/export regressions pass.
- Actual browser WebGL rendering via `scripts/move-preview-browser.html`: grabbed, pulled and released the real interaction; shader compilation succeeded. Visible checks confirm unchanged SDF/native bytes, history and allocation. [Preview screenshot](../outputs/phase-2-0-browser-preview.png), [restored screenshot](../outputs/phase-2-0-browser-restored.png); companion `.txt` files record visible page checks. This developer harness is not linked into production UI and uses synthetic controller poses, not a headset.

## CPU measurements

Run `node scripts/benchmark-move-preview.mjs`. [Raw measurements](../outputs/phase-2-0-move-benchmark.json) include host/runtime, counts and all timing summaries. Node v26.8.1 on macOS arm64; uncontrolled host load. Initial-resolution sphere fixtures use the same mesh pipeline; higher resolutions partition candidates differently, so hover time is not monotonically proportional to resolution.

Five preparations per configuration (median/max only). Full XRMoveTool hover/held paths: 30 warmup + 180 measured samples; include raycasts, transforms, checks and indicator updates. Separate 5,000 uniform-only samples are retained in JSON but do not represent full frame cost. GPU shader compilation/drawing, real XR polling, menu canvas and headset frame intervals are excluded.

| Initial resolution | Radius | Affected / candidate vertices | Chunks | Preparation median / max ms | Hover p95 ms | Held p95 ms |
|---|---|---|---|---|---|---|
| 64 | 0.12 | 385 / 42,588 | 4 | 0.605 / 3.174 | 0.976 | 0.0059 |
| 64 | 0.3 | 2,839 / 42,588 | 8 | 0.301 / 0.322 | 0.765 | 0.0016 |
| 64 | 0.5 | 8,034 / 42,588 | 8 | 0.220 / 0.268 | 0.822 | 0.0019 |
| 128 | 0.12 | 2,074 / 30,624 | 4 | 0.219 / 0.707 | 0.776 | 0.0015 |
| 128 | 0.3 | 11,462 / 30,624 | 8 | 0.161 / 0.199 | 0.668 | 0.0017 |
| 128 | 0.5 | 33,140 / 90,528 | 16 | 0.475 / 0.888 | 0.556 | 0.0015 |
| 192 | 0.12 | 4,268 / 28,200 | 4 | 0.126 / 0.164 | 0.398 | 0.0015 |
| 192 | 0.3 | 25,823 / 94,140 | 16 | 0.431 / 0.624 | 0.412 | 0.0011 |
| 192 | 0.5 | 75,282 / 135,756 | 20 | 0.401 / 0.475 | 0.362 | 0.0010 |

At radius 0.5 the measured full-adapter grab cost was 0.990 / 0.757 / 0.807 ms at initial resolutions 64 / 128 / 192. Largest preparation maximum across all configurations was 3.174 ms. First actual GPU program compilation and Quest GPU/frame tails require hardware measurement; these CPU numbers do not establish XR framerate. Optional performance diagnostics now report Move CPU time/p95 and affected vertices alongside existing frame timing.

## Limitations and known issues

- No permanent deformation or preview undo. Release/cancel always restores authoritative shape.
- Translation only, capped pull, Separate Layers only, active editable layer only. Independent layer transforms use the existing uniform-scale model.
- A spherical region can influence nearby disconnected/back-side geometry in that same layer. Triangle density limits visible detail; no tessellation is added.
- More than 300,000 candidate vertices rejects the grab; reduce radius. Dense hovering and first shader compilation can spike; headset measurements pending. No BVH or new storage architecture was added.
- Preview materials support the current sculpt lighting path; generalized custom shaders, shadow deformation and textured tangent-space pipelines are outside this phase.
- Phase 1.15 expandable Clay was physically confirmed by the user before this phase. This does not validate Move on hardware. Unlimited/sparse storage remains future work; dense expansion is retained unchanged.

## Physical Quest 3 checklist — all pending

1. Enter VR in Quest Browser with Touch Plus controllers; check controller models/background and HUD.
2. Open Tool Wheel and select Move; verify “experimental preview only” and planned modes disabled.
3. Point at active clay, empty space, another layer, hidden and locked layers; only editable active geometry shows a valid target.
4. Hold Tool trigger; verify stable target/region and subtle grab feedback.
5. Pull outward and sideways: local region follows, surrounding mesh stays fixed, seams/lighting remain coherent; check capped-pull message.
6. Release: exact original shape returns; HUD says restored; undo count remains unchanged.
7. Resize with Tool stick while idle, test small/large areas; during grab settings stay captured. Release, resize, then grab again.
8. Repeat after workspace rotation/translation/scale and after independent layer transforms; test already-expanded Clay outside original bounds.
9. Support grip during a pull cancels; workspace grab and dual-grip scale/rotation work without deformation. Releasing requires a fresh trigger press.
10. Exercise all four Support stick shortcuts and menus during/after a preview; no accidental tool edit or undo action.
11. Switch to Clay/Smooth/Steady/Line/Stamp; verify existing strokes, stamps and alternate Smooth plus its Support-stick radius sizing.
12. Test both handedness mappings; tracking loss, disconnect/reconnect and visibility interruptions cancel cleanly without sticky ownership.
13. Exit/re-enter WebXR mid-pull; original geometry/materials return, no stale lock or grab; verify save/reload and mesh export remain authoritative and layers independent.
14. At initial resolutions 64/128/192, expanded and dense scenes, record optional diagnostics for hover/grab/hold/release with small/large radii, first/warm grabs, frame p95/p99 and memory. Check one clear budget refusal and recovery. Report actual Quest timings before accepting hardware performance.
