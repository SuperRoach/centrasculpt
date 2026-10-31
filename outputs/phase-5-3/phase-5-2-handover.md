# Development Status — Centra Sculpt / vrappPOC

Updated 2026-11-01. **Phase 5.2 host implementation verified; physical Quest 3 performance/acceptance PENDING.**

## 1. Current scope and working tree

Active repository: `/Users/brettjames/development/vrappPOC`. TypeScript, Three.js, Vite/WebXR. Existing Phase 5.1 Project Browser changes remain uncommitted on `main`, alongside Phase 5.2. No commit, push or merge is authorized. Preserve the whole working tree.

Phase 5.1's actual handover was inspected before editing; physical acceptance was already pending. Baseline strict TypeScript/build passed and the actual suite was **1,249/1,249**, versus 1,248 in that handover. Its six-part status is preserved in [the baseline copy](../outputs/phase-5-2/phase-5-1-handover.md), with [Phase 5.1 details](PHASE_5_1_PROJECT_BROWSER.md) unchanged.

Phase 5.2 adds bounded XR performance capture, stages initial Paint attribute allocation, skips settled Paint traversal and uses partial color upload ranges. Phase 5.3 STL work has **not** started.

## 2. Architecture and invariants

Source-local SDF, exact geometry/normals, paint/masks, histories, grouped transforms, procedural Tubes, native versions 1–8 and GLB semantics are retained. The Phase 3.7 **two-chunk / 3 ms admission scheduler and full CPU-gap accounting are unchanged**. No detail reduction, discarded brush stamps or engine rewrite.

Paint allocates an admitted chunk at a time, leaving pending chunks at the original base color through default vertex attributes. Move preview preserves those defaults. Completion and revision invalidation are tested. A chunk allocation and 128-vertex sampling slice remain indivisible; the deadline is not a hard bound.

Explicit library saves/recovery remain separate, with existing cooperative snapshots, workers, atomic revision checks and stale-result/cancellation guards. Controller ownership, Support-trigger alternate action, neutral-trigger rearm, Studio/Passthrough, reference presentation and lighting are unchanged. Existing GPU/material disposal paths remain in use. Capture also supports separately labelled desktop frames for browser handoffs; unavailable desktop input timing has zero samples.

## 3. Latest verified results

| Check | Actual result |
| --- | --- |
| `npx tsc --noEmit --strict` | PASS |
| `npm run build` | PASS; existing Vite bundle-size advisory |
| `npm test` | **1,254/1,254 PASS**, zero failures/skips/cancellations; 15.38 s test duration |
| Host workload runner | **13/13 processes exited successfully**; one recorded 192³ staging/history memory-limit rejection |
| Scheduler A/B, all three resolutions | Exact final voxels, mesh positions and normals; queues complete |
| Paint A/B, all three resolutions | Exact completed color arrays |
| `git diff --check` | PASS |

New tests cover capture bounds/reset, cached refresh invalidation, partial upload ranges, staged attribute completion, mask defaults and Move fallback. Existing cancellation, Undo/Redo, worker, group, Tube, native/recovery and GLB tests remain passing. [Logs and raw results](../outputs/phase-5-2/).

## 4. Measured host evidence

Node/macOS only; no physical Quest or GPU timing claim. Paint first-update CPU baseline → candidate: **1.766 → 0.278 ms (64³), 5.686 → 0.101 ms (128³), 6.092 → 0.106 ms (192³)**. These are single first-update observations with an expired admission deadline, not whole-frame times. Initial 192³ color allocation falls from **10,452,672 to 6,264 bytes**; remaining chunks allocate later. Total work remains.

Existing two-chunk Clay update p95/max: **3.18/3.56, 3.72/4.36, 4.39/7.65 ms** at 64³/128³/192³. At 192³ the one-chunk candidate takes **98** trailing drain updates versus **32** for two chunks; keep the existing policy. This is scheduler comparison evidence, not a new scheduler speedup.

Host stress: **321 strokes, 24 stamps, 20 layer cycles, 82 Undo/Redo operations, 11 loads and 29 worker jobs**; zero active workers/live threads at completion. Measured wall time **17.98 s**, peak RSS **673.53 MiB**, maximum timer gap **2,276.69 ms** including synchronous setup/validation/GC. These stalls remain material; the accelerated run does not establish long-session memory stability.

[Phase 5.2 evidence, reproduction commands and capture plan](PHASE_5_2_PERFORMANCE.md) distinguish component measurements from missing rendered whole-system results.

## 5. Limits and physical acceptance

**All actual Quest 3 figures are PENDING.** No headset was used. Optical first-paint/Move fallback, actual draw/upload costs, thermal behavior, sustained memory, both hands and real Passthrough still require acceptance. Host references stub bitmap decoding; fake-indexeddb is not device storage. Renderer draw calls/geometries/textures are instrumented but not measured by Node.

Synchronous dense growth, individual chunk extraction, history operations, hydration/native payload copying, IndexedDB clones and old+candidate scene memory remain risks. Paint changes address initial allocation bursts and redundant updates; they do not solve total refresh cost or all sculpt latency. Existing full tests pass, but no universal no-leak claim is made.

Enable Show VR performance, use `centraPerformance.start('case-name')` in remote browser DevTools, perform the workload, then `copy(JSON.stringify(centraPerformance.snapshot(), null, 2))`. Capture retains rolling 240-sample summaries and at most 1,800 one-second rows. Queue age is a backlog proxy, not photon latency. Follow the [full physical checklist](PHASE_5_2_PERFORMANCE.md#quest-3-capture--every-result-pending), including 30–60 minute repeated scene switching and resource trends.

## 6. Roadmap and references

Finish Phase 5.2 physical profiling/acceptance and prioritize remaining measured stalls. Then **Phase 5.3 Production Export and 3D Printing Pipeline**: STL reference mesh import, millimetre-scaled STL export, manifold/watertight print validation. Then **Phase 5.4 release acceptance**.

Retain the Phase 5.1 acceptance backlog. Historical decisions: [archived development history](DEVELOPMENT_HISTORY_2026_10_31.md). Current implementation details: [Phase 5.2](PHASE_5_2_PERFORMANCE.md), [Phase 5.1](PHASE_5_1_PROJECT_BROWSER.md). Do not treat superseded STL recommendations or old commit permissions as current authorization.
