# Phase 5.3 — 3D Printing Pipeline

2026-11-01. Host implementation and browser export smoke test verified. Physical Quest 3 acceptance is **PENDING**.

## Using the feature

Open **References · Images / STL**, import an ASCII or binary `.stl`, select it, and use Move / Rotate / Size or precise numeric fields. References start locked. They support visibility, solid/wireframe, opacity and workspace/sculpture anchors. They use the existing reference controller-ray placement mode in VR. Workspace anchors follow navigation but not turntable rotation; sculpture anchors follow the turntable. STL coordinates are centred and normalised to a one-model-unit longest dimension for reference display; their original unitless bytes remain embedded unchanged. Reference size is a display placement value, not a print-unit declaration.

Open **3D Print / Export STL** beside the GLB controls. Enter the longest physical dimension in millimetres; aspect ratio is fixed. Export the selected visible layer, visible separate shells, or the current SDF Boolean result. Selected-part sizing uses that part's own bounds; separate exports of several selected parts do not automatically share one assembly conversion factor. Use visible-parts export to preserve the assembled ratios. GLB / STL share the quality selector. Fast preserves triangles; Standard uses existing exact welding/degenerate cleanup/orientation; High also uses the established planar-only optimisation. Repairs/optimisation counts are in the companion JSON report. No source SDF, history or paint changes occur.

Review the report before confirming the download. Blocking diagnostics prevent download; warnings and unsupported checks require an explicit continue decision. STL has no intrinsic units: the binary header, `-mm.stl` filename, UI and JSON report state millimetres. Set the slicer to millimetres. VR Project commands offer **3D Print / Export STL**, exiting XR through the existing safe project handoff before browser interaction. Reference import similarly exits XR and reveals the import panel; click Import there to supply a browser user gesture.

## Architecture and safety

- `stl.ts` validates file size before decoding, exact binary length/count (including `solid` binary headers), complete ASCII facets, finite bounded coordinates/normals and Float32 range. Import: 6 MiB and 100,000 triangles/file; shared six-reference / 12 MiB asset limit; 200,000 aggregate reference triangles. ASCII grammar uses conventional facet lines and supports LF, CRLF and CR line endings. Unusual non-line-oriented ASCII dialects are rejected with a clear error.
- Existing `ReferenceImage` compatibility record now also accepts `model/stl`, with optional wireframe metadata. `ReferenceView` owns separate BufferGeometry/material resources outside SDF, Boolean and GLB/STL source traversal. Existing desktop proxy and controller input ownership apply; mesh raycasts are enabled only through explicit reference edit mode. View clearing disposes geometry, materials and edge overlays on replacement/session lifecycle.
- Native **version 9** is written only when STL assets are present. Older image-only/native versions retain their existing writer choices. Versions 1–8 remain readable; STL data in older versions is rejected. Existing asset payload descriptors, immutable capture copies, worker transfer, project library portability and recovery paths carry the bytes and transform metadata. No external URL dependency or SDF conversion.
- Export borrows only committed SDF-derived buffers, copies cooperatively and checks source revision/selection guards. Pending remesh data is rejected with a wait message, never exported stale. Group transforms already resolve to world/model transforms; workspace navigation and turntable presentation are excluded. Paint colours and all reference/mask/gizmo/light presentation are excluded from STL.
- `export-client` / `export-worker` support STL with the existing cancellation, progress and worker termination lifecycle. `stl-export.ts` applies model transforms, centres the assembled bounds, converts to mm and validates the **final Float32 triangle coordinates** before writing little-endian binary STL. Normals are regenerated from exported winding. Admission uses the larger existing quality estimate or 128 bytes/corner with typed topology workspace, a 600,000-triangle hard ceiling, and available application memory. Limits reject explicitly; no triangle-target decimation.
- Unified output comes from fresh SDF Boolean composition, not concatenation. Capped sampling results are unavailable for STL, rather than silently lowering detail. Uncapped Boolean output is still sampled at the compositor's resolution and is not mathematically exact CAD. Multiple disconnected Boolean solids are reported honestly.
- Final checks: exact-coordinate edge incidence, winding consistency, zero dimensions, degeneracy, connected surfaces, signed component volumes, actual mm bounds and triangle count. Negative-volume shells are warnings because they may be intentional cavities. Open boundaries and multiple components are warnings; non-manifold edges, inconsistent winding, degeneracy and zero dimensions block. Final validation makes no geometry modifications.

## Evidence and reproduction

Baseline strict TS, production build and **1,254/1,254 tests** passed before edits. Final strict TS/build and **1,274/1,274 tests** passed. Twenty new deterministic tests include ASCII/binary malformed data, byte/count quotas, binary triangle values, scaling/transforms, topology fixtures, cancellation, stale sources, a real export worker, native v9/legacy/recovery, references/disposal/exclusions, grouped source transforms, actual SDF sphere and Boolean output, and VR action routing/nonoverlapping targets. Existing full controller, project, GLB, Paint/Mask, Tube and group suites pass.

A live localhost browser smoke test exercised selected-part export through the real browser worker, report, confirmation and download action: **31,536 triangles, 100 × 100 × 100 mm**, zero boundary/non-manifold/winding/degenerate diagnostics. See `outputs/phase-5-3/desktop-print-report.png`. This verifies browser execution, not the operating system's download destination or slicer ingestion. Existing recovery entries were left untouched.

Run:

```sh
npx tsc --noEmit --strict
npm run build
npm test
node scripts/benchmark-phase53.mjs
git diff --check
```

Node/macOS component observations, one measured export per resolution (not frame percentiles or GPU timing):

| Grid | Output triangles | Standard encode + validation | Result |
| --- | ---: | ---: | --- |
| 17³ | 2,136 | 19.56 ms | closed, 100 mm |
| 32³ | 7,560 | 44.01 ms | closed, 100 mm |
| 64³ | 31,536 | 137.66 ms | closed, 100 mm |
| 128³ | 128,304 | 576.94 ms | closed, 100 mm |
| 192³ | 290,352 source triangles | rejected | memory admission limit |

The benchmark supplies a full 256 MiB export budget; the UI subtracts existing tracked sculpt memory and may reject earlier. The 128³ STL exceeds the smaller reference-import quota, so its parse-back is deliberately rejected and recorded. Full raw results, baseline/final logs and previous handover live in `outputs/phase-5-3/`. Maximum recorded successful benchmark RSS was approximately 330 MiB, including Node, source geometry and runtime overhead; this is not a validated heap ceiling.

## Limits and deferred work

Self-intersections, vertex-only non-manifold contacts, minimum wall thickness, shell nesting, slicer success and automatic repair are **not supported/guaranteed**. Exact welding may report small numerical seams instead of healing them. High quality retains existing planar simplification behavior; STL does not preserve colour. Convert-to-SDF remains deferred. Physical sizing is explicit per export, not a persisted project-wide physical-unit system; optional width/height/depth entry is not implemented.

Reference parsing, normal computation and edge-overlay construction are bounded but synchronous, including view reconstruction on XR lifecycle. Native validation can reparse assets. Those operations and snapshot/IndexedDB cloning remain possible stalls; no Quest responsiveness claim is made. The existing two-chunk / 3 ms scheduler, staged Paint refresh and histories were not changed. Worker estimates are conservative admission estimates, not guaranteed JS engine memory ceilings. Browser download permissions can suppress a companion file; the report stays visible in the panel.

## Phase 5.4 — Full VR Acceptance and Release Candidate

Every real Quest 3 item is **PENDING**:

1. Both tool hands, Studio and Passthrough: import handoff, ray selection, neutral-trigger rearm, Move/Rotate/Scale, lock/hide, opacity/wireframe, anchors and turntable behavior; no accidental sculpt stamps while editing references.
2. Tool Wheel, Move reconstruction, Mask, Paint, Tubes, nested Groups, images and lighting before/after STL work; queued meshing must finish or export must clearly refuse stale data.
3. Print handoff, progress/cancel, browser confirmations/downloads, re-entry and tracking/session loss. Exercise selected/visible/Boolean exports and capped/over-budget failure paths.
4. Save/open/duplicate/portable `.form` transfer and recovery with mixed image/STL assets. Confirm exact placement and no reference inclusion in GLB/STL; leave prior saves intact on errors/quota rejection.
5. Repeat reference replacement, project switches and XR entry/exit for 30–60 minutes. Capture memory/GPU resource trends and Phase 5.2 frame/input metrics; test maximum admitted reference load. No leaks or thermal stability are asserted without this run.
6. Import exported mm files into an actual slicer and verify dimensions, intentional cavities/disjoint parts and warnings. Test representative curved, thin-wall and Boolean models; no print-success claim until assessed.

Carry forward Phase 5.1/5.2 physical acceptance backlogs. No commit, push or merge has been performed.


2026-11-01 download follow-up: the original STL flow could show success without a file reaching Downloads after its native confirmation dialog. Replaced that with a fresh-click **Download STL (.stl) — accept report warnings** button after preparation/reporting. JSON report download is now optional and separate; GLB buttons explicitly say GLB. Verified actual browser Downloads files: STL 1,576,884 bytes / 31,536 triangles / 100 mm per axis, and GLB v2 2,271,760 bytes. Re-imported the downloaded STL through the browser reference picker and verified its rendered reference and controls. Strict TS/build and all 1,274 tests pass. Reproduction: `node scripts/check-print-downloads.mjs`; evidence in `outputs/phase-5-3/download-check/`. Earlier smoke-test statements about confirmation/download refer to the superseded flow.

2026-11-01 export UI simplification: one explicit format selector (STL by default) now drives exactly three scope buttons: Export current layer, Export all layers, Export unified boolean. All layers retains visible-only sculpt semantics, stated beside the buttons. Removed duplicate STL/GLB button sets; format changes clear prepared downloads. STL uses the print-report download button; GLB uses the binary download path. Payload signature/length guards prevent format mismatches. Verified all three STL preparation routes in-browser, actual current-layer STL and GLB downloads with binary byte checks, and existing native/report behavior. Screenshot: `outputs/phase-5-3/download-check/simplified-export.png`.


2026-11-06: STL topology now uses cooperative typed-index sorting and typed connected
component buffers, replacing retained coordinate/edge string maps. The shared client
and worker cap is 600,000 triangles, still subject to available-memory and quality
admission. Precision-seam candidate storage has a bounded workspace and refuses if
that allowance is exceeded. No triangle decimation or removal of topology checks.
