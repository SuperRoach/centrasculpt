# Phase 6.4 — Surface Snapping and Alignment

Updated 2026-11-05. Physical Quest acceptance remains pending.

## Use

Open **Transform options** and turn **Surface snap** on. Freehand remains the default. In desktop Transform mode, moving the pointer previews a target before dragging; in VR the tracked Tool ray previews while idle and updates at up to 20 Hz. During a transform, the Tool ray / pointer ray updates the candidate continuously. A mint arrow marks the candidate point and normal. The existing release commits one normal transform history action. Tracking loss, Escape/pointer cancellation, menu takeover, session suspension and disposal use the existing transform rollback path and clear the candidate marker.

Choose **Position only** or **Position + orientation**, a local X/Y/Z alignment axis, a signed surface offset in millimetres, optional normal flip, and optional rotation about the hit normal. Alignment uses the smallest rotation from the selected object's current orientation, which retains its roll as far as possible; the explicit normal rotation adds a predictable roll. The default local Y axis and zero offset preserve freehand placement unless snapping is enabled.

**Snap targets** selects **Surfaces**, **Scene axes + centre**, or **Bounding box faces + centre**. Surface mode uses ray/triangle intersections. Scene mode targets the sculpture's model origin and principal axes within **Target radius**. Bounding-box mode targets visible eligible mesh bounds, their six face centres and centre, within the same radius. Scene targets move position only; box face targets can also align orientation. The radius is measured in physical millimetres.

## Target and transform rules

- Visible, editable sculpt layer surfaces are targets. Hidden, locked and inherited-hidden/locked layers are omitted. The selected layer and selected group's descendants are excluded to prevent self-snapping.
- The evaluated Boolean display mesh can be a target when the selected object is not one of its target/source operands. Boolean source meshes remain distinct from that derived display surface.
- Visible imported STL references are raycast targets even while locked. Image references are not targets. Reference meshes retain their workspace or sculpture anchor, reference transform and saved scale. Snapping only changes the selected editable object's transform; it never edits, unlocks, bakes or enters the STL reference into the SDF/Boolean graph.
- The hit point and interpolated vertex normal are transformed through the target world matrix. Mirrored winding is accounted for, and the normal is converted into the selected object's parent space using the inverse-transpose mapping. Parent/group transforms, workspace navigation and Turntable presentation are removed by the actual scene matrices before saved model coordinates change.
- Snap changes position and optionally rotation only. Scale, primitive dimensions, source fields, masks, paint and Boolean metadata remain unchanged. There is no implicit Bake, remesh or sculpt history edit. Existing live Boolean source/target edits continue to use their normal transform transaction.
- A small target-switch hysteresis retains the current surface target when the next hit is nearly coincident. Surface preview queries run on pointer motion or at most 20 Hz for the idle VR ray, and update during an active transform. Targets are bounded by the scene's existing layer and STL triangle limits.

Transform options are included in existing tool preferences and native/recovery snapshots. Missing settings in older saves default to Surface snap off. Hover/candidate state is transient.

## Current limits and acceptance

Scene-axis/centre and simple world-aligned bounding-box face/centre modes are available. The bounding mode uses each target mesh's transformed axis-aligned bounds, so it is intended for quick placement rather than exact oriented-box fitting. On Node v26.8.1, the 100,352-triangle surface fixture measured 2.387 ms median, 2.747 ms p95 and 3.161 ms maximum over 100 CPU raycasts after eight warmups. This is one host run, not a headset frame-time claim. The raw probe is `work/phase-6-4/surface-snap-benchmark.json`.

Quest 3 checks remain pending: both dominant hands, Studio and Passthrough, locked STL targets and workspace/sculpture anchors, live Boolean target/source exclusions, offset/readability, world/local/parent transforms, tracking loss/reconnect, menu/grip ownership, save/recovery and sustained-session performance. The first-class Tool Wheel Cut, calibrated support-hand guide and Studio Skybox were not changed.
