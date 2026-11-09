# Current-source audit — 10 November 2026

Repository: `/Users/brettjames/development/vrappPOC`. Initial `git status --short`
was empty. No existing `read-the-docs-pls` or public docs implementation existed.
All changes are docs/site files; no app, export, agent engine, project, reference
or recovery data is edited. The referenced research chat confirmed documentation
before Phase 8 Personal Shape Library/custom stamps; current source takes priority.

| Public guide area | Authority inspected |
| --- | --- |
| Desktop/menu/shortcuts | `src/ui.ts`, `src/main.ts`, `src/interaction.ts` |
| Wheel, Cut, Options | `src/editor-tool-state.ts`, `src/xr-menu-model.ts` |
| Logical hand roles/current controls | `src/xr-actions.ts`, `src/xr-support-shortcuts.ts`, `src/xr-controller-roles.ts`; old “planned” tables are not treated as current input acceptance |
| World/library/nested menus | `src/xr-world-menu.ts`, `src/layer-palette.ts`, `src/precision-tools.ts`, `src/project-library-ui.ts` |
| Quest setup | `scripts/dev-https.mjs`, `docs/QUEST_WEBXR.md`; historical foundation/controller-only status is superseded by current input source |
| Stamp vs primitive | `src/shapes.ts`, `src/primitive-ui.ts`, `src/parametric-primitive.ts` |
| Measurement/calibration | `src/precision-ui.ts`, `src/precision-tools.ts` |
| Layer/group limits, Bake | `src/project.ts`, `src/layer-hierarchy.ts`, `src/ui.ts`, `src/bake.ts` |
| Boolean/array/surface snapping | `src/boolean-ui.ts`, `src/primitive-ui.ts`, `src/surface-snapping.ts`, `src/editor-tool-state.ts` |
| Enclosures/assemblies | `src/enclosure-ui.ts`, `src/enclosure-features.ts`, `src/assembly-ui.ts` |
| Native save/library/references | `src/main.ts`, `src/project-workflow.ts`, `src/project-library-ui.ts`, `src/reference-ui.ts` |
| Painting/masking | brush labels/settings in `src/ui.ts` and `src/editor-tool-state.ts` |
| Export 7.5.4c | `src/export-dialog.ts`, `src/main.ts`, `src/boolean-export.ts`, `src/export-decimation.ts`; latest status, roadmap and WHATS_NEW |
| MCP schemas/security/holder | `scripts/agent-schemas.mjs`, `docs/PHASE_7_3_LOCAL_MCP.md`, `docs/PHASE_7_5_1_AGENT_WORKFLOWS.md`, proposal notes |

Important corrections from source: 16 source layers and a separate 32-group cap /
eight-level nesting; Cone is a zero-tip cylinder preset; Stamp has four built-ins;
primitive torus includes Tyre shape; visible STL ordered operations differ from
plain GLB separate-layer semantics; live modifiers/arrays force evaluation;
Current layer refuses scenes with live modifiers/arrays. Curved reduction is
optional STL only, defaults off and does not run for printable parts. Proposal
apply takes proposalId (not an extra expectedRevision); capture uses viewpoint.
The holder's 14-command payload comes from the existing canonical fixture and is
schema-tested, including its separate apply/query/capture argument examples.

Official setup sources fetched on 10 November 2026:
- OpenAI: https://learn.chatgpt.com/docs/extend/mcp?surface=cli
- Cursor: https://prod.cursor.com/docs/mcp
- Pagefind: https://pagefind.app/docs/running-pagefind/

External links are informational; the site does not request them at runtime.
No new client MCP session, user configuration, browser modelling approval or user
scene was changed for this phase. Hardware and client-cache acceptance remain
separate from static/schema/browser documentation checks.

## Same-site Help follow-up — 10 November 2026

The user's follow-up authorises the Help menu and app build integration. Added
`src/ui.ts` Help link, matching `src/style.css` styles, Vite guide plugin and root
Pagefind development dependency. No modelling/export/agent engine changes. The
initial docs-only scope statement above describes the first delivery; this
follow-up adds the requested app access and combined deployment output.
