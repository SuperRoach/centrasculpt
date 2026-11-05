# Development workflow

## Agent validation commands

- `npm run test:quick` runs a small smoke set; it is feedback, not a substitute for the full suite.
- `npm test -- move-worker` runs matching test files. `npm run test:changed` conservatively selects tests affected by source changes; run the full suite if selection is uncertain.
- `npm run test:full` runs every test file with a default concurrency cap of four. Set `TEST_CONCURRENCY=2` to lower it or pass `--test-concurrency=N` to override it.
- `npm run --silent test:tap` emits machine-readable TAP to stdout; redirect it to retain a report, for example `npm run --silent test:tap > coverage/test-results.tap`.
- `npm run --silent test:junit` emits JUnit XML to stdout for CI consumers.
- `npm run format` formats the scoped handwritten TypeScript, JavaScript and JSON files. `npm run format:check` verifies formatting, and `npm run lint` runs Biome's recommended rules.
- `npm run check` runs format check, lint, strict TypeScript, the production build and the complete test suite. Use this for final agent verification.
- Git pre-commit runs `npm run lint` (Biome format, lint and import checks) over the configured file scope. `npm ci` or `npm install` enables `.githooks` automatically for this repository. If hooks are not active, run `git config --local core.hooksPath .githooks` once.

Formatting scope excludes generated builds, vendored code, assets, snapshots, recovery data and `outputs/` evidence. Biome lint warnings remain visible and are listed in the current handover; do not hide them with broad suppressions.

Every completed phase or significant change must:

1. Update docs/DEVELOPMENT_STATUS.md using its six-part handover format.
2. Add a concise user-facing entry to WHATS_NEW.md, newest first, with the phase number and actual date. Describe visible completed behavior; distinguish pending validation. This file is imported at build time; do not duplicate its content in TypeScript.
3. Run strict TypeScript, production build and the complete automated test suite; record actual results and counts.

Keep physical Quest acceptance separate from host evidence. Never claim release readiness while critical acceptance is pending. Do not commit, push or merge without explicit permission for the current work.

## Headless modelling (Phase 7.0)

`npm run example:headless` runs a real Node example that creates editable primitives and a live Boolean subtraction, assigns a printable part, inspects it, saves `work/phase-7-0/headless-enclosure.form` and runs STL diagnostics. Pass a destination with `npm run example:headless -- /absolute/path/example.form`. Run `npm run benchmark:headless` for host CPU timings and `npm test -- headless-editing` for the focused contracts.

The supported integration boundary is `ModellingAPI` in `src/modelling-api.ts`, backed by the active `IndependentLayers`. Use `execute`, `batch`, `query` and asynchronous `diagnostics`; reuse native `saveSculptProject`/`openSculptProject`. See [the API contract and transaction example](docs/MODELLING_COMMANDS.md#phase-70--transactions-dry-runs-and-inspection). The Node scripts reuse the repository compiler harness and Three.js CPU geometry, without DOM or XR. Browser UI, IndexedDB Project Library, recovery workers and download dialogs remain browser integrations; the CLI writes native bytes directly. There is no external connector or transport.
