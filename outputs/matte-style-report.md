# Normal / Matte / Glossy

1. **Changed:** Removed Wireframe; added Matte between Normal and Glossy. I cycles all three modes, as do the viewport button and Layers selector.
2. **Decisions:** Matte has roughness .4, metalness .06 and reflection intensity .45. Normal and Glossy keep their previous settings. Wireframe preferences in old native files migrate to Normal; no SDF data is changed.
3. **Validation:** Build passed; 182/182 tests passed. Browser verified I cycles modes without adding history or changing triangle counts. Regression tests cover material/data separation, exports and legacy-file migration.
4. **Performance:** Same cached studio environment reused; no mesh extraction for style changes. No new benchmark was required.
5. **Limits:** Existing GPU/first-use environment generation costs remain; physical-phone performance was not measured. GLB materials remain neutral.
6. **Next:** Keep style shortcuts, persistence validation and export/display separation shared for future rendering options.
