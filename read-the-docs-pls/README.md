# Centra Sculpt field guide

Phase 7.6.1 public user documentation: 26 pages, three illustrated tutorials, an
interactive Tool Wheel schematic, a glossary and a tool-choice guide. This independent static site lives here;
`../docs/` remains the technical engineering/handover archive. No app/engine imports
are shipped to readers. No runtime API, account, CDN, analytics or external font.

## Same-site app build and Help menu

The app's normal `npm run build` now builds the guide and Pagefind index and
includes them at **`dist/read-the-docs/`**. Deploy the complete root `dist/` using
the normal app deployment process. No separate documentation deployment or account
is needed. At a site root the guide is `/read-the-docs/`; a Vite base such as
`/sculpt/` gives `/sculpt/read-the-docs/`.

Click **Centra Sculpt → Help ↗** to open it in a new tab and keep the editor open.
The accessible link announces that it opens a new tab. `npm run dev`, `dev:https`
and `dev:agent` also build/serve this path on the same development server. After
editing guide sources, rebuild the guide or restart the development server; generated
docs output is excluded from the app watcher to avoid reloading unsaved sculpts.

```sh
npm ci
npm run dev
# Or verify the combined production output:
npm run build
npm run preview
```

The root install includes pinned Pagefind; a nested install is not needed to build
or serve the combined app. `scripts/docs-vite.mjs` handles the build copy and
restricted development-file serving. Missing guide pages return 404 rather than
falling back to the editor. No preview QA endpoint is copied into the app build.

## Standalone guide build and preview

From the repository root (Node 22+):

```sh
npm ci
npm ci --prefix read-the-docs-pls
npm --prefix read-the-docs-pls run build
npm --prefix read-the-docs-pls test
npm --prefix read-the-docs-pls run preview
```

Open http://127.0.0.1:4176/. `PORT=4180 npm --prefix read-the-docs-pls run preview`
selects another loopback port. Stop with Ctrl+C. Build writes only this site's
ignored `dist/`; it never touches the app's root `dist/`, projects or recovery.
Use HTTP rather than opening `dist/index.html` with file://: module/WASM search
needs a web origin. Rebuild and reload after edits; preview does not hot-reload.

## Edit and validate

- `content.json`: ordered guide records with stable IDs, groups, descriptions and
  trusted author-written semantic HTML. This is a repository authoring format,
  not an untrusted user-content API. Escape literal code examples as HTML.
- `build.mjs`: generates one full HTML document per route and shared navigation,
  breadcrumbs, local section links, previous/next and the full text index page.
- `routes.json`: explicit public route contract. Keep old filenames or supply
  static redirect pages when changing a route. Section IDs are positional; review
  fragment links when changing headings. `tests.mjs` checks every generated link.
- `style.css`, `theme.js`, `app.js`: responsive styling, local theme preference,
  native modal search and menu behaviour. System theme is the initial default.
- Pagefind 1.6.0 runs after HTML generation, indexing only article content. Its
  generated bundle must be deployed alongside the pages. The UI path is derived
  from the current document directory so GitHub Pages project prefixes work.
- The existing app favicon supplies the brand mark; the welcome illustration is
  original CSS geometry, not an app screenshot. Accessible HTML flows explain
  source/evaluation and the holder operation order. No copyrighted stock assets.

Run `npm --prefix read-the-docs-pls run test:browser` for the Playwright smoke.
It uses the root repository's Playwright and installed Chromium. Optionally set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed compatible Chromium executable.
Screenshots and reports go to ignored `../work/docs-7-6/`.

If shell browser launch is blocked by host permissions, keep preview running and
open http://127.0.0.1:4176/__qa.html in a real browser. Click **Run checks**. This
repository-owned harness automates real Pagefind queries, axe WCAG A/AA checks,
all 23 pages at 1440/390/320 px, mobile navigation, theme persistence, shortcut
events and focus return. It also tests `/nested-guide/` as a project-path alias.
These preview-only QA endpoints are not copied into `dist/` or deployed. Keyboard
Tab/Shift+Tab, Escape and visual screenshots still need a real interaction check;
axe alone does not establish complete accessibility or screen-reader usability.

`npm run check` at repository root remains the required app formatting/lint/strict
TypeScript/production build/full-test gate. The guide has its own dependency lock,
static tests and browser checks and does not change the app toolchain or formatter
scope. Root dependencies are needed for MCP schema validation in docs tests.

## Deploy static output — only when authorised

For the combined app, publish the complete root `dist/` (including `read-the-docs/`).
The standalone guide-only deployment below is an alternative.

Nothing in the build or preview publishes. Do not deploy without the owner's
permission. For GitHub Pages, build in CI with the two `npm ci` commands above,
run docs build/tests, then upload **read-the-docs-pls/dist/** as the Pages artifact
using the repository's approved Pages workflow. Configure Pages to use Actions,
and use the usual upload-pages-artifact / deploy-pages steps after approval.
This phase intentionally adds no publishing workflow or hosting identity.

The same directory works on a static host at `/` or `/repository-name/`. Retain
all `.html`, CSS/JS, favicon and `pagefind/` files, including WASM and index
fragments. Keep relative file paths and explicit `.html` routes; no SPA fallback
or server rewrite is needed. Do not upload the repository root, input projects,
`work/`, `.certs`, session credentials or development servers. Preview's QA
endpoints and test prefix alias are development conveniences, not hosting rules.

## Accuracy maintenance

See `SOURCE_AUDIT.md` for the actual source reviewed and `../docs/PHASE_7_6_UX_GAPS.md`
for app UX gaps deliberately left outside this phase. Verify changed commands
against `scripts/agent-schemas.mjs` and current UI, not historical engineering
plans. Run tests after changing content; the holder JSON is validated against the
executable proposal schema. Manual Quest/hardware/print acceptance is separate.

## Phase 7.6.1 screenshots and interaction

`screenshots/` contains original 1600 × 1000 PNG captures from the running app in
fresh disposable Chromium contexts. `manifest.json` records capture time, origin,
size and caption. No user browser profile, saved scene or recovery data is used.
Captions provide readable annotations outside the original image. Images link to
original pixels without JavaScript; the native modal adds Escape, focus return,
mouse/touch interaction and horizontal scrolling at full resolution.

Reproduce with the app at loopback port 5261, then `node
read-the-docs-pls/capture.mjs`. `CENTRA_CAPTURE_URL` overrides the app URL;
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` selects an installed Chromium. The separate
`capture-tutorials.mjs` exercises numeric holder and enclosure controls. All
modelling is confined to disposable browser storage. These scripts write only
this guide's captures, never user projects. Inspect captures before accepting a
new manifest; do not substitute generated illustrations for screenshots.

The Tool Wheel uses the nine `VR_WHEEL_TOOLS` sectors in source order. It is a
labelled schematic, with layout adapted for reading, rather than a Quest capture.
Native buttons support Tab, Enter/Space, arrows, Home/End and touch. All detail
sections and image links remain available without JavaScript.

Authentic Quest captures still needed: wheel, tool Options (especially Move
variants), Paint/Mask, Layers and Boolean order, World Settings/precision,
project library, enclosure and assembly interactions. No headset or physical
print acceptance is claimed. Keep pending labels until real captures are checked.

Validation: build then `npm --prefix read-the-docs-pls test` (links, assets,
provenance and source/schema checks), then `npm --prefix read-the-docs-pls run
test:browser` (26 routes, axe, actual Pagefind search, responsive layouts,
keyboard/touch, lightbox and reduced motion). Repository `npm run check` is also
required. See `docs/DEVELOPMENT_STATUS.md` for this run's exact results.
