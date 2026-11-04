### Studio sky and horizon (2026-11-04)

- **World Settings → Studio Background → Skybox** now starts On with a neutral-grey sky and lower background. The horizon stays level as you look around: look up for sky, or down for the lower colour. Available in VR Studio and the desktop preview; your On/Off choice saves with the project.
- With Skybox Off, your chosen background colour fills the desktop and VR Studio view. With it On, the colour tints the lower half. The ground grid stays independent, and Passthrough always keeps your real room visible.

### Phase 6.0.3 — Support hand shortcuts at a glance (2026-11-04)

- Four small arrow tabs sit over the centre of your Support controller, with Undo, Redo, Tool Wheel and Layers icons drawn directly on them. Faint neutral arrows have no outlines, words or floating panel, and follow the measured angle of the Quest controller top, sitting below its surface with a finely adjusted controller-relative alignment. Shortcut icons sit farther out to clear the controller, with shorter triangle tips, clear transparent gaps separating the four tabs, and a circular inner edge tucked beneath the rounded controller face. Hold Up or Down to use menus; shortcuts still pause during sculpting and grabs.
- The guide follows your Support Hand when you swap dominance, turns with your wrist, and uses your VR UI Size in Studio and Passthrough. It hides when tracking is lost or it gets too close to your face.
- Prefer a clear controller view? Switch **World Settings → Preferences → Support shortcut guide** Off. The choice saves with your project; new and older projects start with the guide On.

### Phase 6.0.2 — Easier desktop layer rotation (2026-11-03)

- Select and rotate a layer directly from its visible surface without picking a gizmo handle. Rotation defaults to free view-space movement; hold **R**, **F** or **V** during the drag to constrain it to X, Y or Z. Existing rotation handles remain available.

### Phase 6.0.1 — Cleaner code and faster test feedback (2026-11-03)

- Added consistent Biome formatting and lint checks for project code.
- Added quick, focused, changed-file and full test commands, with bounded parallel runs and TAP/JUnit reports.
- `npm run check` now verifies formatting, lint, strict TypeScript, production build and every test.

### Phase 6.0 — Cut, project previews and clearer snapping (2026-11-03)

- Find Cut directly on the VR tool ring, with its own split-plane icon, or open it from the desktop controls. Adjust the plane, review its position and cut the sculpture into two editable layers. One Undo restores the original.
- Cut the active layer or all visible, unlocked sculpt layers together.
- Recognise saved browser projects by their sculpture previews in the desktop and VR project libraries. Projects without a preview show a placeholder.
- Angle Snap dims when the current tool cannot use it. During a snapped straight stroke, a single guide extends from the starting point along its direction. Move rotation and twist show a guide at the snapped angle.

### Phase 5.4 — Easier desktop painting (2026-11-03)

- Shape Library uses the same stamp symbol as VR.
- Compacted the desktop Shape Library, with paired Move/Rotate controls and shorter stamping hints.
- Hid routine Autosave off and waiting messages to keep the sidebar compact.
- Keep your paint when the pointer slips off the sculpture. Painting pauses off the surface and resumes when you return, without drawing across the gap. Undo and Redo still treat it as one stroke.
- Paint now has its own canvas tool icon, with colour selection, radius and strength in its expanded controls.
- Smooth has quick radius and strength controls beside the canvas, with values kept in sync with the sidebar.
- Restoring before VR entry uses a single in-app dialog with progress and an Enter VR button.

### Phase 5.4 — Smoother VR layer editing (2026-11-03)

- Browse longer layer lists with smooth tool-hand stick scrolling. A subtle down arrow shows when more layers are waiting below.
- Keep track of your sculpture with compact, colour-coded rows, clearer child indentation and centred names. Eye and padlock icons put visibility and locking within easy reach.
- Adjust editing detail from Layer Options with Increase Res and Decrease Res beside Transform. Review the confirmation before resampling, which clears that layer’s sculpt Undo history.

### Phase 5.4 — Interface refinements (2026-11-03)

- VR layer options have a clearer layout, with Increase Res and Decrease Res beside the transform control. Resolution changes require confirmation.
- Shorter VR layer rows and stronger child indentation; use the tool-hand stick for smooth scrolling, with a subtle down arrow when more layers are below.
- Clearer Menu size control and centred layer names with compact status badges; visibility and locking are shown by their icons.
- Layer drag handles use a clean three-line grip with a hover hint; locked padlocks now have a clearly closed shackle.
- VR layer rows use eye and padlock icons; drop into empty list space to detach a layer.
- VR layer dragging now shows a layer-colour cursor, an outlined destination, and clear attach, detach or invalid-drop feedback.
- Increased VR menu text resolution and strengthened small text for clearer reading.
- Slimmed the Tool Wheel’s bottom strip so Mask, Paint and Project sit slightly above it.

### Phase 5.4 — Release Readiness (2026-11-01)

- Organise your sculpture with less clicking: drag one layer onto another to make it a child. Move, rotate or scale the parent to adjust them together, or drop a child on Outside to detach it without moving it.
- See your changes as you make them. In Boolean preview, transforming a layer temporarily shows the live layers, then returns to the updated combined result when you finish.
- Find and manage layers at a glance with colour swatches, indented children, collapsed child counts, and eye and padlock controls on each row.
- Rename layers with Enter, duplicate with one click, and reorder using compact arrows. Empty layers delete without a confirmation prompt.
- VR / WebXR Diagnostics now sits at the bottom of the sidebar.
- Enjoy a quieter sidebar with brush tooltips, a compact Layers / Boolean switch, and optional preview settings tucked away below the layer list.
- Catch up on recent improvements in this collapsible What's New panel below Print Report.

### Phase 5.3 — 3D Printing (2026-11-01)

- Import ASCII and binary STL meshes as movable reference assets.
- Export sculpt layers or Boolean results as millimetre-sized STL files.
- Review print reports for open edges, winding, degenerate triangles and connected surfaces. Unsupported checks still need slicer inspection.
- Choose STL or GLB with one format selector; download prepared STL files from Print Report.

### Phase 5.2 — Performance (2026-11-01)

- Paint colours refresh in stages and skip unchanged surfaces.
- Move previews preserve base colours while painting finishes.
- Optional performance capture helps investigate long-session responsiveness. Physical headset performance remains to be validated.
