# Held preview movement

1. **Changed:** Added Move preview (G), translation arrows/plane handles and clearer held-position hints in the panel and viewport. Numeric XYZ remains available.
2. **Architecture:** Reuses the existing preview-only transform proxy. G/translation and T/rotation are exclusive; both freeze surface following and pause stamping. World movement converts to target-local coordinates without changing source data, layer transforms or history. G finishes at the held pose; Apply remains explicit.
3. **Validation:** Build passed; 177/177 tests passed. Four new tests cover transformed targets, preserved orientation/scale/native bytes/chunks/history, locks/hiding/reset, mode switching and moved+rotated one-action stamping/undo. Browser arrow drag with Follow off changed X from 1.05 to 0.689773, retained 31,536 triangles and zero history, and G re-enabled Apply.
4. **Performance:** No SDF or meshing path changes; no remeshing during movement. Existing preview proxy reused. No additional benchmark required.
5. **Limits:** Positive uniform transforms and existing stamp bounds restrictions remain. Ghost movement is session-only, not a layer transform or deformation tool. Physical phone gestures were not tested.
6. **Next:** Keep input ownership and explicit commit when extending preview scale/snap/alignment controls. Handover updated at docs/DEVELOPMENT_STATUS.md.
