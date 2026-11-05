# Phase 7.1 — Parametric enclosure and removable lid

2026-11-06. Local modelling recipes; no MCP server or external transport. Hardware, slicer and printed-fit acceptance remain pending.

Desktop: **Enclosure** beside Assembly. Quest: **World Settings → Measure & Precision → Primitives → Enclosure**. Enter dimensions, **Preview changes**, review, then **Create enclosure / Apply changes**. New recipes show unpickable wireframe source solids and cutters; updates also show transformed wire outlines of the changed base, cavity and lid. Confirmation is one atomic Undo/Redo action. Successful confirmation prepares the existing independent assembly preview. Cancel before commit rolls back; cancelling a subsequent display rebuild leaves the confirmed edit available to Undo. Select the Base or Lid and choose **Edit selected enclosure** to rebuild its saved recipe. Fields retain unfinished desktop input; VR uses the existing menu/keypad routing. A changed scene invalidates staged confirmation. Project replacement cancels work and discards its results.

The base and lid are independent printable layer roots, named **Enclosure Base** and **Enclosure Lid** by default. Their source children remain editable through Primitives, exact transforms and live Boolean controls. Roots move/rotate independently using existing layer tools. Recipe rebuild restores dependent source dimensions/placement, retains root orientation/scale and independent placement offsets, and shifts the lid by the change in its assembled height. Manual source edits remain live until an explicitly confirmed rebuild; baking or changing the first cavity/lip operations prevents rebuilding. Extra operations after those first operations and additional part members are retained on rebuild. No implicit Bake occurs. A changed project calibration retains the existing precision convention: it reinterprets physical size; saved recipe parameters remain declared mm intent, while SDF section queries use current calibration.

## Dimensions and fit

All recipe inputs use explicit mm. Width is X, height is Y, depth is Z. `innerHeightMm` means floor top to open rim. Base outer width/depth are inner dimensions + twice wall thickness; base outer height is inner height + floor thickness. The base is centred at the origin. The assembled lid plate bottom lies on the rim; total assembled height is base outer height + lid plate thickness. The ring lip projects downward by `lipDepthMm`, leaving `innerHeightMm - lipDepthMm` unobstructed height beneath it. It overlaps the plate by half the smaller of wall and plate thickness, so union has a positive volume overlap.

`cornerRadiusMm` is the **outer vertical corner radius**, with square horizontal edges. Zero makes square corners; otherwise radius must be at least wall + clearance and at most half the outer width/depth. Inner radius is max(0, outer radius − wall). The hollow lip's outer dimensions are cavity width/depth − twice clearance, outer radius is max(0, inner radius − clearance), and ring thickness equals the base wall. Its inner opening remains positive. Clearance is positive, **per side**, at most half the wall; lip depth must be less than cavity height. Inputs must be finite numeric values, bounded to 0.05–1000 mm (radius may be zero), and still satisfy existing model-unit/resource limits. Unknown fields/types and screw-on lids reject. There are no undercuts, snaps, seals, screws, mounting posts or board-specific values.

Clearance is configurable design intent, never a universal printer tolerance. Curvature, extracted surfaces, printer calibration, material and shrinkage affect fit. Export warnings identify clearance below the sampled spacing. Inspect in the intended slicer and print a tolerance coupon.

## Local typed API

```ts
const revision = api.revision;
const parameters: EnclosureParameters = {
  units: "mm", name: "Enclosure",
  innerWidthMm: 24, innerDepthMm: 20, innerHeightMm: 14,
  wallThicknessMm: 3, floorThicknessMm: 3, cornerRadiusMm: 4,
  lid: { type: "friction-fit", clearanceMm: 0.3, lipDepthMm: 4, thicknessMm: 3 },
};
const preview = await api.enclosure.create(parameters, {
  expectedRevision: revision, dryRun: true, signal,
});
// Review source cache validation, computed dimensions and warnings. Provisional IDs differ.
const result = await api.enclosure.create(parameters, { expectedRevision: revision, signal });
if (result.ok) {
  const { base, lid } = result.value.partIds;
  const intent = api.query({ type: "enclosure.inspect", baseId: base, lidId: lid });
  const sections = api.query({ type: "enclosure.samples", baseId: base, lidId: lid });
  const updated = { ...parameters, lid: { ...parameters.lid, clearanceMm: 0.6 } };
  await api.enclosure.update(base, lid, updated, { expectedRevision: api.revision, signal });
  // Optional outer-size input conversion; outer height is base bottom to rim.
  const resized = api.enclosure.withOuterDimensions(updated, {
    widthMm: 34, depthMm: 30, heightMm: 21,
  });
}
```

Exported types/defaults/validation live in `src/enclosure-recipe.ts`. `enclosurePlan` is a pure typed dimension/source plan; `withOuterDimensions` converts outer dimensions to the same validated inner convention. Create/update return the normal structured result with batch report, five source aliases, stable base/lid IDs, complete parameters, computed wall/floor/rim/lip surfaces and limitations. Queries return detached structured results; direct `inspect`/`samples` helpers throw on invalid requests. Inspection compares both root intents and verifies the expected hierarchy/ordered CSG structure. It does not establish that manually altered source dimensions still match declared intent. Explicit base/lid IDs avoid ambiguous pairs; the UI refuses ambiguous matching recipes.

Every recipe expands into existing Phase 7.0 primitive, transform, Boolean, parenting, part-definition and rename commands in one leased batch. Dry-run builds isolated source caches and never modifies authoritative fields/history. It does **not** validate final mesh topology. Exact revision admission, cooperative preparation, memory/layer limits, failure rollback and retained Undo/Redo use the existing backend. Parameters persist inside validated printable-part metadata, without extra source-ID links or a second project graph. No external connector, agent-only file format or global browser API exists.

`enclosure.samples` evaluates the actual source CSG at 512 midpoint samples on each of four bounded central sections: base wall/floor, lid ring/plate. It returns sampled widths and uncertainty in current mm, nominal intent and physical fit **unknown**. This is not a global minimum-thickness analysis; it can miss shifted sources, local thin regions and corner defects. Existing asynchronous `api.diagnostics({id:base,otherId:lid})` supplies sampled scene fit and actual final STL topology when requested.

## Geometry, persistence and exports

Five primitives and three live Boolean operations represent base outer − cavity, and lid plate ∪ (lip outer − lip inner). The compositor evaluates source signed distances using negative-inside min/max operations, including nested ring subtraction. No mesh concatenation substitutes for union. Optional box `cornerRadius` is an analytic rounded rectangle extruded along Y; dimensions retain the old box contract. Rounded prisms admit up to 128:1 source aspect to represent thin plates; ordinary legacy primitives retain 8:1. Old box evaluation remains byte-compatible with saved caches. Display curvature is tessellated; sampled CSG is not exact B-rep CAD.

Rounded-prism composition targets six samples across source thickness and aligned subtraction-wall gaps. Radius is curvature rather than a thickness dimension. A deterministic sub-step lattice offset avoids symmetric zero samples collapsing after Float32 export; it never changes source poses/dimensions. Existing bounded grids, sample/triangle/memory limits and cooperative scheduling remain. Final STL quality optimisation remains active; rounded meshes already within the strictest final admission can skip redundant preliminary chunk compaction. Larger meshes retain that bounded compaction path. Resource/quality/topology refusal is explicit and leaves sources intact.

Native `.form` **v16** is written for recipe intent or rounded-prism source/original parameters. Earlier files retain their previous versions; lower-version tagged new features reject. Native open, immutable worker recovery, Save As and Project Library duplication carry the same metadata and existing remapped hierarchy/Boolean references. Both parts' parameters are stored without cross-part ID links. **Duplicate the project in Project Library** for a complete independent enclosure copy. Single-root Duplicate layer is refused for a recipe root, preventing links into the original private part. Two full five-source recipes exceed the existing eight-layer scene cap; no capacity increase is implied.

Use existing **Assembly → Parts & export** or ordinary current/all STL actions for separate printable parts. Per-part STL uses the same `millimetresPerUnit` calibration for both parts; it never normalises each to a shared arbitrary longest dimension. Each STL is recentered independently, so it is a physical-size file, not an assembly-placement file. Final Float32 mesh checks must show one connected shell, zero boundary/non-manifold/inconsistent edges, zero degenerate triangles and outward winding for enclosure exports. Failure refuses output. Reports retain unsupported checks and below-resolution/physical-fit warnings. Existing calibrated GLB export remains available with its existing scopes; a new per-part GLB packaging workflow is not added. Guides, staged wireframes, controller models, skybox and references are not part sources.

Run `npm run example:enclosure` to write an editable native project, two validated binary mm STLs and companion reports under `work/phase-7-1/example/`. Run `npm run benchmark:enclosure`, `npm test -- enclosure-recipe`, and final `npm run check`. Host evidence is recorded in the Phase 7.1 status handover.

## Remaining acceptance and roadmap

Physical Quest 3 checks remain pending: both handedness settings, Support menu/keypad ownership, tracking/session interruptions, Cut discovery, guide profile clearance, Studio Skybox/Passthrough, save/recovery, sustained frame time/resources and part downloads. Target slicer inspection and actual printed-fit/tolerance testing remain pending. Large thin enclosures can exceed existing sampling/export budgets; validation is not a promise that every admitted source recipe exports at every quality.

Preserve **7.2 face-relative cutouts, board mounting patterns and named constraints**, **7.3 secure local MCP**, and **7.4 agent plan-preview-apply**. Screw-secured lids remain deferred. No commit, push or merge is authorized by this phase.


## Enclosure editing follow-up — 2026-11-06

The visible controls say **Enclosure**, **Name**, **Edit selected enclosure**, **Preview changes** and **Apply changes**. Opening the panel on a saved enclosure selects its existing base/lid pair automatically, including when a new project is loaded into an already open panel. Editing a field prepares a draft; Preview changes displays coloured source outlines at the new dimensions, including updates to independently moved/rotated parts. Apply changes rebuilds and displays the actual independent Boolean results with one Undo action.

For an opening, make a box or cylinder, position it through the desired wall, select the enclosure Base or Lid, open **Live Boolean Shapes**, choose the cutter and **Subtract / Difference**. Retain the first cavity/lip operation and append the cut after it. Parent the cutter under the relevant part to move it with the part. Added operations, their IDs and cutters survive resizing, Undo/Redo and native persistence. Cutter placement remains explicit: resizing a wall does not move a port onto the new face automatically. Associative face-relative placement remains Phase 7.2.
