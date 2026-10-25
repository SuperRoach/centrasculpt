# Ghost rotation follow-up

1. **Changed:** T / Rotate stamp toggles a rotation-ring gizmo on the ghost. Added Shape Library controls and a viewport Rotate/Apply toolbar with a clear paused state.
2. **Decisions:** A separate scene-sibling proxy holds the world pose. Edits convert back into the target layer's local preview coordinates. No layer meshes are transformed, no voxels are resampled and no source history is created by rotation. Preview input ownership pauses camera/sculpting during a drag; stamping is blocked until rotation finishes. Pointer following stays off after T finishes so the pose can be applied precisely.
3. **Validation:** Build passed. **173/173 tests passed** (5 new). Browser ring drag updated the angle without voxel/history changes. Applying afterward created one history action; undo restored the mesh. Automated checks cover transformed targets, camera ownership, hidden/locked/busy states, selection changes, save-byte invariance, buffer identities and local/world conversion.
4. **Performance:** No source mesh rebuilding during rotation. Proxy/gizmo created once; no new dependency. No source benchmark rerun was warranted. Existing bundle-size advisory remains (~698 kB JS).
5. **Limits:** Rotation mode is session-only; no separate undo for ghost adjustments. No ghost translation/scale gizmos, VR or snap controls. Follow pointer must be explicitly re-enabled after rotation if desired. Physical phone gesture testing was not performed.
6. **Next:** Extend this preview-proxy ownership model for future placement/scale gizmos; preserve target-local math and explicit stamp commit.

Changed files and detailed handover are in docs/DEVELOPMENT_STATUS.md; an identical handover copy accompanies this report. Source checkpoint: outputs/before-ghost-rotation.tar.gz.
