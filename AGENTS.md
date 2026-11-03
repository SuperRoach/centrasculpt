# Agent workflow

- Run `npm run test:quick` for fast feedback while editing.
- Use `npm test -- <filename substring>` for focused test files; `npm run test:changed` is conservative and may select the full suite.
- Always run `npm run check` before handing off completed work. It includes formatting, lint, strict TypeScript, production build and every test file.
- Full tests default to four concurrent files. Lower load with `TEST_CONCURRENCY=2`; machine-readable output is available from `npm run --silent test:tap` or `npm run --silent test:junit`.
- Keep Biome's handwritten-file scope; do not format generated output, assets, snapshots, recovery data or `outputs/`.
- Do not commit, push or merge without explicit authorization for the current work.
