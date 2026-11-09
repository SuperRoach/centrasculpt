# Centra Sculpt roadmap

Implementation and verification are separate gates. Historical results below are
not fresh acceptance runs; consult the corresponding DEVELOPMENT_STATUS.md handover
for counts, evidence and outstanding limitations. No blanket hardware or print
acceptance is implied.

| Phase | Implementation | Automated | Browser | Quest | Physical print |
| --- | --- | --- | --- | --- | --- |
| 7.5.2 | Explicit sizing, tighter/256³ export, arbitrary-plane High and lifecycle correction | 1,667/1,667 full handoff checks passed | Final export/physical-report and lifecycle browser checks passed | Not run | Original holder pending |
| 7.5.1 | Capability/workflow/hostname support and HTTP UUID fallback implemented | 1,667/1,667 full; 19/19 focused passed | Hostname stdio/approval/holder/captures/Undo/restart/production smoke passed | Not run | Not run |
| 7.4.2 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.2 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.4.1 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.4 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.3.1 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.3 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.1 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.0 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.6 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.5 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.4 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.3 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.2.1 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.2 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.1 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.0.3 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.0.2 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.0.1 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.0 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.5 cleanup | Evaluated object/part isolation implemented; reliability acceptance in progress | 1,652/1,652 full; 27/27 focused passed | Installed Chromium smoke and isolated PNG delivery passed; expanded lifecycle scenarios pending | Not run | Not run |
| Future export optimisation | Deferred | Pending | Pending | Pending | Pending |

The user's enclosure-and-lid print is **one successful real-world fit test**.
It does not validate other dimensions, clearances, features, printers or materials.

## Phase 7.5 remaining acceptance

- Implemented: disposable evaluated object/part geometry, stable identification,
  auto framing and existing camera presets.
- Implemented: no-reload Vite restart with explicit fresh approval; browser regression added.
- Remaining expanded acceptance: rejection/revocation during active capture and stale-tab takeover.
- Active-tab ownership, stale sessions, editor replacement and cleanup.
- Proposal atomicity, one-step Undo, cancellation, errors and stale revisions.
- PNG delivery and bounded payloads. Preserve consent and permission checks.
- Distinguish missing browser binaries or host restrictions from application defects.

## Phase 7.5.1 remaining acceptance

- Verify official stdio `tools/list` schemas and `get_capabilities` parity, including
  scoped preview arguments, current build/session identity and restart guidance.
- Run the automated holder challenge through the real browser editor and official
  MCP SDK; verify separate approval, unchanged pre-apply scene, exact Boolean graph,
  evaluated bounds/captures and one Undo within the 16-layer limit.
- Codex/Cursor cached tool exposure cannot be established from repository tests;
  confirm via each client's MCP panel after refresh/reconnect. Quest hardware remains
  a separate acceptance gate.

## Deferred export optimisation

Profile sampling and meshing before changing performance behavior. Investigate
feature-preserving mesh decimation, estimated triangle counts on a quality slider,
and measured estimate error against actual generated counts. Design a cleaner
modal-based export workflow. Preserve print-critical dimensions, small features,
wall thicknesses and fit clearances, with geometry and physical-print verification.
This cleanup does not implement the export redesign.

## Manual browser acceptance — 2026-11-08

User passed competing-tab refusal, explicit revoke-and-handover with scene
preservation, and reconnect after closing the owning tab without revocation.
Revocation during capture and Quest acceptance remain pending.

Revocation follow-up: after the user revoked access, both `scene_summary` and a
`create_primitive` attempt returned `agent_access: Approve connection in the active
editor first.` No modelling command was admitted. This verifies disconnected read/
write refusal, not revocation of an already-running capture.

Read-only manual acceptance (2026-11-08): first attempt was invalid because the
user had left Allow editing on; the admitted 10 mm test box was immediately undone.
After the user corrected the switch, scene_summary succeeded, create_primitive
returned `agent_access: Read-only connection. Enable editing in the browser.`,
and the follow-up summary retained revision `72330570-7955-4dfd-bbf7-de1b05deea04:13`
and four objects. Read-only read/write separation passed; no permission defect
was demonstrated.

Proposal rejection manual acceptance (2026-11-08): user rejected the staged
rename proposal. get_proposal returned `rejected/error`; attempted application
returned `permission_denied: Explicit browser proposal approval required.`
The scene remained at revision `72330570-7955-4dfd-bbf7-de1b05deea04:13`, four
objects, with Outline demo box 1 retaining its original name. Rejection passed.

## Phase 7.5.2 export correctness

Explicit desktop session sizing: 1:1 default, casual target 200 mm, deliberate
100 mm retained; consistent STL millimetres / GLB metres. Pre-encoding evaluated
bounds/scale/quality summary and reference STL display-normalisation explanation.
No confirmed primitive substitution defect; original-holder comparison remains
pending. See [investigation](PHASE_7_5_2_EXPORT_CORRECTNESS.md).
Larger export modal, feature-preserving decimation, triangle estimates and
performance optimisation remain in the future export phase.

### Export detail follow-up

Implemented tighter staged analytic bounds, empty dense-layer exclusion and an
optional256³ export maximum;192³ stays default. Actual evaluated resolution is
reported. Viewport/Bake/native limits and final format safety admission remain.
Dense models can now hit final limits because more grid samples cover their actual
features. The historical detailed-house fixture is an explicit-refusal regression
under the new layout (unchanged intermediate meshing ceiling), not a current successful export claim. Feature-preserving
decimation, performance improvements and modal redesign remain deferred.

### Polygon efficiency benchmark — 2026-11-09

Current High already performs global planar one-ring simplification. More global
passes on the disposable holder reduced High by6.02% at192³ and8.48% at256³,
with7–11 s candidate global compaction in single Node runs. No automatic extra
passes shipped. Next investigate whole-planar-patch boundary/hole reconstruction
and constrained retriangulation with geometry/memory/cancellation proofs, then
benchmark before changing defaults. [Evidence](PLANAR_EXPORT_BENCHMARK.md).

### Implemented: exact planar-region simplification in High

High now reconstructs supported exact axis-aligned patches across prepared chunk
boundaries, with holes and seam vertices retained. Holder reconstruction reductions
versus previous High:8.76% at192³,12.24% at256³. Unsupported/painted/curved regions
are retained and all admission/cancellation guards stay active. See
[implementation and verification](PLANAR_EXPORT_SIMPLIFICATION.md). Arbitrary-plane
and feature-preserving curved decimation, performance profiling, triangle estimates
and export modal redesign remain deferred.

Planar-region final acceptance:1,662/1,662 full checks passed; real browser worker
cube29,292 →18,132 triangles with unchanged bounds/Undo, plus sizing/GLB/failure
checks passed. Physical/Quest acceptance and broader arbitrary-plane cases remain
separate; no hardware performance claim.

### Export lifecycle correction

Confirmed and fixed unrequested blur/hidden export cancellation. Export continues
through focus changes; true lifecycle interruptions retain a cause, and only
Cancel/Escape are user cancellations. Disposable browser lifecycle regression
passed High unified download and Undo preservation. Real freeze/OS-background/
Quest scheduling acceptance remains separate.

### Arbitrary-plane High export

Implemented connected oblique-region simplification with fixed-plane round-off
bounds and strict seam/hole/local/world-bound retention. Curvature beyond that
allowance is rejected. Existing budgets, cancellation and local cleanup tolerances
remain. Rotated-holder benchmark:5.11%/9.14% fewer triangles than an axis-only
reference at192³/256³. Browser rotated cube:45.46% fewer versus Fast, matching
bounds/Undo. [Verification and limits](ARBITRARY_PLANE_EXPORT.md).
General curved-surface decimation, performance work, triangle estimates and modal
redesign remain separate work.

Final2026-11-09 handoff verification supersedes earlier permission-limited runs:
1,667/1,667 full checks and final MCP/export/lifecycle browser checks passed.
See the latest Development Status handoff for scope and remaining hardware gates.
