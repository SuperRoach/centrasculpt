# Phase 8.3b.14 — Byte-capped bulk Undo mesh cache

2026-11-12 (Australia/Melbourne). Follow-up to the
[bulk Undo WebGL comparison](SPARSE_SDF_BULK_RENDERER_RESULTS.md).

## Fixture

Three runs per policy restore the same fully erased metre branch,
with 1 mm exact pages and 461,818 final triangles. The comparison uses
the same headless Chromium fixture, synthetic 60 Hz camera requests
and draw-submission metrics as 8.3b.13.

The cache holds only the latest erase revision and requires the complete
CPU mesh to fit. It charges distinct position/normal backing buffers
and shares them with the original mesh during capture. Erasing disposes
the displayed geometries. Successful Undo consumes the cache entry and
wraps the retained arrays in new geometries for draw. The cached bytes
exclude directory overhead, CPU object wrappers and GPU allocations.
A refused capture retains zero buffers and the progressive path
rebuilds from the exact field. Tests cover shared backing buffers,
all-or-nothing refusal, stale revision and latest-entry replacement.

The policies are ordinary progressive, a 24 MiB refusal with progressive
fallback, a 40 MiB cache published immediately, and the same 40 MiB
cache with bounded attachment of up to 96 meshes per callback and a
soft 2 ms attachment cutoff. Attachment timing precedes WebGL upload
and draw submission. Final exact field and ordered position/normal
checksums must match across policies.

## Results

Headless Chromium 158 completed all twelve restores with matching exact
field and ordered mesh checksums and 461,818 triangles. Values below are
medians of three trial metrics.

| Policy | Retained CPU buffers | Rebuild frames | First draw (ms) | Full draw (ms) | Frame callback CPU p95 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Progressive | 0 MiB | 190 | 2.60 | 5,131.70 | 2.90 |
| 24 MiB cap, refused | 0 MiB | 190 | 2.50 | 5,136.90 | 2.90 |
| 40 MiB cap, immediate | 31.71 MiB | 1 | 14.50 | 14.50 | 14.50 |
| 40 MiB cap, batched | 31.71 MiB | 16 | 1.20 | 412.20 | 1.90 |

The admitted cache retained 33,250,896 bytes in every trial. Median
capture was 0.4 ms for immediate and batched policies. The refusal
retained zero bytes and used the exact progressive fallback in all
three runs. Immediate attachment and draw took 13.5–14.8 ms in a
single callback. It completed before the first scheduled camera
request, so the fixture recorded zero camera samples for this
variant. Median trial camera scheduled-to-draw p95 was 74.30 ms for
batched publication and 70.43 ms for progressive.
The timer and browser callback cadence contribute to these measures.

The result measures CPU backing bytes and WebGL draw submission.
Renderer object overhead, GPU memory, pixel presentation and headset
performance remain unverified. The immediate callback already
exceeds the 11.11 ms duration of a 90 Hz slot in this desktop fixture.

## Decision

**Carry the batched latest-Undo cache as a research candidate with
progressive fallback. Production 8.3c stays gated.** It restores the
whole branch substantially sooner than progressive extraction and
keeps callback CPU short, at a 31.71 MiB retention cost in this case.
Immediate restore remains an option for a separate frame-budget test.
Before choosing a device cap, compare the cache against the fallback
with foreground or headset pacing and measure total CPU/GPU residency.
Keep the single-entry lifecycle tied to the owning Undo revision.

Focused tests passed 58/58 and quick tests passed 21/21. Full check
passed format, lint, strict types and build, then 1,752/1,757 tests
passed. Five loopback tests hit sandbox `listen EPERM`.

The [Quest memory profiling fixture](SPARSE_SDF_QUEST_FIXTURE.md#bulk-undo-memory-profile)
adds cache-off and 40 MiB device runs with PSS and GPU sampling.

## Reproduce

```sh
node scripts/benchmark-bulk-undo-renderer.mjs work/paced-renderer/bulk-cache.html work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json --cache
npm test -- latest-undo-mesh bulk-revision dirty-chunk-queue narrow-band dense-growth history-project
npm run test:quick
npm run check
```

Open the generated HTML or use local headless Chromium with WebGL enabled.
Select **Run bulk Undo comparison** and download the report after PASS.
Allow at least 120 seconds in an automated wait. Raw results are in
`work/paced-renderer/bulk-cache-report.json`.

## 2026-11-12 Native Undo parity check

A research-only test exercises the app's normal subtract stroke,
Undo, and Redo on a compact 41-sample-per-axis volume. It captures
production chunk buffers before the stroke and compares the consumed
cache entry byte for byte with the actual Undo output. The test
rebuilds a separate production chunk surface from the cached buffers
in batches and compares spatial-index ray candidates. It also checks
exact voxel Undo/Redo and that a stale revision cannot consume the
cache. Run `npm test -- undo-cache-app-parity latest-undo-mesh bulk-revision`.

The app currently invalidates the mesher as history replays, rebuilds
its internal geometry, and publishes those updates to the chunk
surface and spatial index. A live opt-in needs one coordinated install
into both the mesher and render surface. It also needs to invalidate
the snapshot when the owning history entry or layer runtime changes.
This parity check establishes the buffer compatibility for the tested
stroke. It does not exercise a live cached Undo, the app's composite
path with the cache installed, or immersive frame timing.

**GO for a scoped integration trial. NO-GO for default enablement.**
The first live trial should target only the latest eligible voxel Undo
on an unmodified layer runtime, decline oversized or stale snapshots,
and retain ordinary remeshing as the fallback. Keep the separate sparse
storage decision gated. Device evidence is in
[Quest panel results](SPARSE_SDF_QUEST_FIXTURE.md#2026-11-12-dedicated-renderers-per-cache-policy).

## 2026-11-12 Native Undo integration trial

The Node trial calls the editor's normal stroke, Undo, and Redo entry
points on a synthetic 65-sample-per-axis sculpt. The cache variant
keeps the pre-stroke mesher and uses its existing edit fork for the
stroke. On an eligible Undo, the trial intercepts the runtime's
rebuild call, installs the original mesher, republishes its surface
and spatial index, and disposes the edited fork. The editor still
replays exact history and invalidates its composite. The tested
stroke stays on its original lattice.

Five alternating pairs reproduced exact field and ordered occupied
mesh checksums after Undo and Redo. Ordinary Undo had a median
of 8.75 ms (8.57–11.98 ms). The cached path had a median of
0.75 ms (0.48–0.96 ms), plus 0.07 ms median capture setup.
The original mesher owned 2,242,080 bytes of geometry buffers.
The budget counts geometry buffers and excludes layout objects,
allocator overhead, and GPU residency.

A one-byte budget refused the snapshot and fell back to ordinary
remeshing. A second committed stroke made the snapshot stale and
the trial used ordinary Undo. Cancel restored the original field
and geometry and added no Undo entry. Those cases released the
original mesher after transferring ownership of still-shared geometry
back to the active fork.

This is a research harness that intercepts one rebuild on a synthetic
project. The timing measures synchronous Node work. It leaves the
live editor option pending and provides no Quest frame, upload, or
peak memory evidence. A default-off editor trial needs lifecycle
ownership across arbitrary runtime changes, including growth,
project replacement, and disabling the option. Track retained bytes
against the editor's existing transient memory accounting.

```sh
mkdir -p work/paced-renderer/native-undo
npx --no-install esbuild scripts/research/undo-cache-native-trial.mjs --bundle --platform=node --format=esm --packages=external --outfile=work/paced-renderer/native-undo/trial.mjs
node --max-old-space-size=384 work/paced-renderer/native-undo/trial.mjs work/paced-renderer/native-undo/report.json
```

The measured report is in `work/paced-renderer/native-undo.cRJjxh/`.

## 2026-11-12 Default-off editor trial

In the Layers panel, expand **Experimental** and enable **Cache the
latest sculpt Undo (up to 40 MiB)**. Make a sculpt stroke and use the
normal Undo button or shortcut. During this initial opt-in trial, the option started off on a fresh
editor load. During the same session it carries across project opens,
with each project starting with an empty cache.

The controller holds one pre-stroke snapshot tied to its owning Undo
entry and exact runtime, mesher, and volume identities. Eligible Undo
replays normal voxel history and uses fresh Three.js attributes backed
by the original immutable mesh arrays for dirty chunks. Mesher
accounting, surface updates, and composite invalidation use the normal
publication path. Redo uses ordinary remeshing.

The snapshot is refused above 40 MiB or when it cannot fit the
existing transient budget. Its geometry payload is counted in the
editor's tracked memory. A new stroke or intervening committed edit,
disable, cancellation, lattice growth, layer deletion, or project
disposal releases the snapshot. Projects and recovery serialize the
normal exact state and history without this transient cache.

Focused coverage verifies default-off behavior, exact Undo/Redo with
actual buffer reuse, existing-budget refusal, and release on disable,
cancel, growth, and disposal. Live Quest timing and peak memory
remain open. The earlier Quest and Node timings were measured in
their respective research fixtures.

The built editor's headless Chrome smoke test confirmed the checkbox
starts off and can be toggled both ways. The automated brush gesture
hit Clay's sample timing limit under software rendering, so the
buffer-reuse assertion comes from the editor-controller test.
The sandboxed full check passed 1,758/1,763 tests. All 30 tests in
the affected loopback files passed with localhost binding enabled.

## 2026-11-12 Scripted live Quest comparison

Open the Vite development build with `?undoXRReplay=1` and enter VR
once. The fixture waits for a tracked viewer pose. Keep looking at the
temporary sculpt until the usual scene returns, then exit VR to read
the report. Reload the page for another run.

The fixture uses a separate temporary editor and renders it in the
same immersive session. It drives the normal local brush, history,
mesher, Undo, and Redo methods with 48 fixed brush samples and fixed
simulation time steps. Each of four trials starts from a fresh
97-sample-per-axis sphere. Cache order is off, on, on, off.
It checks field and occupied-mesh signatures before and after editing,
Undo, and Redo. The user's project remains outside the trial.

The report includes cache bytes, synchronous Undo CPU time, and the
first and full changed-mesh submission times based on render callbacks.
Full submission is null when a changed chunk stays outside the view
during the measurement window. Submission time does not measure GPU
completion or headset presentation. These timings are specific to the
fixture. The simulated frame test verifies replay and result handling
without providing device timing evidence.

Run `npm test -- undo-xr-replay undo-cache-app-parity` locally.

The tracked Quest 3 run completed at a reported 90 Hz. All four trials
matched field and mesh signatures and submitted all 16 changed chunks.

| Trial | Cache | Undo CPU (ms) | First / full submission (ms) |
| --- | --- | ---: | ---: |
| 1 | Off | 81.9 | 93.0 |
| 2 | On | 25.8 | 34.4 |
| 3 | On | 15.3 | 22.4 |
| 4 | Off | 74.5 | 82.0 |

Median CPU time was 78.2 ms off and 20.6 ms on. Median full
submission was 87.5 ms off and 28.4 ms on. The cache retained
5,303,232 bytes (5.06 MiB) in both enabled trials. This is one
session and two observations per policy. Peak memory and headset
presentation latency remain unmeasured.

Raw report is in `work/paced-renderer/live-undo-xr/quest-report.json`.

The editor now starts with the Undo cache enabled at the project
owner’s direction. The Layers switch can disable it immediately.
The 40 MiB limit and existing transient memory budget still apply.
