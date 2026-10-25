# Rendering styles

1. **Changed:** Added Normal (existing clay), Glossy (surface inspection) and Wireframe (triangle structure). Cycle with the lower-right viewport button or use Rendering style in Layers. Works alongside layer colours and Boolean Preview.
2. **Architecture:** Viewport material properties are separate from SDF/geometry and neutral GLB materials. Glossy uses a cached, procedurally generated studio environment and ACES tone mapping. Style saves as optional validated display metadata; legacy files default to Normal.
3. **Validation:** Build passed; 181/181 tests passed. New tests verify unchanged voxels/normals/chunk buffers/history, no remeshing/recomposition for style changes, colour preservation, native style round trips/defaults/rejection and neutral solid export materials. Browser cycling verified all styles at the LAN hostname.
4. **Performance:** Existing materials reused; no meshing benchmark rerun. Initial Glossy environment generation and shader compilation have a one-time cost. GPU frame rates were not measured.
5. **Limits:** Wireframe can look dense at high resolution; physical-phone performance remains untested. Exported materials stay neutral rather than baking viewport inspection choices.
6. **Next:** Matcap and cavity/curvature inspection could be useful future options. Keep inspection materials and image environments separate from source data and export materials.

Changed files and implementation details are recorded in docs/DEVELOPMENT_STATUS.md; an identical handover copy accompanies this report.
