# Centra Sculpt roadmap

Implementation and verification are separate gates. Historical results below are
not fresh acceptance runs; consult the corresponding DEVELOPMENT_STATUS.md handover
for counts, evidence and outstanding limitations. No blanket hardware or print
acceptance is implied.

| Phase | Implementation | Automated | Browser | Quest | Physical print |
| --- | --- | --- | --- | --- | --- |
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
