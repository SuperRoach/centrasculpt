### Personal Shapes — Phase 8.0 (2026-11-10)

- Save a selected sculpt or evaluated Boolean root with a genuine thumbnail, name, physical dimensions and Centre/Base centre insertion pivot.
- Browse your persistent browser-local Personal Shapes independently of projects. Rename or confirm deletion, and insert independent editable sculpt copies.
- Masters retain full stored SDF detail with lossless compression and integrity checks. Unsupported evaluation, memory and storage sizes refuse explicitly; keep a .form backup or split the object.
- Insertions support Undo/redo, normal transforms, sculpting, .form saves and STL/GLB export. Procedural construction history is flattened.
- Quest Project navigation can leave XR for the browser workflow; physical headset acceptance remains pending. Personal stamps (8.0.1), component collections (8.1) and agent integration (8.2) are deferred.

### Learn by making — Phase 7.6.1 (2026-11-10)

- Three illustrated tutorials cover a first clay sculpt, a measured three-slot holder and a box with a separate lid.
- Real desktop screenshots enlarge to their original resolution. Explore the source-accurate Tool Wheel schematic with keyboard, mouse or touch; Quest captures remain pending.
- The 26-page guide adds tool-choice advice, a modelling glossary, practical troubleshooting and experimental curved STL safeguards.
- Documentation remains local pending publication authorisation. No modelling or export algorithms changed.

### Help on the same site (2026-11-10)

- **Centra Sculpt → Help ↗** opens the field guide in a new tab while your editor stays open.
- The normal app build now includes the documentation and search at `read-the-docs/`. The same path also works on the development server.

### A guide from first sculpt to printable parts — Phase 7.6 (2026-11-10)

- A new local documentation website in `read-the-docs-pls/` covers desktop and Quest controls, the full Tool Wheel, sculpting, precise modelling, projects, painting, export and local-agent workflows.
- Search the 23 guides with Cmd/Ctrl+K, switch light/dark themes and browse the complete task-based navigation on desktop or mobile.
- Export guidance explains physical sizing, evaluated geometry, detail/resource limits and the optional curved-reduction fallback. The agent walkthrough includes the editable three-slot holder and separate browser approval.
- Build and preview instructions are in the website README. This delivery is local; the documentation has not been published.

### Export controls and optional curved reduction (2026-11-10)

- File type and Quality preset now share the top row. Format tooltips describe STL and GLB; an **Actual size (1:1)** switch below reveals target sizing when turned off.
- Advanced settings offers **Curved reduction · Experimental · STL**, off by default, with a 0.01–0.1 mm surface-tolerance slider. It can reduce eligible meshes and keeps the original when geometry checks or resource limits reject a candidate.
- The result shows **✓ applied** or **✕ fallback**, with the fallback reason. Checks are sampled and do not guarantee print fit; calibrated printable-part exports remain exact.

### Adaptive desktop Boolean editing (2026-11-09)

- Boolean preview stays visible while using desktop tools. Interactive detail adapts between 18³ and 64³ based on measured frame rate; after release, it refines to your chosen preview quality.
- The last completed result stays visible during rebuilding. Draft quality does not change saved geometry or export settings.

### Boolean preview stays within its work budget (2026-11-09)

- Boolean preview now uses the highest resolution that fits its existing work budget instead of refusing ordinary larger layer stacks.
- The status is concise: **Boolean preview · 185³ · Reduced detail**. Export detail settings remain independent.

### Export progress colours (2026-11-09)

- The export progress line changes colour for preparation, SDF evaluation, meshing, optimisation, sizing, validation and file encoding. Stage names and per-stage progress remain visible.

### Correct visible-layer STL Booleans (2026-11-09)

- **All visible layers** now evaluates visible subtraction and intersection layers for STL, preserving the Boolean result instead of exporting cutter solids.
- These exports use the chosen SDF detail setting and identify evaluated geometry in their summary. Final topology checks remain enforced.

### Faster evaluated STL exports — Phase 7.5.4c (2026-11-09)

- Boolean and printable-part STL preparation avoids unused work and temporary copies, with measured gains on curved and mechanical models.
- Evaluated sculpted geometry, physical sizing and final print checks follow the existing pipeline. Curved decimation remains disabled.

### A dedicated export workspace — Phase 7.5.3 (2026-11-09)

- A cleaner **Export…** dialog puts format, physical size and one quality slider first; memory, resolution and the alternate preset selector live under Advanced settings. Target dimensions appear only when target sizing is selected.
- Open **Export…** for sizing, format, scope, quality, memory and reports in one dialog. Review prepared files before downloading; Escape cancels active work or closes the idle dialog.
- A quality slider shows source-count estimates with uncertainty, then measured generated triangles after preparation. It does not remesh while you adjust it.
- Inspect stage timings and resource estimates alongside the existing physical dimensions and STL checks. Curved decimation remains disabled; High retains conservative planar optimisation.

### Simplify tilted flat surfaces (2026-11-09)

- High export now simplifies eligible planar regions at arbitrary orientations, retaining hole boundaries, seam vertices and local/world bounds.
- A small bounded Float32 round-off allowance is reported separately from sampling error. Curved regions, crease transitions and paint remain protected.

### Exports continue when you switch windows (2026-11-09)

- Switching apps or hiding the tab no longer cancels an export. Cancel and Escape still stop it deliberately.
- Automatic interruptions show their cause and are no longer labelled as a user cancellation.

### Fewer triangles on flat surfaces (2026-11-09)

- High-quality exports now simplify whole exact planar regions across mesh chunks, preserving hole boundaries, seams and sharp edges.
- Painted surfaces and curved detail retain their existing geometry. Fast and Standard are unchanged.

### Clearer export failures (2026-11-09)

- Failed exports now say **Export failed**, show the processing stage and underlying reason, and announce an error. Requested cancellation is labelled separately; real failures are retained even if Cancel is pressed at the same time.

### More detailed Boolean exports (2026-11-09)

- Boolean exports use tighter primitive bounds and ignore empty dense layers when choosing the sampling area.
- Choose **Default · up to 192³** or **Extra detail · up to 256³** for Boolean and printable-part exports. The summary reports the actual evaluated resolution.
- Dimensions, intentional sharp edges and clearances are preserved. Denser results still need to fit the selected memory and final triangle limits.

### Export sizing and correctness — Phase 7.5.2 (2026-11-09)

- Export sizing starts at explicit 1:1 project dimensions. Casual target mode starts at 200 mm; deliberate 100 mm remains available.
- STL and GLB share sizing intent, with measured scope/export dimensions, scale and quality shown before encoding.
- Reference STL normalisation is labelled as display sizing. Hard Boolean edges remain intentional; no automatic smoothing or clearance changes.

### Easier local-agent tool discovery (2026-11-08)

- Machine-hostname HTTP connections now use the existing cryptographic UUID fallback for agent client, proposal and activity IDs.

- `get_capabilities` now reports the same scoped-preview support published in MCP `tools/list`, plus the adapter build and current session identity with reconnect guidance.
- A new holder workflow example shows exact dimensions/transforms, three editable slot cutters, Booleans, browser-approved proposals, evaluated bounds, scoped previews and one Undo.

### Tidier agent activity (2026-11-08)

- Recent changes places each action and its time on one row. New entries fade in briefly; existing entries stay steady, with reduced-motion preferences respected.

### Clearer agent change highlights (2026-11-08)

- Agent changes show a green silhouette border for six seconds, including when the visible editor loses focus. **Show me** frames the affected objects and replays their highlight.

### Keep sculpting after an agent restart (2026-11-08)

- Restarting `dev:agent` leaves your scene open. The tab detects the new server and opens the approval prompt automatically. Use **Local agent access → Approve connection** to connect to the new session without reloading. Fresh approval is still required.

### Agent inspection cleanup (2026-11-08)

- Local agents can request isolated object and printable-part previews, including evaluated Boolean cuts and arrays, with identity and geometry metadata.
- Added a roadmap separating implementation from browser, Quest and print verification, including deferred export optimisation.

### A tidier tyre dial (2026-11-07)

- Tyre shape now uses whole numbers, a clear readout and **0 = Torus / 100 = Tyre** endpoints. New primitive dimension labels are shorter, with the ring-radius explanation tucked into a tooltip.

### Round donut, firmer tyre (2026-11-07)

- Torus now has **Tyre shape · 0–100%**: keep it round or add a flatter tread and firmer shoulders. Ring size and hole diameter stay put.
- Curved primitive previews have fewer wireframe lines, making their silhouettes easier to read. Applied shapes keep their full detail.
- Cone tip entries stop at zero. No inside-out horns, please.

### Four more starting points (2026-11-07)

- **Cone, Capsule, Torus and Pyramid** join Primitives on desktop and Quest. Tiny horn? Rounded handle? A respectable donut? Start with exact dimensions and keep editing them.
- Cone tips can be sharp or blunt. Capsule height includes both rounded ends; torus fields clearly separate ring radius from tube diameter. Pyramid width, depth and height stay editable.
- Native saves, recovery, Library copies and approved local-agent plans retain the sources. Thin features still need export and slicer checks; no surprise Bake.

### More room for export cleanup (2026-11-07)

- Export memory now offers 256 MiB (default), 384 MiB and 512 MiB budgets. Choose a higher budget for larger Standard or High exports on devices with memory to spare; total browser memory can be higher.
- Unified Boolean cleanup preserves winding across mesh chunks. Memory rejections show estimated and available workspace; triangle and topology limits still apply.

### Scene previews recover after switching desktop focus (2026-11-07)

- Fixed live Boolean evaluation staying paused after switching away from the desktop editor, which could leave agent scene captures stuck at `render_pending`.

### Visual inspection for local agents (2026-11-07)

- Approved local agents can request model-only PNG views from six angles, with evaluated display geometry and sampling metadata.
- Captures use a separate camera, exclude references and editor UI, and leave your sculpture, selection and Undo unchanged. Pending geometry returns a clear limitation.
- Development-only, read-only access; screenshots help judge layout but cannot verify dimensions, watertightness or physical fit.

### Cleaner cutout and mounting controls (2026-11-07)

- Feature fields are grouped into placement, position and size, with short wall names and a clear Preview / Apply sequence. Extra cutter reach is tucked under Advanced.
- Mounting posts use numbered X/Z coordinate rows instead of a JSON text box. Round openings show a single diameter field.

### Wall ports and floor mounting features that follow enclosure edits (2026-11-07)

- Add rectangular or round wall openings in **Enclosure → Cutouts / Mounting Features**. Their named wall association follows enclosure size and wall/floor changes.
- Add up to four mounting posts from your own centres and dimensions. Posts and bores remain editable live Boolean sources; no board specifications or printer tolerances are assumed.
- Preview, apply or remove each feature with one Undo. Native saving, recovery, Project Library copies and optional local-agent proposals retain the association.
- Attachment authoring is desktop-only; Quest can resize saved features with the existing enclosure workflow. Layer, sampling and export limits still apply; physical fit needs slicer and print checks.

### See what your local agent changed (2026-11-07)

- Successful agent edits briefly outline the affected objects. Open the sparkle panel for recent changes and click **Show me** to find them.
- Batches appear as one activity, with object names and results. Feedback stays separate from your sculpture and Undo history.
- Optionally remember your editing choice on this browser; each new connection and proposed plan still needs its own approval.

### Larger STL exports with bounded validation (2026-11-06)

- STL exports support up to 600,000 triangles when the memory budget allows. Topology checks use compact typed buffers and remain cancellable.
- Full-resolution Turtle export was verified at 365,994 triangles without reducing resolution. Its companion report retains shell and winding warnings for slicer inspection.

### Full-detail Boolean export in stages (2026-11-06)

- Unified Boolean export can evaluate larger scenes in stages while keeping the same grid and up to 192³ resolution. Shapes are combined in their original order, with one continuous final mesh.
- Progress shows the evaluation stage and supports cancellation. Editable sources and Undo history remain untouched.
- Memory and triangle limits still apply. Preview retains its smaller work limit; the old misleading “Array evaluation” error now identifies Boolean evaluation.

### Stretch spheres into ellipsoids (2026-11-06)

- Spheres now have independent width, height and depth. Drag an axis handle or edit dimensions to make elongated or flattened shapes.
- Local agents can create, resize and preview ellipsoids. Booleans, STL/GLB export, Undo and native saving retain the stretched shape.
- Ellipsoid projects use native format v18; ordinary spheres and earlier project formats remain supported.

### Tapered cylinders and flexible primitive sizing (2026-11-06)

- Cylinders now have separate top and bottom diameters, making tapered solids and cutters for flared openings. Both controls appear in Primitives and are available to local agents.
- Agents can resize box width, height and depth independently, or scale cylinder height separately from its circular end diameters. Sources remain editable and changes support Undo.
- Tapered projects use native format v17; use this app version to reopen them.

### Quieter desktop agent controls (2026-11-06)

- A small sparkle icon with a green connection dot replaces the open MCP panel. Click it to review proposed commands or manage access; incoming plans never open a popup or take focus.
- Enabling editing collapses the controls. Each modelling plan still needs separate approval.

### Review local agent plans before applying (2026-11-06)

- Local agents can propose a multi-step model and show its additions, edits, deletions, object dimensions and exact commands before changing the scene.
- Approve each plan separately in the desktop editor, or reject it and request a revision. Approved plans apply once with one Undo action; stale or expired plans are refused.
- Preview checks source geometry, not final printability. Optional development MCP access only; Quest synchronisation remains deferred.

### More modelling tools for local agents (2026-11-06)

- Optional local MCP access now supports editable Booleans, arrays, groups, printable parts, connectors and enclosure updates.
- Agents can inspect geometry, discover supported capabilities and preview or apply multi-command edits as one Undo action.
- Browser approval and explicit editing permission remain required. Sampled geometry checks do not verify physical printer fit.

### Easier agent connections and more room to build (2026-11-06)

- Configure the local MCP connection once; new development sessions are discovered automatically. Browser approval and editing permission stay under your control.
- Work with up to 16 layers, within the existing resource budgets. Native projects keep all layers; projects above eight layers require this newer app.
- Agents now have dedicated Move, Rotate and Scale tools that preserve the rest of each object's pose and support Undo.

### Clearer local agent approval (2026-11-06)

- Local agent access now matches the editor, with a compact connection icon, an editing switch and a separate revoke action. Dismiss the panel and reopen it from the small corner icon. Connection errors offer more specific recovery steps.

### Local agent access for developers — Phase 7.3 (2026-11-06)

- Start with `npm run dev:agent` to connect Codex or Cursor to the open local editor. Approve the connection in the browser, then choose whether to allow editing.
- Agents can inspect objects and dimensions, create or adjust shapes and enclosures, preview supported edits and Undo changes. Edits use the same modelling commands and history as the editor.
- Normal startup and production builds keep agent access off. Access can be revoked at any time; setup and removal instructions are in the local MCP guide.

### A tidier enclosure panel (2026-11-06)

- Hover over **Enclosure** for a short explanation. Size, wall and lid settings are grouped into compact rows, with a live outside-size summary.
- New/edit controls show the current mode, and the next preview or apply action is highlighted.

### Clearer enclosure editing (2026-11-06)

- **Enclosure** uses simpler wording and opens a loaded enclosure for editing. Choose **Preview changes** to see the new size, then **Apply changes** to keep it.
- Resizing keeps extra live Boolean operations and cutters, so openings such as USB ports can stay editable. Cutters keep their existing placement; check them after moving a wall.

### Editable enclosures and removable lids — Phase 7.1 (2026-11-06)

- **Enclosure recipe** creates a hollow base and separate friction-fit lid with editable cavity, wall, floor, corner, lip and clearance dimensions. Available on desktop and in VR under **Measure & Precision → Primitives**.
- Stage and review before confirming; creation or recipe updates use one Undo action. Source shapes stay editable, and native saves, recovery and Library project copies retain the recipe.
- Export base and lid separately at the same physical mm scale, with closed-mesh validation and resolution warnings. Screw lids are deferred; slicer checks, physical Quest testing and printed fit remain pending.

### Headless modelling tools — Phase 7.0 (2026-11-06)

- Local scripts can create and edit objects, groups, arrays and printable parts, inspect their relationships, and save native projects without VR input.
- Apply ordered edits as one Undo action, or preview them without changing the project. Stale edits are rejected and failed batches roll back.
- A runnable Node example demonstrates editable Boolean subtraction and printing diagnostics. Diagnostics describe sampled geometry and do not guarantee physical fit or printability.

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
