# Phase 1.13f — VR brush sizing and tool controls

Current placement follow-up: [VR Free Clay](VR_FREE_CLAY.md) changes Clay to controller-tip free-space placement by default, with optional Surface follow. Smooth remains surface-based; radius/ownership behavior below is retained.

Target: Quest 3 / Touch Plus / Quest Browser / WebXR. Implemented and automatically validated; **physical acceptance of 1.13f is pending**. Previous headset verification remains recorded under its original phases.

## Controls

With **Clay Add/Subtract or Smooth** selected, push the logical **Tool Hand stick Up** to grow the brush, **Down** to shrink it, and centre to stop. No stick click is required. Switching dominant handedness moves this control to the other physical controller; slot/connection order is irrelevant.

Radius uses the existing **0.12–0.50 project/world-unit limits**. Those limits now come from one shared constant used by desktop UI, native validation, palette and analogue control. Sizing updates the same application settings read by the palette and desktop controls; there is no VR radius copy. The desktop/palette readouts use three decimals so small adjustments are visible.

A temporary **Radius 0.xxx** card appears while adjusting and disappears about 900 ms after the last change. A faint wireframe sphere at the active source surface shows the actual 3D brush kernel volume. It is mint for Clay and blue for Smooth. It is a brush cursor, not a permanent panel, and hides while menus, grabs, invalid targets or other incompatible input own the interaction. Realistic controller models, neutral-gray background, diagnostics and the existing Support stick shortcuts are retained.

## Adjustment and ownership

The existing hardware parser supplies Quest thumbstick axes 2/3 and its .15 radial dead zone. Negative Y means Up. The separate logical sizing handler uses:

- Neutral radius .12 on the normalized stick, plus a small .08 vertical-axis dead zone. Mostly horizontal and diagonal gestures are ignored unless `abs(X) <= .75 * abs(Y)`.
- Remapped vertical magnitude `a = sign(Y) * (abs(Y) - .08) / .92`.
- `radius *= exp(-a * .9 * elapsedSeconds)`, clamped to the existing limits. At full deflection the radius changes by a factor of about 2.46 per second; small deflections retain fine relative control at small brush sizes.
- Elapsed time rather than frame count, with a 50 ms frame-delta cap to avoid jumps after a pause. Normal 30/60/90/120 Hz recordings agree numerically in tests.

| Input/state | Sizing behavior |
| --- | --- |
| Idle Clay/Smooth with valid Tool tracking | Tool stick adjusts shared radius |
| Stick centred | Immediate stop; no drift |
| Tool trigger or either trigger physically held | No sizing, even if the brush cannot hit a valid target |
| Active live/buffered stroke or replay | Radius frozen for the entire transaction |
| Either grip / workspace / layer / two-hand grab | No sizing |
| Tool Wheel / Layers / Options / diagnostic pointing | No sizing |
| Busy/modal/project edit | No sizing |
| Tracking loss, disconnect, reset, role/tool switch or XR exit | Clear temporary feedback and disarm |
| After an incompatible interaction | Centre the Tool stick to rearm; a held stick cannot change radius as the interaction ends |

The Support stick recogniser, thresholds, menu lifecycle and Left Undo / Right Redo / Up Tools / Down Layers mappings were not modified. Undo/Redo still uses the existing project timeline. The Tool capability registry declares `brush-radius` for Clay/Smooth and reserves `future-shape-scale` for Stamp; the latter performs no adjustment or stamping yet.

## Preview accuracy and stroke behavior

The brush preview is one reusable unit sphere with an absolute transform composed from:

`inverse(tracking parent world) * layer surface world * translate(local hit) * scale(local brush radius)`.

The local radius is the existing project radius divided by the layer's uniform scale, exactly as the sculpting engine uses it. Workspace/sculpture/parent transforms then map that kernel into XR/world coordinates. The preview therefore scales with workspace zoom and remains accurate under translated/rotated/scaled layers. Nonuniform presentation parents produce the same ellipsoid as the transformed local spherical kernel; legacy nonuniform layer scales remain ineligible for strokes through existing guards.

Idle hover reads the current shared radius in the same XR update as thumbstick sizing. During a stroke and Steady replay it uses the transaction's frozen local radius, so later external setting changes cannot falsely resize the active brush. Palette changes are read on the next idle update; palette snapshots use their existing 100 ms refresh while visible. Sizing writes only settings and does not rebuild SDF/chunk geometry or add history. The cursor stays outside project/export roots and cannot be picked as a sculpt target.

Inspection found this checkout's handover still deferred VR Smooth rather than containing the completed 1.13e baseline described in the request. This phase consequently extends the **existing** surface-ray/transaction adapter to invoke the existing Smooth engine. There is no new SDF smoothing algorithm, input parser or history system. Smooth uses the shared radius/strength, freezes radius per stroke and commits one ordinary stroke action. Clay Straight Line and Steady settings are retained unchanged; they apply only to Clay and are not reset by Smooth or resizing. Clay's zero-Steady live behavior and nonzero-Steady/Straight-Line release-to-apply policy are unchanged.

## Tests and performance

TypeScript/Vite build passed; **325 tests passed, 0 failed, 0 skipped** (311 baseline + 14 new). `git diff --check` passed. Logs: `outputs/phase-1-13f-build.log`, `outputs/phase-1-13f-tests.log`. Existing Vite bundle-size advisory remains (~891 kB / 240.5 kB gzip).

New tests cover Up/Down, neutral/noise/dead zones and analogue strength, time-step independence/long pauses, clamps and small-brush precision, two-way palette/native settings synchronization, retained operation/strength/hardness/Steady/Straight Line, no source edits/remesh/history for sizing, accurate transformed preview matrices and geometry reuse, same-frame preview updates, frozen Clay replay radius, Smooth engine equivalence and one-action undo/redo, both handedness settings with reversed slots, menu/grip/trigger exclusion, role switching/session cleanup, unchanged Support shortcuts and temporary feedback expiry.

`node scripts/benchmark-brush-sizing.mjs` produced `outputs/phase-1-13f-sizing-benchmark.json`: ten warm 20,000-update Node batches measured medians approximately **0.000041 ms idle**, **0.000125 ms adjusting**, **0.000214 ms preview matrix/material updates**. Geometry was reused, history remained zero and no remesh was pending. These exclude real DOM setters, raycasting, rendering/canvas/GPU and physical input, and are not headset latency/FPS measurements. Analogue writes avoid full desktop-panel refreshes; only the existing brush-setting controls update. One preview sphere/mesh/material is retained and reused; no sizing listeners or per-frame geometry allocations are added.

Live browser smoke checks on the user-started server confirmed startup, radius display changing 0.220 → 0.230, Smooth selection, emulator XR entry/render/exit and restored desktop controls, with no application console errors. The static emulator frame showed the new brush volume at the surface. Evidence: `outputs/phase-1-13f-browser-check.json`, `outputs/phase-1-13f-browser-stereo.jpg`. Live controller-driven sizing has not been exercised in the browser emulator or on a physical Quest in this session.

## Quest 3 acceptance checklist — pending

1. Enter VR with sticks centred. Select Clay. Aim at the selected surface and inspect the faint brush volume.
2. Push Tool stick Up/Down: radius grows/shrinks smoothly and the temporary number/brush volume follow immediately. Centre: sizing stops. Try slight deflections, full deflections and horizontal/diagonal noise.
3. Reach 0.120 and 0.500 without overshoot. Draw small/large Add and Subtract strokes; confirm brush coverage agrees with the preview and each gesture remains one Undo/Redo action.
4. Open Options: radius matches the last thumbstick value. Change radius in the palette, dismiss, centre and resize again; it must start from that new value.
5. Select Smooth. Resize and smooth a deliberately uneven area. Check strength, frozen per-stroke radius, and one Undo/Redo action.
6. Set Clay Steady to a nonzero value and Straight Line On/Off. Resize while idle; both settings retain their values. During drawing/replay hold the sizing stick: no radius change. Afterward it must remain stopped until centring/rearming.
7. Recheck Support Left/Right Undo/Redo and Up/Down menus. While a menu owns Tool trigger, holding the Tool sizing stick must do nothing. Dismiss with it held: no jump; centre to rearm.
8. Recheck Support grip, Tool grip in Transform and both-grip rotation/scale/zoom. No sizing during any grab. Compare preview coverage after workspace zoom and layer translation/rotation/uniform scale; do not interpret project radius as headset metres.
9. Swap handedness and reverse connection order. Only the newly assigned Tool stick should size. A stick held through the swap, tracking loss/reconnect or reset must need neutral before rearming.
10. Exit/re-enter repeatedly, including during a stroke. No stale helper/readout, duplicate resources, unfinished history or held-input action should remain. Verify desktop controls, native save/load and GLB exports afterward.

## Limits and Phase 1.13g recommendation

Radius is intentionally constant per stroke; variable-radius trajectories are not implemented. Sizing pauses rather than queueing changes during strokes and requires neutral after ownership changes. The rate is a code constant, not an exposed preference. A valid editable source in Separate Layers is needed for the surface preview/stroke. Existing live meshing and buffered Steady replay can still produce dense-scene stalls; sizing does not change those source scheduling limits.

For 1.13g, use the declared per-tool analogue binding for the next explicitly scoped tool control, retain one shared settings model and neutral rearming, and measure actual Quest frame costs before expanding variable-radius strokes, stamp scale/application or other continuous interactions. No locomotion, advanced tip repositioning or deformation was added here.
