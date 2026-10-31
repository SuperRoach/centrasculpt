# Development Status — Centra Sculpt / vrappPOC

Updated 2026-10-31. **Phase 5.1 implemented; physical Quest 3 acceptance PENDING.**

This is the current handoff. Read it first, then follow only the relevant detail links. Keep it to roughly 1–2 pages: replace these six sections when status changes, rather than appending another handover. Put implementation detail in phase documents and historical updates in archives.

## 1. Current scope and working tree

Active repository: `/Users/brettjames/development/vrappPOC`. TypeScript, Three.js, Vite and WebXR; Quest 3 is the primary target, with desktop parity.

Phase 5.1 adds a shared VR/desktop Project Library: named New with resolution/starter choices, recent projects, details, Save/Save As, rename, independent duplicate, confirmed delete, native import/download and dirty-work protection. Header save and Cmd/Ctrl+S now save to the browser library. Existing GLB/Recovery browser handoffs remain.

**Phase 5.1 changes are uncommitted on `main`.** Preserve existing changes and inspect Git status before editing. No commit, push or merge is authorized for this work. This documentation consolidation changes no application code.

## 2. Architecture and constraints to preserve

- Source-local SDF volumes remain authoritative; retain masks, paint, procedural spline sources, hierarchy and self-contained reference-image assets. Native `.form` versions 1–8 remain supported. Do not change the SDF/history representation or remesh scheduler casually.
- Explicit saves use `centra-sculpt-library`: separate IndexedDB metadata/payload stores, atomic writes, revision conflict checks, 100-project / 512 MiB payload bounds, no automatic eviction of explicit saves. Listing and renaming do not load voxel payloads.
- Recovery is a separate database, bounded to three checkpoints / 96 MiB. Restored work detaches from library identity; it must not silently overwrite newer explicit saves. Downloads are separate portable files. The browser does not enumerate arbitrary local filesystem projects.
- Save uses cooperative snapshotting and the existing encoder worker. Open validates in a worker and builds a deferred-mesh candidate before replacing the current scene. Preserve cancellation/stale-result checks, reference-resource disposal and old-scene retention on preparation failure.
- Keep existing Support-stick navigation, Tool-trigger ownership, both-handed controls and neutral-trigger rearm. No sculpting through menus. Retain the preference against persistent floating tool hints; use existing UI scale and Studio/Passthrough treatment.

Details: [Phase 5.1 architecture and workflows](PHASE_5_1_PROJECT_BROWSER.md). Prior context: [Phase 5.0 UX](PHASE_5_0_WORKFLOW.md), [paint](PHASE_4_9_PAINT.md), [groups](PHASE_4_8_LAYERS.md), [masks](PHASE_4_7_MASKS.md), [recovery](PHASE_3_RECOVERY.md).

## 3. Latest verified results

Phase 5.1 baseline: strict TypeScript, production build and **1,215/1,215 tests passed** before code changes. Latest completed validation:

| Command | Result |
| --- | --- |
| `npx tsc --noEmit --strict` | PASS |
| `npm run build` | PASS; existing Vite bundle-size advisory |
| `npm test` | **1,248/1,248 PASS**, no failures/skips/cancellations; 15.55 s |
| `npm test -- project-library xr-menus save-status` | **69/69 PASS** |
| `git diff --check` | PASS |

Live browser checks used the isolated `?recoveryFixture=lab` stores: named save, persistence after reload, duplicate/reopen, last-opened tracking, and Save & Continue into an empty project. Actual XR library/details/keyboard canvases were visually checked on the host. These are not physical headset results.

Evidence: [logs, benchmarks and screenshots](../outputs/phase-5-1/). Reproducible preview: [XR canvas fixture](../scripts/fixtures/project-browser.html).

## 4. Host performance evidence

`node scripts/benchmark-project-library.mjs`, Node/fake-indexeddb, one observation per resolution:

| 64³ / 128³ / 192³ | Measured times |
| --- | --- |
| Atomic payload commit | 1.55 / 2.03 / 4.64 ms |
| 100 metadata lists | 4.49 / 4.23 / 4.32 ms |
| Largest mesh preparation batch | 8.44 / 5.16 / 7.34 ms |

Stored native byte integrity passed. The nominal 2 ms mesh budget is not a hard frame-time bound. Main bundle: 1,255.79 kB / 351.07 kB gzip; library worker: 91.16 kB. [Full benchmark scope and data](../outputs/phase-5-1/benchmark.json). No Quest GPU, thermal or sustained frame-rate measurements are claimed.

## 5. Known limits and pending acceptance

- Project previews are labelled placeholders; actual thumbnails are not generated. Layer/group renaming uses a QWERTY keyboard with Shift, numbers/symbols, Space and Delete; project naming still uses a basic character keyboard. Import pickers/downloads and GLB/recovery review still involve browser handoffs.
- Browser clearing/eviction or OS termination can remove local data. Portable backups remain necessary; `beforeunload` is not guaranteed on mobile.
- Snapshot admission remains 256 MiB. Hydration, allocations, payload copying, IndexedDB clones and initial paint attributes can pause. Opening temporarily retains both scenes; large-project memory and repeated disposal need device profiling.
- Paint supports colour, not per-region roughness/metalness. Existing spatial paint inheritance/Move transport limitations remain; procedural tubes require Bake before painting/masking.
- **All Phase 5.1 physical Quest checks are PENDING**, including both hands, real Passthrough, optical readability, interruption/quota behaviour and sustained performance. Earlier paint feedback does not constitute full release acceptance. Use the [physical checklist](PHASE_5_1_PROJECT_BROWSER.md#quest-3-physical-checklist--all-pending).

## 6. Next work and reference history

Next: **5.2 Quest 3 Performance Optimisation**, then **5.3 Production Export Pipeline**, then **5.4 Full VR Acceptance / Release Candidate**.

Start by profiling the pending physical checklist: snapshot/hydration allocation, maximum chunk cost, IndexedDB cloning and first paint/reference texture uploads. Measure before changing budgets; preserve save/recovery separation and native compatibility.

The previous 1,376-line status file is preserved in the [full historical snapshot](DEVELOPMENT_HISTORY_2026_10_31.md). Consult it only for historical decisions or a specific older feature; its superseded recommendations and past authorizations are not the current handoff.
