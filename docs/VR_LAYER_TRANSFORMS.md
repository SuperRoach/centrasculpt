# Phase 1.13b — independent VR layer manipulation

Current follow-up: [Phase 1.13h](VR_LAYER_SELECTION.md) adds direct pointing/selection, active/hover bounds, Layers metadata and confirmed transform reset. The grip transaction described below remains the foundation.

Current implementation: [Phase 1.13d menus](VR_MENUS.md) requires selecting **Transform Layer** in the Tool Wheel before Tool grip manipulates a layer. The solver and workspace precedence described below remain unchanged.

Authoritative repository: `/Users/brettjames/development/vrappPOC`.

Select a visible unlocked layer in Separate Layers before entering VR. Tool Hand grip moves and wrist-rotates that layer. Support Hand grip moves/rotates the workspace. Both grips take precedence for the existing two-hand workspace rotate/scale/zoom. No mode switch is required. Layer scaling is deferred; sticks do not scale layers.

On workspace takeover the completed layer segment commits once. Releasing Tool continues Support workspace navigation with the existing reanchor. Releasing Support while Tool remains held anchors a new layer segment at the current controller/layer pose. Joining/leaving captures current poses, preventing old controller deltas from snapping the target. Each completed layer segment is one undo action; stationary segments add none. Workspace navigation never changes project metadata/history.

Controller world poses inverse-convert through the actual layer-group world matrix (including workspace/sculpture ancestors), then apply an anchored rigid delta to the initial layer local matrix. Quaternion composition preserves wrist rotation and initial layer orientation. Source SDF arrays and mesh geometry are untouched. Existing native persistence, transform undo/redo and separate/Boolean exports consume the resulting metadata.

Hidden/locked/missing active targets, nonuniform legacy layers and Boolean view reject layer grabs. Tracking/identity loss, role change, reset, blur and session end cancel unfinished transactions. Release grips to rearm after input interruptions. Boolean preview remains a desktop operation: XR does not schedule live composite recomputation; desktop restoration synchronizes metadata. Realistic controllers, handedness, neutral gray, diagnostics and reset remain supported. No controller sculpting or VR menus were added.

## Hardware evidence

User verified on Quest 3 that Phase 1.13a two-grip workspace zoom/scaling and rotation work very well. This is user-reported physical verification of the existing navigation. On 2026-10-25 the user additionally confirmed Phase 1.13b: “verified working”. Individual checklist items and performance measurements were not separately reported.

## Physical Quest 3 checklist

Record Quest OS/browser/runtime, profiles, dominant hand and scene resolution/mesh counts.

- With both handedness settings and reversed connection order, Tool-only moves/rotates only the selected layer; Support-only navigates the workspace.
- Begin from each hand and press the other: both grips immediately own workspace rotation/scale/zoom without a join jump. Test close/crossed hands.
- Release Tool first: Support continues workspace motion without a jump. Release Support first: Tool resumes layer motion without a jump. Repeat alternating transitions, then release both.
- Repeat under translated/rotated/scaled workspace with layers at different poses. No press/release snap, layer scale drift, source detail changes or unrelated-layer movement.
- Hidden/locked/no valid target and Boolean view reject Tool edits. Occlusion, disconnect/reconnect, blur, role swap, reset and exit cancel unfinished edits; release/repress recovers.
- Exit VR: undo/redo each completed layer segment, save/reopen and export separate GLB and Boolean result. Layer poses persist; workspace navigation is absent from project/history/export.
- Check realistic controllers, gray background, contextual hints, subtle grip feedback, diagnostics and reset. Recheck desktop transform/sculpt/stamp tools and preview.

Phase 1.13b hardware acceptance is user-reported; no agent-run physical or emulator validation is claimed. Selection, undo/save/export remain desktop controls.
