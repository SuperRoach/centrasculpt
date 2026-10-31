# Phase 5.1 — Project Browser and Management

Implemented 2026-10-31. Physical Quest 3 acceptance remains **PENDING**.

## Audited starting point

The clean `main` checkout already implemented Phase 5.0's Project shortcut, guarded XR exit/browser handoffs, New resolution/starter choices, save shortcut, and input ownership. Its handover explicitly deferred further physical validation. Phase 4.9 provides colour painting, not per-region material-property channels. Existing limitations remain in effect.

Before editing, `npx tsc --noEmit --strict`, `npm run build`, and `npm test` passed (1,215 tests). Native `.form` was a download/upload workflow, not an enumeratable local directory. Recovery used a separate IndexedDB database bounded to three checkpoints / 96 MiB. Native versions 1–8 already cover expanded volumes, display and tool preferences, reference image bytes, procedural tubes, masks, painted colour, lighting and hierarchy. Phase 5.1 keeps that codec/schema.

## User workflow

Open **Project** below the Tool Wheel, or **World → Project Library**. Hold the Support stick as for other menus; use the Tool ray/trigger to select. Existing menu ownership, neutral-trigger rearm, handedness, Studio/Passthrough depth treatment and Default/Large scale apply. No new controller mapping is introduced.

The library has three metadata rows per page, sorted by modification time; select a row for name, modification/last-opened time, initial source resolutions, layer count, native byte size and current/source format versions. The diamond/“Preview unavailable” is a placeholder, not an image of the sculpture. No project is decoded to display a list row.

- New: enter a name, choose 64³ / 128³ / 192³ and sphere / empty. The XR keyboard supports A–Z, digits, space, hyphen, backspace and clear; desktop supports normal text input and Enter. Names are limited to 80 characters.
- Save: atomically save the current scene in this browser. Save As creates a distinct library entry without clearing current sculpt history.
- Open/New: unsaved work offers Save & Continue, Discard Edits & Continue, or Cancel. A failed save prevents the replacement. Pending reads and new-scene preparation recheck current edits before publication.
- Rename: metadata-only; does not load or rewrite voxel/asset payloads or alter SDF/history. Native export/open applies the stored name.
- Duplicate: independent native copy with remapped project, source, hierarchy, reference and spline-point IDs; copied binary assets and sparse fields. Does not open or mesh the duplicate.
- Delete: explicit confirmation, revision checked. Deleting the active saved entry leaves current scene contents in memory and marks them unsaved. Downloads and recovery stay separate.
- Import `.form`: validate/migrate in a worker, create a separate saved entry, keep current work open. Select Open when ready. In XR this exits to the browser and requires a fresh click for the picker. No filesystem enumeration or directory access is claimed.
- Download current: a portable native snapshot independent of a successful library write; does not claim local edits have been saved. Download `.form` in details exports that selected saved entry. Browser controls the actual download destination/completion. Export GLB and Recovery retain the Phase 5.0 browser handoffs.

Desktop Project Library uses the same model and confirmations in a modal dialog, normal keyboard buttons, focus outlines and a native text field. The header save button and Cmd/Ctrl+S now save to the browser library; the status explicitly distinguishes this from recovery/downloads.

## Architecture and safety

`project-library.ts` owns `centra-sculpt-library` v1. Separate `records` and `payloads` stores avoid loading native buffers for list/rename. Explicit payload save and metadata update commit in one strict-durability IndexedDB transaction. Failed/quota/aborted writes retain prior data. Compare-and-swap revisions reject stale tab writes and deletes. Last-opened/rename also increment revisions. Capacity is 100 projects / 512 MiB of native payloads; exceeding it fails instead of pruning explicit saves. Optional image data-URL metadata is capped at 32 KiB; this release generates no thumbnails. Browser quota can be smaller than the application bound.

`project-browser.ts` owns library selection/current-entry identity, saved revision key, forms and confirmations, with a shared desktop/XR command surface. Library entry identity is distinct from native scene identity; restored checkpoints and external direct loads are detached, so saving restored/older work creates a new entry rather than silently overwriting an explicit save. Save As does not rebuild the active runtime or reset history. Recovery remains an entirely separate store and never writes the library. Its existing source identity and checkpoint pruning semantics remain unchanged.

`library-codec.ts` rewrites bounded native metadata and copies the binary payload without constructing SDFs or meshes for rename-on-export/duplicate. Embedded references, mask and paint offsets remain payload-relative. Imports use the existing full validator and canonical serializer before metadata rewriting. Invalid imports return structured worker errors; storage errors distinguish invalid data, quota, conflict, missing data and cancellation.

`library-worker*` validates/decodes imports and prepares new projects off the main thread. `project-transfer.ts` transfers validated dense arrays and restores the existing runtime types. Explicit save uses the existing cooperative snapshot and recovery encoder worker, including its 256 MiB admission estimate. Opening creates a deferred-mesh candidate, rebuilds at most two chunks / nominal 2 ms per batch with event-loop yields, and publishes only after completion. Old source meshes/history survive failed decode, cancellation and candidate construction. Successful replacement suspends controllers, clears Move/spline selection and stamp preview, clears reference textures/bitmaps (including pending image decode disposal), disposes old layer runtimes and starts fresh history. Existing disposed/revision guards prevent stale asynchronous tool publication. Active Move/Tube/copy work must finish before replacement is admitted.

Page lifecycle interruption aborts library workers/candidate preparation. `beforeunload` requests the browser's unsaved-work prompt while dirty or busy. This is not a guarantee against process/OS termination. Browser-local projects can be removed by browser data clearing/eviction; keep portable backups. No new dependencies, commits, pushes or merges.

## Verification and measured limits

Logs and screenshots: `outputs/phase-5-1/`. Reproduce the host canvas preview at `/scripts/fixtures/project-browser.html`; this is not a simulated headset acceptance result.

Commands:

```sh
npx tsc --noEmit --strict
npm run build
npm test
npm test -- project-library xr-menus save-status
node scripts/benchmark-project-library.mjs
git diff --check
```

Final strict TypeScript and production build passed. Full suite: **1,248/1,248 PASS**, zero failures/skips/cancellations; focused run: **69/69 PASS**. `git diff --check` passed. Main bundle 1,255.79 kB / 351.07 kB gzip; library worker 91.16 kB. The existing Vite bundle-size advisory remains.

Live app checks used only `?recoveryFixture=lab` (separate test library/recovery names): named Save As, persistence across reload, duplicate, reopen with last-opened update, Save & Continue before creating an empty 64³ project, and Save of the new scene. Actual XR canvas library/details/keyboard were visually inspected; browser warning/error logs were empty at inspection. Host screenshots are `desktop-library.jpg`, `xr-library.jpg`, `xr-details.jpg`, `xr-keyboard.jpg`. The fixture's sample project records are illustrative; actual desktop evidence comes from IndexedDB saves.

New deterministic coverage includes atomic CRUD, metadata-only queries/writes, optimistic conflicts, quota/transaction abort rollback, count/byte limits, thumbnail validation, legacy v1/v2 and current imports, malformed files, rich v8 binary/asset independence and transfer round-trip, recovery isolation, dirty replacement/cancellation, Save As, rename/delete identity, stale asynchronous encoding/read/new preparation, actual worker termination and structured errors, download integrity, deferred meshes, pagination/ray bounds, and both-handed real controller bridge tests. The full suite retains prior masks/paint/groups/references, Move/Stamp/Tube lifecycle, native compatibility and GLB tests. Intermediate test failures were corrected: a stale pre-regeneration tube fixture reference, an assumption about equal-millisecond ordering, and the test's reversed Support-stick axis. No production failure was hidden by removing coverage.

Host Node v26.8.1 with fake-indexeddb, one observation per resolution (not browser disk/GPU/Quest):

| Sphere | Native size | Atomic commit | 100 metadata lists | Native duplicate rewrite | Mesh wall / largest batch |
| --- | ---: | ---: | ---: | ---: | ---: |
| 64³ | 1,049,257 B | 1.55 ms | 4.49 ms | 0.18 ms | 99.80 / 8.44 ms |
| 128³ | 8,389,291 B | 2.03 ms | 4.23 ms | 0.48 ms | 431.24 / 5.16 ms |
| 192³ | 28,312,238 B | 4.64 ms | 4.32 ms | 0.72 ms | 1,478.11 / 7.34 ms |

All benchmark reads matched stored native bytes exactly. Mesh work can exceed its nominal budget because a single chunk and surface upload preparation are indivisible. Transfer hydration, initial allocations, native metadata payload copying, IndexedDB structured cloning and first paint attributes still have synchronous costs. Opening retains old and candidate scenes concurrently; large assemblies still need device memory profiling. No source-meshing regression baseline, GPU frame-rate, thermal result or physical Quest claim is made.

## Quest 3 physical checklist — all PENDING

Repeat in both Tool Hand configurations, Studio and real bright/dark Passthrough, Default and Large UI scale.

1. **PENDING** — Reach Project through Wheel and World; read every row, metadata label, error and confirmation; check rounded panel contrast and optical legibility.
2. **PENDING** — Open with held trigger, select/type with Tool trigger, release Support stick, reconnect controller and swap handedness. No accidental stroke, stamp, tube, grip transform or alternate action.
3. **PENDING** — Create named sphere/empty scenes at every resolution; cancel dirty replacement, save-and-continue and explicitly discard; check exact resulting geometry/history.
4. **PENDING** — Save / Save As / rename / duplicate / delete; reopen after browser restart and verify independent IDs, masks/paint, nested transforms, spline editing, lighting and reference pixels.
5. **PENDING** — Recover an older checkpoint after a newer explicit save; confirm the original library entry is unchanged until the user deliberately opens/saves it. Exercise another tab changing the same entry.
6. **PENDING** — Import legacy/current rich files, malformed/truncated files and large references; export/download and reimport; inspect portable native data on another origin/device.
7. **PENDING** — Quota exhaustion, page hide, tab-close prompt, interrupted save/open and headset sleep during work. Prior saved entry must remain usable; do not rely on a mobile unload prompt after OS kill.
8. **PENDING** — Large 192³ / multi-source scenes: record snapshot latency, peak memory, maximum mesh batch, first texture/paint upload, XR frame spikes, repeated replacement disposal and sustained thermal behaviour.
9. **PENDING** — Verify native browser picker/download handoff and existing GLB/Recovery routes, then re-enter both XR environments.

## Roadmap

**5.2 Quest 3 Performance Optimisation** → **5.3 Production Export Pipeline** → **5.4 Full VR Acceptance / Release Candidate**. Profile allocation/hydration, maximum per-chunk cost, IndexedDB clone cost and first paint/texture upload before changing the meshing scheduler. Actual thumbnails and richer XR keyboard/search are future improvements; this release deliberately uses safe placeholders.
