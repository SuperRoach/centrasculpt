# Phase 2.0 changed files

Generated from the working-tree diff against the clean incoming checkout. No commit, push or merge performed. Build/test logs may be ignored by repository rules; retained paths are listed below.

## Implementation

- [src/deformation-contract.ts](../src/deformation-contract.ts)
- [src/editor-tool-state.ts](../src/editor-tool-state.ts)
- [src/independent-layers.ts](../src/independent-layers.ts)
- [src/main.ts](../src/main.ts)
- [src/move-field.ts](../src/move-field.ts)
- [src/move-mesh-preview.ts](../src/move-mesh-preview.ts)
- [src/sculpt-metrics.ts](../src/sculpt-metrics.ts)
- [src/xr-actions.ts](../src/xr-actions.ts)
- [src/xr-brush-sizing.ts](../src/xr-brush-sizing.ts)
- [src/xr-experience.ts](../src/xr-experience.ts)
- [src/xr-move-tool.ts](../src/xr-move-tool.ts)
- [src/xr-performance.ts](../src/xr-performance.ts)
- [src/xr-shape-stamp.ts](../src/xr-shape-stamp.ts)

## Tests and validation scripts

- [scripts/benchmark-move-preview.mjs](../scripts/benchmark-move-preview.mjs)
- [scripts/compile-core.mjs](../scripts/compile-core.mjs)
- [scripts/move-preview-browser.html](../scripts/move-preview-browser.html)
- [tests/move-preview.test.mjs](../tests/move-preview.test.mjs)
- [tests/xr-menus.test.mjs](../tests/xr-menus.test.mjs)

## Handover

- [docs/DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md)
- [docs/PHASE_2_0_CHANGED_FILES.md](../docs/PHASE_2_0_CHANGED_FILES.md)
- [docs/PHASE_2_1_NON_ELASTIC_MOVE.md](../docs/PHASE_2_1_NON_ELASTIC_MOVE.md)
- [docs/VR_MOVE_PREVIEW.md](../docs/VR_MOVE_PREVIEW.md)

## Browser and performance evidence

- [outputs/phase-2-0-browser-preview.png](../outputs/phase-2-0-browser-preview.png)
- [outputs/phase-2-0-browser-preview.txt](../outputs/phase-2-0-browser-preview.txt)
- [outputs/phase-2-0-browser-restored.png](../outputs/phase-2-0-browser-restored.png)
- [outputs/phase-2-0-browser-restored.txt](../outputs/phase-2-0-browser-restored.txt)
- [outputs/phase-2-0-move-benchmark.json](../outputs/phase-2-0-move-benchmark.json)
- [outputs/phase-2-0-move-benchmark.log](../outputs/phase-2-0-move-benchmark.log)
- [outputs/phase-2-0-typescript.log](../outputs/phase-2-0-typescript.log)

## Additional local validation logs

- `outputs/phase-2-0-tests.log` — 546 passed, zero failures.
- `outputs/phase-2-0-build.log` — production build passed; bundle advisory retained.
- `outputs/phase-2-0-typescript.log` — empty output, successful check.

Incoming source snapshot: `work/checkpoints/before-2-0.tar.gz` (SHA-256 `5807e3be3cc2d5f3d599f73a2fbcceeea29179e386782de52f915e6e18e551c4`).
