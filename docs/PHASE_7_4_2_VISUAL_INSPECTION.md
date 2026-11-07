# Phase 7.4.2 — local agent visual inspection

2026-11-07. Optional development-only stdio MCP → authenticated 127.0.0.1
bridge → existing browser Three.js/WebGL renderer. Normal dev and production have
no capture endpoint or agent module. No WebMCP, LAN, cloud or Quest synchronisation.

## Agent workflow

1. Start `npm run dev:agent`, open the exact 127.0.0.1 editor origin and explicitly
   approve the connection. **Allow editing is unnecessary for capture.**
2. Inspect `scene_summary`, `list_objects`, enclosure anchors/features and source
   accuracy labels. Use actual stable IDs returned after a committed transaction.
3. For live Booleans/arrays, use the editor's **Boolean** surface view and wait for
   its ordinary evaluated display. Capture never switches views, forces evaluation,
   waits in a background loop or changes source caches. A pending/failed display
   returns `render_pending`; separate sources with operations return `not_evaluated`.
4. Request two useful angles, retaining the same revision:

```json
{"expectedRevision":"LATEST_REVISION","viewpoint":"isometric","width":512,"height":384}
```

Call tool `capture_scene_preview`. `viewpoint` defaults to `isometric`; other choices
are `front` (+Z), `back` (−Z), `left` (−X), `right` (+X), `top` (+Y). Top has −Z
up; the other views have +Y up. These are render-world axes, not enclosure wall
anchor axes. Width/height are integer **64–512**, default 384, independent of device
pixel ratio: at most **262,144 pixels**, **512 KiB PNG**, **4,096 meshes** and
**600,000 displayed triangles**. No silent resizing or quality reduction.
5. Inspect the MCP **image content block** beside its structured/text metadata.
   Metadata includes exact MIME, byte/pixel dimensions, timestamp, project/revision,
   camera pose, measured mesh bounds in render-world units, visible source IDs,
   triangle/mesh counts and current display sampling statistics. Source IDs include
   consumed sources; they do not imply that cutter shells appear in the image.
6. Call `get_geometry_diagnostics({id})` for relevant objects/marked printable parts;
   compare sampled bounds, spacing, topology/clearance limitations and source labels.
   Screenshots **cannot establish watertightness, exact dimensions or physical fit**.
   Use per-part export reports, the intended slicer and physical tolerance prints.

The first release supports **the entire visible model only**. Object/part IDs,
selection-only capture, private references, grids/guides, colour/paint fidelity and
arbitrary camera coordinates are unsupported and strict-schema rejected. The
monolithic evaluated scene mesh cannot truthfully isolate arbitrary source IDs.
Visible locked surfaces remain visible; hidden surfaces stay excluded. An empty
or wholly hidden scene returns `empty_scene`. Deleted IDs are inspected through
existing object diagnostics; capture does not resurrect objects or selections.

## Rendering and provenance

One on-demand offscreen WebGL render uses the current committed mesh geometry and
world matrices. The separate orthographic camera frames a measured bounding sphere
with margin and aspect compensation. A detached scene uses neutral untextured
material, neutral background and ambient/key lights. References, source material
textures, studio photos, desktop menus, approval/recovery UI, masks, grids, guides,
staged feature previews and ephemeral agent outlines are never attached. No browser
screen/tab/canvas screenshot API or reference loader is used. Paint colours are
intentionally omitted. Current renderer tone mapping/output colour processing is
retained; this is a shape/layout view rather than a colour calibration tool.

`evaluated-live-display` means the ready sampled Boolean/array display, including
consumed cutters and actual array evaluation; it is not an independently evaluated
STL. `committed-source-surfaces` is only allowed in separate view without live
operations. Resolution/voxel spacing and capping can hide small ports/clearances.
Phase 7.2 declared attachment intent is not a separate constraint solver pass:
only committed current meshes appear. Manual source edits can differ from declared
intent until an explicit enclosure rebuild. Assembly preview is refused.

Capture does not change the active OrbitControls camera, scene parenting, selection,
sculpt/XR state, source materials/geometry, project bytes, Undo, autosave settings,
write grants or proposal consent. Matrix updates are ordinary render transforms.
Temporary material/render target and canvas storage are released on success/error;
shared source geometry is never disposed. Render target, clear colour/alpha,
viewport/scissor state are restored in `finally`. No new frame-loop work or polling.

## Transport, lifetime and limitations

The ordinary JSON `/call` and `/result` requests retain **64 KiB** limits. PNG bytes
are uploaded separately as bounded binary `image/png` to `/preview-image`, only
with the exact browser token, origin, approved owner and current capture job ID.
Other tools, MCP bearer credentials, stale IDs and repeat uploads cannot use it.
The bridge validates PNG signature/header dimensions and metadata consistency.
One pending operation retains at most one 512 KiB image. It is released with the
request, revocation, disconnect, timeout or shutdown. MCP HTTP responses are bounded
to 768 KiB for capture; base64 appears only in the image block, never duplicated
in structuredContent or text. No image files are persisted by the application.

Existing 10/12/15 second browser/bridge/MCP deadlines and single-flight admission
remain. Encoding observes cancellation/deadline; owner/project/revision are checked
before render, after encoding and after upload. Busy strokes/transforms, recovery,
modals/authoring reservations, active XR and WebGL context loss refuse. Long GPU
calls are synchronous and cannot be pre-empted; late output is discarded after the
call returns. Native PNG encoding can also finish internally after cancellation,
while its result is discarded and owned resources are released. No GPU watchdog or
physical Quest latency/memory guarantee is claimed. Hidden/background browser
throttling can expire the existing heartbeat: reconnect explicitly.

## Verification

`npm test -- agent-preview agent-access` covers framing/directions/aspects, measured
bounds, native/history/selection and renderer-state preservation, real compositor
Boolean hole/array raycasts, empty/hidden/large scenes, context/XR/busy/stale,
encoder cancellation/timeout/project replacement/oversize, render failure, strict
schemas and read-only exact-owner binary security/resource admission.

`npm run test:agent:browser` additionally requests two angles of a constructed
primitive and scans production isolation. In this host, standalone Chromium launch
is blocked (SIGABRT/EPERM); do not report that full script as passed.

For an already approved disposable editor with a constructed Boolean/array fixture:

```bash
CENTRA_AGENT_DISCOVERY_FILE=work/phase-7-4-2/session.json npm run test:agent:visual
```

This read-only official stdio SDK smoke captures front/isometric/top PNGs, validates
MIME/header pixels/bytes and metadata, compares scene revision and object snapshots,
and retains numeric diagnostics where applicable. Outputs are ignored under
`work/phase-7-4-2/`. It closes MCP and revokes the session when done. See the dated
six-part status for actual final results. Physical Quest and print acceptance pending.

## Desktop focus and pending evaluation (2026-11-07)

Desktop focus interruption must not suspend Boolean evaluation: there is no XR
frame to resume it. The XR controller lifecycle now applies evaluation suspension
only during a real XR session and always releases it on exit, including after the
last live operation is removed. A regression checks readiness without native-byte
or history changes. Save an already open project before refreshing to load this
fix. `render_pending` remains valid while display evaluation is actually unfinished
or unavailable; capture never substitutes a stale image.
