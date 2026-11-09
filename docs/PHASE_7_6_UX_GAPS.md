# Phase 7.6 — UX gaps observed, 2026-11-10

These are source-audit follow-ups, not changes authorised or implemented in this
phase. The public guide documents the current controls instead of adding features.

1. **Terminology drift in engineering notes.** Old Quest/controller guides still
   describe viewing-only/reserved actions. Some roadmap export paragraphs say
   curved reduction/modal work is deferred although later dated entries supersede
   them. Public guidance follows current source; a separate archive tidy-up would
   help future maintenance.
2. **Several similar concepts need clearer UI differentiation.** Stamp built-ins,
   primitive sources, project library and the future Personal Shape Library are
   different. Model units, physical fields, VR workspace scale and reference STL
   display normalisation can also be confused. The guide explains each boundary.
3. **Current-layer export refuses any scene with live modifiers/arrays**, even if
   the chosen source appears independent. Visible STL's ordered composition and
   plain GLB separate-layer path differ. Public scope guidance explicitly covers
   this instead of promising parity or modifying the exporter.
4. **Discoverability across desktop/VR differs.** VR Pinch/Crease/Scrape live under
   Move variants; Paint/Mask sit outside wheel sectors. Some enclosure attachment
   tools are API workflows rather than dedicated user panels. Preserve these facts
   until a separately scoped UI pass.
5. **Browser storage follows origin/profile.** Different hostnames/ports can look
   like missing projects. Downloaded native backups and exact-origin checks are
   taught; no migration or user storage change was attempted.
6. **Sampling is not fit certification.** Reduced preview detail, finite Bake,
   fit checks and optional curved reduction need their stated limits. Hardware,
   screen-reader user testing, client tool-cache acceptance and physical print
   gates remain separate; this phase does not claim them complete.
