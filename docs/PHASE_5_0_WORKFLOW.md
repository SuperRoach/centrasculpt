# Phase 5.0 workflow audit and handoff

Implemented 2026-10-31. Further validation deferred at user request. Physical acceptance is PENDING.

## Audited flows

| Flow | Current route and remaining limits |
| --- | --- |
| Launch / Studio / Passthrough | Existing entry availability/recovery gates and fresh-session environment switching retained. Real Passthrough unverified this phase. |
| New / Open / Restore | Project shortcut exits XR. New confirms replacement and chooses resolution/first layer. Open and recovery retain existing validation and recovery choices. No immersive browser yet; Open dirty-work confirmation is future work. |
| Clay / Smooth / Flatten / Inflate | Existing shared options, surface/free-space paths, sizing and alternate ownership retained; menu status exposes Clay operation. |
| Move family | Non-Elastic, Elastic, Rotate/Twist, Pinch, Crease, Scrape remain under Move; variants/settings recall preserved. Pending edit feedback uses existing busy state. |
| Stamp / Tube / Edit Spline | Stamp options and contextual grip retained. Edit Spline remains direct. Procedural tube Bake is explicit before Paint/Mask. Existing cooperative jobs/cancellation retained. |
| Mask / Paint | Actual separate source-local fields/history/native/recovery/export integrations verified in implementation and existing tests. Paint is colour only; no roughness/metalness controls. New busy swatch/slider guards. |
| Layers / groups | Existing paged palette, keyboard rename, duplication, reparent/transform and inherited flags retained. Selection on scene objects remains Layers-only, with menu-panel priority. |
| Mirror / Turntable / World / lights / references | Existing world sections and editing owners retained. Back to Tools remains available; deeper contextual parent navigation could improve. Display metadata and assets use existing persistence. |
| Save / recover / present / export | Explicit Project handoff focuses existing controls. Cmd/Ctrl+S saves. Turntable/lighting presentation and actual GLB scope/quality paths retained. Serialization/preparation can pause. |
| Readability / placement | Existing Default/Large scale, cached canvas, anchored placement and foreground depth retained. Project occupies the free footer area beside Paint/Mask and does not overlap radial targets. Real optical legibility/occlusion/reach remains pending. |

Controller contract retained: Support stick L/R Undo/Redo, up/down wheel/Layers; Support grip workspace; both grips scale/rotate; Tool stick sizing; Support trigger alternate; contextual Tool grip. Existing neutral rearm, menu ownership, tracking/session cancellation and haptic paths remain authoritative.

No geometry/history/storage framework was replaced. Existing full-suite coverage supplies group/paint/mask/tube, alternating modes, both controller bridges, lifecycle, recovery workers, native and GLB invariance checks. New tests specifically exercise changed workflow boundaries. See DEVELOPMENT_STATUS.md for actual results and limitations.

## Quest 3 physical checklist — every item PENDING

Repeat with left and right Tool Hand, in Studio and actual bright/dark Passthrough. Record failures and resolution; do not infer passes from host tests.

1. Enter with and without recovery pending; switch environment, exit/re-enter, disconnect and resume without a stuck stroke.
2. Open wheel/Layers while holding trigger; navigate tool/options/Project and release menu. Confirm no surprise geometry edit until a fresh trigger press.
3. Read active operation, Move variant and busy state; inspect text, hit targets, controller occlusion and reach at Default/Large UI size.
4. Try Clay/Smooth/Flatten/Inflate and all Move variants; alternate/return, size brush, undo/redo and interrupt pending work.
5. Stamp with contextual grip, draw Tube, Edit Spline, then explicitly Bake; check cancellation and history.
6. Mask, Paint/Erase, duplicate and group the source; transform/reparent, hide/lock, undo/redo and inspect colour/protection alignment.
7. Adjust Mirror, Turntable, backgrounds, lighting/edit handles and reference placement without accidental sculpting.
8. Project → New: confirm choices and Cancel; create, save, reopen, restore a chosen checkpoint, inspect groups/paint/masks/splines/references/lighting.
9. Export selected/separate/Boolean with each quality; inspect geometry and colours externally. Verify helpers and hidden layers are excluded.
10. At 64³/128³/192³ record first-paint latency, pending-edit/release responsiveness and sustained frame time/memory/thermal behaviour. Save before stress testing.

## Remaining roadmap

5.1 Project Browser and Management; 5.2 Quest 3 Performance Optimization; 5.3 Production Export Pipeline; 5.4 Full VR Acceptance/Release Candidate.

No commit, push or merge performed. Further validation is deferred until requested.
