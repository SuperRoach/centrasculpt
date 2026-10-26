# Phase 3.1 — large-sculpture scalability and storage foundation

2026-10-26. Software validation complete; physical Quest 3 acceptance pending. Incoming repository clean at `4a5bbf3386ba701826d695d5b77e065b3e550c36`. No reset, stash, commit, push or merge. Phase 3.0 handover read before edits.

## Architecture and decisions

The authoritative SDF is still a rectangular dense Float32 lattice plus an equally sized brush scratch array (8 bytes/sample). Growth retains original spacing, signed integer lattice origin and exact old Float32 bits. It stages independent storage, validates boundaries and exact copies, remaps history and publishes through existing guards. Limits remain 512 samples/axis, 2×192³ aggregate project samples, eight layers, one million aggregate triangles and 256 MiB conservative growth transient storage. These are admission/accounting limits, not total browser memory guarantees.

Mesh chunks own disjoint cells with inclusive shared samples and gradient halos. Signed chunk keys use floor/ceil relative to the original lattice; IDs remain stable on negative and positive growth. Dirty sample updates cover geometry and normal neighbors; unrelated patches remain separate. The world/layer transform boundary remains outside chunk indexing. Local geometry branches borrow unchanged source buffers until successful Move adoption. History retains exact sparse deltas and one atomic action; oversized latest actions can exceed its 32 MiB soft budget. Bake retains source/output runtimes for replay; obsolete redo runtimes are disposed. The existing Move admission includes candidate, index, patch, history and worker duplication; cooperative fallback and source-kept failure semantics remain.

A sparse authoritative migration is **deferred**: direct dense accesses exist in brushes, growth, project codec, worker snapshots, reconstruction, history validation and compositing. Positive exterior is distance-extended, not a universal constant. Replacing missing chunks with a constant would change interpolation/normals and could change later edits. This phase establishes cheaper empty-region extraction and bounded publication without changing that contract. Persistent dense memory and project-file size have not decreased.

Implemented:

- Extractor scans inclusive chunk samples once, skipping cell extraction for sign-uniform regions, including empty positive capacity and solid interiors. It uses the same machine-roundoff threshold as tetrahedral extraction. Occupancy is recomputed when extracting, so direct writes/history replay cannot stale a cache. No authoritative values are edited.
- One reusable eight-value array per extraction replaces one array per visited cell. Intersection and normal sharing from Phase 3.0 stays intact.
- `BufferAttribute` adopts newly created typed arrays in meshing and flattened exports. `Float32BufferAttribute` previously copied those arrays again. Ownership remains private per geometry. This removes two redundant typed-array copies totaling 24 bytes per vertex per constructed geometry; it is an allocation count, not a measured process peak. For the final 385,092-vertex fixture that is 9,242,208 bytes of cumulative extra copy allocation avoided across chunk construction, not all simultaneously live.
- `rebuildChunks(maxChunks, maxMilliseconds)` checks its deadline between chunks, always making at least one chunk of progress, with invalid-budget rejection. Boolean and staged Bake use eight chunks / 3 ms per batch. Synchronous callers retain complete rebuild semantics; Move already yields after each chunk. A busy individual chunk and spatial-index rebuilding remain non-preemptible.
- Mesher disposal clears chunk/lookup/borrowed references and accounting after disposing owned geometry. `ChunkSurface.clear()` clears its private mesh map, group and spatial index. Layer disposal and successful/aborted Move cleanup use it. Borrowed source geometry is never disposed by a cancelled branch.

## Reproduction and actual measurements

Run from the repository root, using its installed dependencies:

```sh
node scripts/benchmark-scalability.mjs outputs/phase-3-1-before.json --baseline
node scripts/benchmark-scalability.mjs outputs/phase-3-1-after.json
node scripts/benchmark-scalability-pipelines.mjs --baseline
node scripts/benchmark-scalability-pipelines.mjs
npm test
npm run test:worker
npx tsc --noEmit
npm run build
git diff --check
```

The scripts pin baseline source to the incoming revision above and compile it into ignored work directories. The core baseline restores the old mesher; pipeline baseline restores all four changed runtime modules. Retained raw reports were measured before/after implementation on this Mac with Node v26.8.1. CPU only: no immersive frame traces, GPU measurements, process/RSS peak measurements or physical Quest tests. Buffer accounting excludes JavaScript objects, temporary number arrays, GPU duplication, derived CSG and allocator overhead. Do not interpret it as device memory availability.

Core fixtures: one warm-up plus three timed runs, median below; raw runs in `outputs/phase-3-1-{before,after}.json`. Full time excludes volume preparation and includes chunk extraction. Local time includes a radius .12 subtract brush at (.8,0,0), invalidation and remeshing; the empty fixture is a no-op. Eight-layer fixture exercises eight independent volume/mesher pairs; the separate pipeline fixture uses actual layer runtimes.

| Fixture | Full ms before → after | Local ms before → after | Final vertices | Dense bytes | Geometry bytes |
|---|---:|---:|---:|---:|---:|
| Empty X-extended, 257×64×64 | 52.09 → 2.69 | 0.059 → 0.046 | 0 | 8,421,376 | 0 |
| Three disconnected islands, same allocation | 80.59 → 24.99 | 4.018 → 2.670 | 62,880 | 8,421,376 | 1,509,120 |
| 128³ sphere (>300k vertices) | 204.94 → 92.16 | 7.570 → 6.881 | 385,092 | 16,777,216 | 9,242,208 |
| Eight 64³ layer fixtures | 266.71 → 180.83 | 78.460 → 71.129 | 756,864 | 16,777,216 | 18,164,736 |
| Three successive X growth requests, ±2/3/4 | 73.32 → 24.52 | 9.879 → 8.986 | 94,608 | 7,372,800 | 2,270,592 |

Dense and retained geometry accounting and vertex counts match before/after. Repeated growth preparation itself is unchanged code; raw times are recorded, not claimed as an optimization. Differences are workload/host observations, not universal speed guarantees.

Pipeline fixtures: **one observation per case**, raw reports `outputs/phase-3-1-pipelines-{before,after}.json`. These have no operation-level percentile confidence. Move uses actual cooperative commits on an initial 384,912-vertex 128³ sphere, radius .2, translation (.02,0,.04) or .15 rad rotation/twist. All modes rebuilt eight dirty chunks; changed-voxel counts and tracked bytes match before/after.

| Operation | Before ms | After ms |
|---|---:|---:|
| Non-Elastic Move wall | 176.79 | 179.23 |
| Elastic Move wall | 275.29 | 272.37 |
| Rotate Move wall | 210.50 | 198.18 |
| Twist Move wall | 194.11 | 212.65 |
| Eight-layer save | 42.90 | 44.47 |
| Eight-layer load | 22.05 | 22.31 |
| Boolean sampling CPU | 183.01 | 190.71 |
| Boolean meshing CPU | 302.23 | 118.10 |
| Boolean elapsed | 682.57 | 513.28 |
| Bake sampling CPU | 128.12 | 135.67 |
| Bake meshing CPU | 195.54 | 93.36 |
| Bake wall | 434.12 | 352.27 |

No material Move or codec speedup is claimed. After-run Move observed maximum cooperative slices range 3.98–5.26 ms despite the 3 ms target. Estimated Move peaks remain approximately 49.8–49.9 MB, not measured total peaks. Eight-layer file stays 8,392,088 bytes and tracked source/runtime buffers 34,941,952 bytes. Boolean uses 147³ samples, 1,000 chunks and 138,128 triangles; Bake uses 128³ and 103,328 triangles. Their output counts/spacing match baseline; smaller meshing batches add yields, so lower CPU does not imply proportional elapsed improvement.

## Validation and failure recovery

Incoming full suite: 670/670. Final: **676/676**, zero failures/skips; **89/89 actual-worker contracts**. TypeScript, production build and whitespace checks pass. Existing Vite >500 kB bundle advisory remains (~983 kB main JS). No physical-device, controller or GPU acceptance was performed this phase.

New `tests/scalability.test.mjs` covers deadline progress/exact draining, invalid budgets, deterministic disposal/reference release, one-pass empty extraction and direct-write occupancy freshness, injected gradient failure retaining dirty/source geometry for retry, negative-axis islands matching complete extraction, surface-map clearing/reuse and cancelled-fork borrowed ownership. No timing thresholds are used as correctness assertions. Existing full coverage includes six-axis growth/indices, transformed layers, all free-space brushes/path modes and Stamp, local halo remeshing/normals, source-kept allocation failures/stale candidates, exact history/Undo/Redo, all Move modes, worker/cooperative cancellation, Boolean/Bake, older/native project round trips, controller routing and separate/Boolean GLB export. This is automated software evidence, not fresh physical interaction testing.

## Changed files and handover

- `src/mesh.ts`: sign-uniform extraction prepass, reused cell values, adopted typed arrays, batch deadline, complete reference cleanup.
- `src/surface.ts`: adopted export arrays and explicit surface reference clearing.
- `src/independent-layers.ts`: Bake budget forwarding, layer/Move success/failure surface cleanup.
- `src/compositor.ts`: bounded meshing batches and release of disposed derived cache references.
- `tests/scalability.test.mjs`: six correctness/failure/ownership cases.
- `scripts/benchmark-scalability{,-pipelines}.mjs`: reproducible core and actual runtime baselines.
- Four `outputs/phase-3-1-*.json` raw reports; this guide and `docs/DEVELOPMENT_STATUS.md`.

Known limits: dense grid and dense scratch remain; growth copies/remaps still scan dense storage; empty chunk metadata and empty geometries from initial rebuild still exist. No compressed native format, lazy voxel pages, occupied-chunk persistent cache, local triangle-index construction or streaming GLB was introduced. Flattened mesh/codec paths can still allocate large contiguous arrays. A full chunk, synchronous brush/normal work, JS arrays and BVH rebuild can exceed a frame budget. Dense hard limits deliberately reject some long thin sculptures without lowering detail. Latest history action and Bake retained resources remain soft/unbounded relative to a total browser-memory cap. No new hardware memory/frame claim.

Phase 3.2 plan: first capture real Quest 3 memory/frame/thermal traces for these fixtures and long editing sessions. Then separate scratch storage from authoritative samples with local Jacobi tiles and explicit alias/allocation-failure tests; update every budget/accounting path together. Prototype versioned sparse-page storage behind `VolumeStore`, defining distance-correct missing-page exterior and shared gradient halos, stable signed page indices and dense legacy codec adapters. Migrate direct dense consumers incrementally with differential tests against dense reference for all brushes, transformed layers, Move/worker snapshots, exact history and old files. Add page occupancy revisions only once every write is centralized. Finally investigate localized reconstruction indexing and deadline-aware spatial-index publication; measure end-to-end responsiveness before relaxing limits. Preserve staged validation and synchronous atomic publication throughout.
