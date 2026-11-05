### Scale each repeated item (2026-11-06)

- **Array / Repeat → Scale per item (%)** applies a recurring multiplier to linear or radial copies. At 90%, sizes are 100%, 90%, 81%, 72.9% and so on. Use 100% for equal sizes or more than 100% to grow each copy.
- Scaling stays editable and supports Undo, save/recovery, export and Bake. Projects with progressive scaling require this version or newer.

### Clearer array state controls (2026-11-06)

- The array toggle shows **Array enabled** or **Array disabled**, with a selected appearance when enabled. Clicking it switches the actual array state.
- Remove array is a compact **×** button with a tooltip and accessible name; removal supports Undo.

### Radial array gaps and clearer actions (2026-11-06)

- Radial arrays now have **Gap between copies (mm)**. It adjusts the circle centre to separate neighbouring source bounds while keeping the original object fixed. Linear arrays retain their own Spacing setting.
- Array fields keep unfinished edits when you tab away. The action reads **Create array** for a new pattern and **Update array** for an existing one.

### Export directly from assembly preview (2026-11-06)

- **Export current layer** and **Export all layers** accept the first tap while the assembly preview is finishing, then export automatically. Immediate progress feedback confirms the request; repeated taps cannot start duplicate jobs.

### Restore assembly previews and export reliably (2026-11-06)

- **Assembly → Show assembly preview** shows the peg and socket result again. Saved projects and recovery checkpoints remember this view and rebuild it when opened. Selecting a layer keeps the preview visible.
- Boolean exports release temporary display caches and prepare geometry in bounded chunks. Stock boxes with the default peg and socket now export at High quality within the existing memory budget. Print reports include the actual Boolean sampling spacing; geometry and topology limits still apply.

### Delete live Boolean sources directly (2026-11-06)

- Select a peg, socket cutter or other live Boolean source and press **Delete**, or choose **Delete layer**. Its uses are removed automatically; **Undo** restores the layer and its operations together.
- **Live Boolean Shapes** has a **Delete source** action beside each operation. **Remove from result** keeps the source layer. The explanatory paragraphs have been removed.

### Size primitives before creating them (2026-11-06)

- Expanding **Primitives** shows a temporary creation preview with draggable size handles. Box handles change width, height and depth; cylinder handles change diameter or height; sphere handles change diameter. Dimension fields update with the handles, and typing a size updates the preview.
- Choose **Create** to add the sized shape as one undoable action. Closing the section hides the preview; Escape during a drag restores its previous size. **Edit selected** uses the existing source resize handles.

### Place peg-and-socket joints by tapping (2026-11-06)

- Fixed the preview error for two default boxes with stock peg settings. The assembly now displays within its preview budget and reports its effective detail level.

- In **Assembly → Peg & socket**, set diameter, length and clearance, then choose **Place peg & socket**. Tap the peg’s layer, tap the socket’s layer, then tap the joint face to create them.
- A live wire preview follows the surface and automatically matches the socket position and direction on the other layer, including separated components. The other layer is shown as an outline while placing the joint.
- Socket sizes follow the peg and clearance automatically. Manual sizes and coordinates remain under **Advanced**. Creation is one undoable action and opens the evaluated assembly preview when the quality budget allows it.

### Check fit by tapping two layers (2026-11-05)

- Open **Assembly → Check fit**, then tap two layers in the scene or desktop Layers list. The second tap checks them automatically; ordinary layers need no printable-part setup.
- Read the gap or overlap result directly over the canvas. Selection outlines and step-by-step prompts show what to tap; **Escape** or **Cancel** exits safely.
- Peg/socket, alignment and part/export controls now live in separate collapsed sections. Use **Pick two layers** for connectors or alignment; new printable parts are created only when you apply those operations.

### Delete layers with the keyboard (2026-11-05)

- On desktop, press **Delete** (or **Backspace** on a Mac keyboard) to remove the selected layer. **Cmd/Ctrl+Z** restores it. Typing in fields and holding the key will not delete additional layers. A brief on-screen message confirms deletion or explains when only one layer remains.

### Phase 6.6 — Assemble parts and check their fit (2026-11-05)

- Define named printable parts from existing layers, assign their components, and keep them independently editable. Find **Assembly / Fit** on desktop or in VR under **World Settings → Measure & Precision → Primitives**.
- Inspect approximate gaps and interference in millimetres, with nominal-clearance settings, resolution warnings and candidate collision markers. Fit checks are approximate and cannot guarantee a physical fit.
- Align centres, bounding faces or axes with deliberate offsets, and create editable peg-and-socket geometry with explicit dimensions and radial clearance. Undo connector generation as one action.
- Preview the evaluated assembly without joining its parts, then export individual calibrated STLs with companion print reports. Parts and editable connectors travel with saved projects and recovery checkpoints.

### Phase 6.5 — Repeat objects with editable arrays (2026-11-05)

- Create editable **Radial** and **Linear** arrays from Primitives/Array on desktop or **World Settings → Measure & Precision → Primitives → Array/Repeat** in VR. Set count, axis, total angle or physical spacing, pivot, centred distribution and whether copies rotate with the array.
- Array copies remain linked to their source and update when it changes. Toggle the array or its source visibility; edit its settings later, then choose **Bake** only when you need an independent sculpt layer.
- Exported GLB/STL evaluates repeated geometry and live Boolean operands. For example, repeat a cylinder as a Boolean cutter to make mounting holes; the cutters do not export as extra visible parts.

### Phase 6.4 — Snap objects to surfaces (2026-11-05)

- Turn on **Surface snap** in Transform options to place a selected object on a visible sculpt or imported STL surface while moving it. A live point-and-normal marker shows the current hit; freehand placement remains the default.
- Preview a candidate under the desktop pointer before dragging or under the tracked VR Tool ray before gripping. Choose surface hits, scene axes/centre, or visible target bounding-box faces/centre, with a physical snap radius for alignment targets.
- Choose position-only placement or align a local axis to the surface, adjust the offset in millimetres, flip the normal or set a rotation around it. Snapping keeps the object's size and editable source intact and records as one undoable transform.
- Visible locked STL references can guide placement without becoming editable geometry. Boolean display surfaces stay distinct from their source shapes; self and hidden/locked sculpt targets are skipped.

### Phase 6.3 — Cuts that stay editable (2026-11-05)

- Keep editable source shapes visible while moving or resizing a live Boolean. Use desktop **Scale (R)** to change Box width/height/depth, Cylinder diameter/height or Sphere diameter with local-axis handles; the centre handle changes all dimensions together.
- Add, subtract or intersect primitive shapes and sculpt layers with **Live Boolean Shapes**, now directly inside the selected layer’s desktop Layers card, or in the VR Layers menu. Move, rotate or resize a cutter later to change the result without rebuilding your original shapes.
- Inspect and edit source shapes, change or reorder operations, toggle them on/off and undo changes. Choose **Bake** when you want a separate sculptable result; the existing plane Cut tool still splits layers independently.
- Live operations stay editable through saves and recovery. Result exports leave cutters out, and reject previews that are still rebuilding or too coarse for the chosen detail.

### Phase 6.2.1 — Foundations for assisted modelling (2026-11-04)

- Prepared core modelling actions for future assisted editing, with stale-scene protection, cancellation and undoable object deletion. This milestone adds no AI service or agent control panel.

### Phase 6.2 — Editable primitives (2026-11-04)

- Create precisely sized **Box, Cylinder and Sphere** objects in **Primitives** on desktop or **World Settings → Measure & Precision → Primitives** in VR. Position a preview with your Tool hand, adjust its size with the Tool stick, then tap the Tool trigger to place it. Cancel from the Support-hand menu.
- Desktop **Primitives** has visual shape cards, separate Create/Edit views, compact dimensions and a unit switch. Position and rotation controls tuck away, with Restore and Bake shown when editing a selected primitive.
- Edit dimensions in millimetres, centimetres or inches, enter exact transforms, duplicate and parent primitives using Layers, and restore their initial dimensions later. Parameters stay editable through saving and recovery.
- Choose **Bake to Sculpt Layer** when you want to use sculpting, Cut, Mask or Paint. Baking keeps the editable source and supports Undo/Redo. Cut keeps its full Tool Wheel button.
- GLB exports now use project calibration in metres. STL keeps its explicit target-size override and optional project-scale sizing. Projects containing primitives require this version or newer to reopen.

### Phase 6.1 — Measure and place precisely (2026-11-04)

- Open **World Settings → Measure & Precision** in VR, or **Measure & precision** on desktop, to measure surface distances and three-point angles in millimetres, centimetres or inches. Keep, reposition or remove annotations on sculpts and STL references.
- Enter exact positions, rotations and proportional target dimensions for layers and groups. Optional 0.1, 1 or 5 mm movement snapping and adjustable angle steps help with placement; transforms support Undo/Redo.
- Save physical calibration and measurements with your project. STL export can use the project’s physical scale, or your existing target longest dimension; its report explains the applied sizing.

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
