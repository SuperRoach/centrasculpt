# Development workflow

Every completed phase or significant change must:

1. Update docs/DEVELOPMENT_STATUS.md using its six-part handover format.
2. Add a concise user-facing entry to WHATS_NEW.md, newest first, with the phase number and actual date. Describe visible completed behavior; distinguish pending validation. This file is imported at build time; do not duplicate its content in TypeScript.
3. Run strict TypeScript, production build and the complete automated test suite; record actual results and counts.

Keep physical Quest acceptance separate from host evidence. Never claim release readiness while critical acceptance is pending. Do not commit, push or merge without explicit permission for the current work.
