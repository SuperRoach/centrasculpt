# Development Status — Centra Sculpt / vrappPOC

Updated 2026-11-01. **Phase 5.3 host implementation verified; physical Quest 3 acceptance PENDING.**

## 1. Current scope and working tree

Active repository: `/Users/brettjames/development/vrappPOC`, `SuperRoach/centrasculpt`. Existing uncommitted Phase 5.1/5.2 work preserved. No commit, push or merge performed or authorized. Current status and Phase 5.2 results were read before editing; baseline strict TypeScript, Vite build and **1,254/1,254 tests** passed. Previous handover: [baseline copy](../outputs/phase-5-3/phase-5-2-handover.md). Original tracked diff preserved at `/tmp/vrapp-phase53-baseline.patch`.

Phase 5.3 implements STL reference assets, explicit millimetre binary STL export and printability reports. See [implementation, evidence and limits](PHASE_5_3_PRINTING.md).

## 2. Architecture and invariants

STL references extend existing independent display assets and desktop/VR placement controls, with solid/wireframe/opacity, visibility/lock and workspace/sculpture anchors. Native v9 embeds original STL bytes and metadata through library/portable/recovery paths; versions 1–8 remain readable. Reference meshes never become SDF layers and are excluded from sculpt exports. Geometry/material disposal uses existing reference lifecycle paths.

STL export shares guarded cooperative snapshots and worker cancellation/progress with GLB. Final model transforms are converted to explicit longest-dimension mm sizing; navigation scale is excluded. Selected part, visible separate shells and fresh Boolean composition are distinct. Capped Boolean output is rejected. Final Float32 geometry is checked before download; errors block and warnings require confirmation. Source history/SDF are unchanged.

The Phase 5.2 two-chunk / 3 ms scheduler and staged Paint refresh remain unchanged. No new SDF engine, implicit resolution reduction or convert-to-SDF.

## 3. Latest verified results

| Check | Actual result |
| --- | --- |
| `npx tsc --noEmit --strict` | PASS |
| `npm run build` | PASS; existing bundle-size advisory |
| `npm test` | **1,274/1,274 PASS**, no failures/skips/cancellations |
| New deterministic tests | **20** parser, scale/binary bytes, topology, native/recovery, rendering/disposal, real worker, stale/cancel, groups/Boolean/exclusions, VR routing |
| Live desktop browser | Real worker export/report/confirmation/download action; **31,536 triangles, 100 × 100 × 100 mm**, zero edge/winding/degenerate issues |
| `git diff --check` | PASS |

[Logs, raw benchmark and browser screenshot](../outputs/phase-5-3/). Existing controller, Paint/Mask, Tubes, Groups, GLB, legacy native and recovery suites pass. Browser smoke testing did not restore/discard existing recovery data.

## 4. Measured host evidence

Single Node/macOS Standard STL encode + validation observations: **2,136 triangles / 19.56 ms (17³)**; **7,560 / 44.01 ms (32³)**; **31,536 / 137.66 ms (64³)**; **128,304 / 576.94 ms (128³)**. All have closed edges and 100 mm dimensions. **192³ / 290,352 source triangles was rejected by memory admission**, with no detail reduction. UI available memory can reject sooner than the benchmark's full 256 MiB budget.

Import limits: 6 MiB and 100,000 triangles/file; six total references, 12 MiB embedded assets, 200,000 aggregate mesh-reference triangles. STL validation: 300,000 triangle ceiling plus conservative memory admission. The 128³ export exceeds the smaller import quota; raw benchmark records that parse-back rejection. These are component costs, not Quest frame/GPU measurements.

## 5. Limits and physical acceptance

**All real Quest 3 acceptance remains PENDING.** [Full checklist](PHASE_5_3_PRINTING.md#phase-54--full-vr-acceptance-and-release-candidate) covers both hands, Studio/Passthrough, input ownership, lifecycle, tools, quotas, native/recovery, cancellation, downloads, slicer dimensions and sustained memory/frame behavior. Carry forward Phase 5.1/5.2 backlogs.

No self-intersection, vertex-only manifold, minimum-wall-thickness or shell-nesting algorithm; no promised slicer success or automatic repair. Inward shells warn because cavities may be intentional. Reference parsing/geometry setup is bounded but synchronous and needs headset profiling. Exact welding does not heal numerical seams. Export sizing is per operation; optional width/height/depth entry and project-wide physical units are not implemented. Browser permissions may suppress a companion JSON download; report remains visible. Convert-to-SDF deferred.

## 6. Roadmap and references

Next: **Phase 5.4 Full VR Acceptance and Release Candidate**, including real Quest 3 checks above and retained Phase 5.2 profiling. Address measured failures before declaring release acceptance.

[Phase 5.3](PHASE_5_3_PRINTING.md) · [Phase 5.2](PHASE_5_2_PERFORMANCE.md) · [Phase 5.1](PHASE_5_1_PROJECT_BROWSER.md) · [Historical decisions](DEVELOPMENT_HISTORY_2026_10_31.md). Prior commit permissions remain superseded; no commit/push/merge authorized.
