# Phase 5.2 — Quest 3 Performance Optimisation

2026-11-01. Host implementation and measurements; **all physical Quest 3 results PENDING**. STL remains Phase 5.3.

## Baseline and evidence boundaries

Active checkout `/Users/brettjames/development/vrappPOC`, uncommitted Phase 5.1 on main. Read both the six-part status and Phase 5.1 completion document before editing. The original handover is copied to `outputs/phase-5-2/phase-5-1-handover.md`; a tracked-file baseline patch was saved outside the repository at `/tmp/vrapp-phase52-baseline.patch`. Existing changes were retained. No commits, pushes or merges. The initial full suite actually contained **1,249 tests**, not the handover's 1,248; strict TypeScript and production build also passed.

Evidence lives in `outputs/phase-5-2/`. Node v26.8.1, macOS CPU measurements; fake-indexeddb tests transaction semantics, not Quest disk latency. Reference bitmap decoding is stubbed in the host reference fixture. Renderer uploads, optical mesh lag, real controller timing, browser memory, Passthrough composition and thermal throttling are not measured by Node. Independent host processes may compete for CPU; timing samples are observations, not guaranteed improvements. Repeat serially on an otherwise idle host for comparisons.

## Changes and why

- **First paint attributes allocate per admitted chunk**, rather than allocating every chunk before the first deadline check. Chunks awaiting color attributes use the existing base color via Three's default vertex attributes. Sampling still advances in 128-vertex slices, finishes in-flight passes and revisits newer paint. One allocation/chunk and at least one sample slice remain indivisible; this is an admission budget, not a hard deadline. Exact completed color arrays match the frozen baseline at 64³/128³/192³.
- **Settled paint refresh skips unchanged chunk traversal** using volume, group, surface revision, paint revision and base-color guards. Geometry replacement, paint/erase/undo and base-color changes invalidate it. No SDF, normals, history or binary codec changes.
- **Partial paint uploads declare component ranges**. A 128-vertex slice requests 384 color components rather than the entire attribute on subsequent WebGL updates. Initial buffer creation still uploads its complete chunk. This is an upload-range reduction verified structurally, not a measured GPU speedup.
- Move preview retains the original material's default vertex attributes, including base-color fallback while paint is pending. Mask shader defaults remain intact. Cached materials still use their existing lifetime/disposal rules.
- Bounded, opt-in `window.centraPerformance` capture records callback intervals, CPU/input percentiles, queue age, dirty/replay counts, growth counters, brush/remesh summaries, source/mask/paint/history/staging bytes, paint/mask attribute bytes and renderer calls/geometries/textures. CPU measurement now begins before lighting/reference/menu synchronization. Existing full sculpt CPU-gap accounting is unchanged.

The Phase 3.7 **two-chunk / 3 ms** scheduler is unchanged. A 60-sample overlapping Clay path at all three resolutions compares synchronous, one-chunk and two-chunk scheduling with exact final voxel, mesh position and normal arrays. One-chunk scheduling has a longer trailing queue. No geometry/stamps are discarded and no SDF detail is reduced.

## Reproduce host evidence

Run sequentially from the repository:

```sh
npx tsc --noEmit --strict
npm run build
npm test
node scripts/benchmark.mjs outputs/phase-5-2/current-sculpt.json
node scripts/benchmark-phase52-clay.mjs
node scripts/benchmark-paint-refresh.mjs
node scripts/profile-phase52.mjs
node scripts/benchmark-phase52-lighting.mjs
node scripts/stress-session.mjs outputs/phase-5-2/stress.json 320
git diff --check
```

The frozen pre-change paint implementation is `scripts/fixtures/phase52-paint-baseline.mjs`. A/B uses identical sphere geometry and paint, an expired first deadline to isolate allocation admission, full completion, 200 warmup calls and 1,000 settled calls. First-update timing is one observation, not a percentile. The original pre-change core sculpt benchmark is `baseline-sculpt.json`.

The workload runner adapts existing fixtures and redirects their results without overwriting historical evidence. It covers advanced brushes (including Smooth, Pinch and Crease), Continuous Stamp, Elastic/Non-Elastic/rotational Move with actual Node workers, expanded volumes, grouped-layer duplication/transforms, masks, paint, Tube evaluation, references, Turntable, project library, GLB and recovery. Main resolution loops use 64³/128³/192³; secondary scenarios retain their fixture-specific sizes. Lighting sync is resolution independent. The 192³ expanded-editing fixture records a rejected extra stamp at the existing staging/history memory limit (see its JSON); successful process exit does not mean every attempted operation was admitted. These are component workloads, not a unified rendered complex-scene frame benchmark. Native serialization/recovery verifies bytes; group transforms verify source/geometry identity. See each JSON's scope and sample counts before comparing tails.

## Measured results

| Resolution | First paint update baseline → candidate (ms) | Initial color bytes baseline → candidate | Settled p95 baseline → candidate (ms) |
| --- | ---: | ---: | ---: |
| 64³ | 1.766 → 0.278 | 1,135,296 → 14,328 | 0.002500 → 0.000250 |
| 128³ | 5.686 → 0.101 | 4,618,944 → 48,312 | 0.002083 → 0.000250 |
| 192³ | 6.092 → 0.106 | 10,452,672 → 6,264 | 0.003583 → 0.000209 |

| Resolution | Existing two-chunk p50 / p95 / p99 / max update (ms) | Drain updates: one / two chunks |
| --- | ---: | ---: |
| 64³ | 2.44 / 3.18 / 3.56 / 3.56 | 7 / 3 |
| 128³ | 2.28 / 3.72 / 4.36 / 4.36 | 37 / 13 |
| 192³ | 2.53 / 4.39 / 7.65 / 7.65 | 98 / 32 |

The 320-cycle stress fixture also exercises stamps, layer churn, Undo/Redo, Bake, eleven loads, twelve async Moves, real worker termination and recovery/export. It is an accelerated host test, **not** a long headset session or proof of no GPU leaks. See `stress.json` for actual memory stages and timer stalls. Synchronous growth, history work, source hydration/native validation, and indivisible chunk extraction remain bottlenecks. They were not moved into new workers without evidence that a safe atomic design would improve the complete interaction. Existing worker/cancellation/atomic publication paths remain covered by the full suite.

## Quest 3 capture — every result PENDING

1. Use an isolated test project/library and portable backup. Record build, Quest OS/browser, refresh rate, Tool Hand, Studio/Passthrough, battery, power connection, reference image count/dimensions and layer counts. Keep settings identical between baseline and candidate. Warm up five minutes; repeat each case three times, alternating build order.
2. Enable **Show VR performance** so brush/remesh instrumentation is enabled. In the browser's remote developer console run `centraPerformance.start('192-clay-studio-right-run1')`. Run one workload for 60 seconds, then let dirty/replay queues drain. Capture with `copy(JSON.stringify(centraPerformance.snapshot(), null, 2))` in DevTools and save the clipboard as JSON. `centraPerformance.stop()` stops collection; XR exit also stops it while retaining results. Restart capture for each case. No automatic upload occurs. For save/open/export browser handoffs, start a separate capture after XR exit; desktop rows are explicitly labelled and input samples are unavailable. CPU timing ends after render and excludes capture-summary overhead.
3. Repeat at **64³, 128³ and 192³**: idle sphere; overlapping Clay (radius .22, strength .35, hardness .5); Smooth and each advanced brush; Continuous Stamp; Elastic and Non-Elastic Move including release reconstruction/cancel; first Paint, continuing Paint/Erase, masks and Undo/Redo; grouped transformed layers and growth beyond original bounds; Tube point/radius edits; reference images; all three lights; Turntable; save/recovery; switch/duplicate projects; each GLB quality. Include an eight-layer assembly with nested groups and embedded references at a resolution admitted by the existing memory limits. A rejection is a result to record, not permission to lower detail silently.
4. Record p50/p95/p99/max interval, CPU and input times, sample counts, pending chunks/replay, queue-drain time, growth spikes and memory/GPU-resource trends. Capture uses rolling **240-frame/operation** windows and at most **1,800 one-second rows**. Its dirty-queue age measures time since a continuously nonempty queue began, not per-stamp latency. Film the controller/tool cursor and visible mesh together to assess actual visual lag; record observed lag separately. Do not relabel Node or callback measurements as photon latency or GPU time.
5. Repeat both Tool Hands, Support-trigger alternate action, Studio and real Passthrough. Check original geometry, color/masks, transforms/groups, Tube editing, reference pixels and lighting, native/recovery reopen, GLB output, cancellation on menus/tracking/session loss, neutral-trigger rearm and no accidental strokes. Inspect first-paint fallback and Move during an incomplete paint refresh optically.
6. For **30–60 minutes**, repeat paint/sculpt, Undo/Redo, open/duplicate/switch, reference replacement and GLB exports. Export captures every 20 minutes. Compare settled tracked bytes, heap when available, geometries/textures and pending jobs after returning to the same scene. Expected renderer caches may remain; a growing plateau needs investigation. Test sleep/resume and cancelled open/reconstruction. Stop and restart capture after interruptions to avoid treating a suspended interval as an active frame.

No physical FPS, thermal, memory plateau or responsiveness improvement is claimed. GPU duration queries are not implemented; renderer counts are available only when the app runs with a renderer. Host tests cannot establish optical presentation or physical controller acceptance.

## Follow-up and acceptance

Host build/tests and the narrow paint A/B are complete; physical acceptance and rendered whole-system timing remain pending. Use the measured growth/hydration/chunk stalls and actual headset queue behavior to prioritize the next safe change. Avoid interpreting tiny idle CPU savings as a complete performance solution.

Next roadmap: **Phase 5.3 Production Export and 3D Printing Pipeline** — STL reference mesh import, millimetre-scaled STL export, manifold/watertight print validation — then **Phase 5.4 release acceptance**. No STL implementation was started here.
