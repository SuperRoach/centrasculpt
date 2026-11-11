# Compact sculpt comparison — 2026-11-12

A follow-up to [Phase 8.3b](SPARSE_SDF_83B_RESULTS.md) for everyday Clay and
Smooth work. The fixture builds a compact bust from empty at 1 mm spacing. The deterministic trace has 62 constructive Clay
sweeps, 35 surface Clay strokes, 35 Smooth strokes, Undo and Redo. Four
actions are retained by each backend. All testing uses disposable data.

## Comparison

Both paths use the existing 16-cell incremental mesher and the same
129³ logical bounds. Dense uses production `SDFVolume.brush` and
`SculptHistory`. Sparse uses the 8³ exact Float32 edit pages and 3-voxel
derived cache from the Phase 8.3b prototype. The cache serves sign and
surface reads during meshing. Edits and Undo use exact pages. Sparse has
no dense source, analytic primitives or resident full-grid scratch.
The shared mesher keeps its normal rectangular chunk directory in both runs.

Whole-field Float32 checksums and ordered chunk position/normal checksums
are compared at empty, first dab, blockout, detail, finish, Undo and Redo.
The final bust has 109,432 triangles. Undo changes the exact field. Redo
restores the finished field and surface. Hashing and verification are
outside the timed stroke interval. Replay schedules one edit between
successive rendered frames on the browser path.

| Checkpoint | Dense retained estimate | Sparse retained estimate |
| --- | ---: | ---: |
| Empty | 16.50 MiB | 0.13 MiB |
| First dab | 17.43 MiB | 1.25 MiB |
| Blockout | 23.95 MiB | 11.35 MiB |
| Detail | 24.13 MiB | 10.77 MiB |
| Finish | 24.07 MiB | 10.43 MiB |
| Maximum stroke working estimate | 28.13 MiB | 15.16 MiB |

The finished sparse bust uses 502 exact pages and 582 cache pages. Both
retain 7.51 MiB of CPU mesh buffers. The estimates include dense values and
scratch or sparse exact/cache pages, the common chunk directory, and four
actions of packed dense or page-based sparse history. The working estimate
also includes pending brush history or staged pages, old and new dirty
meshes, and allowances for directory growth and temporary extraction
buffers. This model can overcount memory shared across phases. It does
not measure V8 object sizes, renderer allocation, GPU memory or peak process
RSS. Desktop process snapshots and optional browser JS heap observations
are recorded independently in the raw reports.

## Host CPU replay

Apple M5 Pro, Node v26.8.1, single dense-first paired run.
Times include brush and history publication plus the synchronous dirty
CPU mesh rebuild. Values are p50 / p95 in milliseconds.

| Stroke | Dense | Sparse |
| --- | ---: | ---: |
| Constructive Clay | 19.17 / 28.98 | 83.29 / 123.43 |
| Surface Clay | 11.30 / 12.69 | 52.98 / 56.88 |
| Smooth | 11.45 / 16.60 | 52.88 / 56.77 |
| Undo, one action | 9.80 | 44.37 |
| Redo, one action | 9.89 | 44.04 |

## Physical Quest 3

One dense-first immersive WebXR pair completed at **90 Hz** in Quest Browser
154.1. All seven field and mesh checkpoints matched. These are synchronous
CPU edit + history + dirty mesh timings, followed by the animation callback
interval observed after each edit. Percentiles use nearest rank within each
mode. Undo and Redo each have one observation.

| Stroke | Dense CPU p50 / p95 (ms) | Sparse CPU p50 / p95 (ms) | Dense frame interval p50 / p95 (ms) | Sparse frame interval p50 / p95 (ms) |
| --- | ---: | ---: | ---: | ---: |
| Constructive Clay | 82.9 / 124.2 | 317.5 / 479.2 | 88.18 / 127.99 | 322.18 / 484.05 |
| Surface Clay | 47.7 / 55.4 | 202.1 / 223.7 | 51.28 / 58.90 | 206.23 / 228.84 |
| Smooth | 46.8 / 52.2 | 203.6 / 231.3 | 50.02 / 57.26 | 208.47 / 235.69 |
| Undo | 41.0 | 176.7 | 44.78 | 181.15 |
| Redo | 43.3 | 184.3 | 46.82 | 188.30 |

For Smooth, median brush work was 0.5 ms dense and 3.2 ms sparse. Median
dirty mesh rebuild was 45.8 ms dense and 198.9 ms sparse. The current
sparse reader pays for linear-index decoding and page lookup throughout
meshing, including normal stencils. This comparison measures those costs
together. Both synchronous paths exceed the 11.11 ms frame budget.
The fixture drains all dirty chunks immediately per edit. Centra's
normal scheduling can split work across frames, so these times measure
this replay and its storage paths, and do not establish in-app frame times.

Modeled finished working memory is 57% lower for sparse, and the modeled
maximum stroke working memory is 46% lower. Browser heap readings were
identical coarse readings throughout. Actual process and GPU memory
savings remain unverified. The immersive trace used the same renderer and
geometry in both paths. It excludes the rest of Centra's UI and headset
interaction. There was one on-device pair, with dense run first.

**Dense stays the default for everyday sculpting with this implementation.**
Sparse preserved quality and used fewer modeled bytes on the compact bust.
Its median CPU edit + rebuild time was 3.8–4.4× dense across the three brush
modes. The result identifies meshing as the main performance target for
any future sparse trial.

Raw device evidence is
`work/compact-sculpt/2026-11-11T15-10-54.295Z-browser.json`.
The Mac comparison is in `work/compact-sculpt/trial.json`.
The follow-up `npm run check` passed formatting, lint, strict TypeScript,
build and **1,742/1,742** tests after loopback access was granted.
`git diff --check` passed. Full-check log is `/tmp/compact-sculpt-check.log`.

## Reproduction

Run from the repository root. Bundles and raw metrics go to ignored
`work/compact-sculpt`. The benchmark server listens only on loopback and
writes paired reports to that directory.

```sh
./node_modules/.bin/esbuild scripts/research/compact-sculpt/benchmark.mjs \
  --bundle --platform=node --format=esm --outfile=work/compact-sculpt/benchmark.mjs
node --input-type=module - <<'JS'
import { writeFileSync } from "node:fs";
import { compareCompactSculpts, runCompactSculpt } from "./work/compact-sculpt/benchmark.mjs";
const dense = await runCompactSculpt("dense", { snapshot: () => process.memoryUsage() });
const sparse = await runCompactSculpt("sparse", { snapshot: () => process.memoryUsage() });
compareCompactSculpts(dense, sparse);
writeFileSync("work/compact-sculpt/trial.json", JSON.stringify([dense, sparse], null, 2));
JS

./node_modules/.bin/esbuild scripts/research/compact-sculpt/browser.mjs \
  --bundle --format=esm --outfile=work/compact-sculpt/browser.mjs
cp scripts/research/compact-sculpt/index.html work/compact-sculpt/index.html
node scripts/research/compact-sculpt/serve.mjs
```

With the server running, use a USB-connected Quest in developer mode.
Open the loopback page and select **Enter VR and run**. The mode
starts an immersive WebXR session and renders dirty mesh updates as the
trace runs. The page ends the session and offers a JSON download after
the paired trace and parity checks. Keep the headset awake during the run.

```sh
adb reverse tcp:4179 tcp:4179
adb shell am start -a android.intent.action.VIEW -d http://127.0.0.1:4179/ -p com.oculus.browser
```

The browser **Order** selector supports alternating which backend runs
first. Browser reports include CPU edit and remesh timings and the WebXR
animation interval after each stroke. Animation intervals measure callbacks
seen by the test. They do not expose GPU time or compositor missed frames.
