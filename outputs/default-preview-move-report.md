# Automatic Move for manual placement

1. **Changed:** Switching Follow Pointer off automatically enables Move handles. Idle Move permits Apply stamp without hiding the gizmo; finishing rotation returns to Move. Turning Follow on clears the gizmo.
2. **Decisions:** Shared preview enable/follow/Apply policy lives in ShapePreviewModel. Explicit Apply is gated during drags, rotation, busy/unavailable targets. Canvas pointer gestures cannot stamp in Move mode. No source data/history changes until Apply.
3. **Validation:** Build passed; 178/178 tests passed. Browser verified automatic Move, enabled Apply, one-action stamping with Move retained, Undo, rotation returning to Move and surface-follow clearing Move.
4. **Performance:** Interaction policy only; no source meshing algorithm changes or extra benchmark required.
5. **Limits:** G can optionally hide handles; normal bounds/visibility/locking and positive uniform transforms still apply. Physical phone gestures remain untested.
6. **Next:** Preserve explicit Apply versus gizmo ownership for future placement controls. Handover updated in docs/DEVELOPMENT_STATUS.md.
