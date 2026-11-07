# Editable primitives — Cone, Capsule, Torus and Pyramid

Implemented 2026-11-07. These are source-local parameters, retained through editing,
Undo/Redo, native saving, recovery and Project Library copies. Creation never Bakes.
Sphere/ellipsoid, box/rounded box and tapered cylinder remain the same engines.
The Shape Library's independent pyramid stamp is unchanged.

## Dimensions and conventions

Every pivot is the centre of the local bounding box. Y is vertical, X width and Z
depth. Dimensions in API requests require `unit: "mm" | "cm" | "in"`; returned
parameters and measured source bounds are mm. Workspace zoom is unrelated.

| UI choice | Canonical source, example in mm | Meaning |
| --- | --- | --- |
| Cone | `{kind:"cylinder",bottomDiameter:20,topDiameter:0,height:30}` | Circular base at −15 Y, tip at +15 Y. Positive top diameter gives a blunt capped frustum. Legacy `diameter` remains fallback for either unspecified end. |
| Capsule | `{kind:"capsule",diameter:10,height:30}` | Overall height 30, radius 5, straight middle length 20. Height must be ≥ diameter; equality is a sphere. |
| Torus | `{kind:"torus",majorRadius:15,tubeDiameter:6}` | Ring **centreline radius** 15, tube radius 3, outer diameter 36, inner/hole diameter 24, Y thickness 6. Ring lies in XZ. `majorRadius > tubeDiameter/2` is required. |
| Pyramid | `{kind:"pyramid",width:20,depth:20,height:30}` | Centred footprint at Y=−15, apex `(0,+15,0)`. Default footprint is square; independent width/depth also support a rectangular footprint. |

Cone is an obvious creation preset of `cylinder`, rather than a duplicate shape kind.
Agents use the canonical definition above; `kind:"cone"` is intentionally unsupported.
Both cylinder ends may individually reach zero, but at least one must remain positive.
Zero and very small end radii use the existing exact capped-frustum distance without
dividing by the radius. A positive tip remains editable through the same end fields.

Desktop: **Primitives → Create new**, choose a shape, enter dimensions, then Create.
**Edit selected** changes complete source parameters. Quest: **Tool Wheel → World
Settings → Measure & Precision → Primitives → New primitive…**; choose a shape,
enter exact fields with the existing keypad, then Place preview. Capsule displays
**Overall height**; torus displays **Ring radius** (centreline, explained in its tooltip) and **Tube diameter**.
The existing placement/trigger release and logical-hand rules remain authoritative.

## Geometry and admission

Capsule distance is distance to a Y-axis line segment minus radius. Torus distance
is `hypot(hypot(x,z) − majorRadius, y) − tubeDiameter/2`. Pyramid evaluation finds
the nearest point on its six boundary triangles and assigns sign from its footprint
half-spaces: exact Euclidean distance, including edges, base and apex. Work is
bounded; reusable facet data and scratch vectors avoid per-facet allocations.
Analytic support computes affine bounds; asymmetric cone/pyramid min/max are evaluated
independently, avoiding rotated-AABB clipping. The existing compositor samples these
same sources for Booleans/arrays. Source mesh, desktop and Quest previews share one
mesh factory. Capsule collapsed pole triangles are omitted; pyramid uses six flat
triangles with one geometric apex, without a collapsed ring of apex faces.

Ordinary dimensions remain 0.001–16 model units (default 0.1–1600 mm), maximum 8:1
source aspect. Cylinder end overrides alone allow zero or smaller positive values.
Capsules up to 8:1 overall height/diameter are admitted; larger ratios refuse.
Tori permit up to 128:1 outer-diameter/tube-diameter; ring and tube parameters retain
the same finite dimension limits. A positive mathematical hole is required.
Small torus tubes/holes request sampling from their smaller feature width. Existing
192³, 16-layer, sample/memory and 600,000-STL-triangle guards still apply. Large or
thin sampled scenes can refuse even when their analytic source is valid. Fitted
33–63³ source caches are disposable and may omit thin detail; source display is
analytic tessellation. Neither source caches nor zero-width apex sampling guarantee
printable detail. Explicit Bake remains sampled and separate.

Local dimension handles support independent box/pyramid/ellipsoid axes;
cylinder/cone and capsule radial X/Z stay circular. Torus radial handles change ring
and tube proportionally; Y changes tube diameter. Capsule changes that violate overall
height ≥ diameter refuse. MCP `scale_primitive` requires X=Z for cylinder/capsule and
X=Y=Z for torus; edit the two torus parameters explicitly for independent changes.
No new non-uniform affine sculpt transformation is introduced.

## API, native files and exports

Use ordinary `primitive.create` / `primitive.update`, complete same-kind definitions,
Phase 7.0 batches/dry-runs and Phase 7.4 proposals. Strict local MCP schemas accept
the new kinds; `get_capabilities` documents their semantics. Stable IDs, revision
checks, read/edit grants, explicit browser proposal approval, leased publication,
rollback and single-transaction Undo use the existing boundary. No agent privilege,
production import, remote endpoint or automatic approval was added.

Native **v20** is written only for new kinds or zero cylinder ends in either current
or original parameters. Existing files keep their older output version unless they
need newer metadata. v1–19 remain readable; new data relabelled with a lower version
is rejected, never silently reinterpreted. Current/original source-cache consistency
checks, recovery worker and ID-remapped Library copies use this same codec.

STL uses mm; choose **Use project physical scale** to retain calibrated size, since
its existing default longest-dimension override is still 100 mm. GLB uses metres
with one calibration factor. Separate-source export retains components; unified
Boolean export evaluates the solid with existing resolution and quality refusal.
Topology validation still reports boundary/non-manifold/inconsistent edges,
degenerates and inverted components. Thin tubes, tiny blunt tips and mathematical
apices can fall below sampling, Float32 mesh or printer resolution. Inspect actual
export diagnostics and the intended slicer; these checks do not establish minimum
wall thickness, freedom from all self-intersections, physical fit or printability.

Evidence and current acceptance results are in the newest six-part entry of
[Development Status](DEVELOPMENT_STATUS.md); local logs/images are under ignored
`work/primitive-expansion/`. Physical Quest and printer acceptance remain separate.

## Tyre shape and simpler previews (2026-11-07)

Torus accepts optional **`tyre: 0–100`**, a dimensionless percentage. Missing/zero
retains the original circular tube exactly. Increasing it changes the tube section
into a rounded square, producing a flat tread and firmer shoulders. At 100 the
corner radius is 15% of the tube radius; it retains a small round-over. Outer
radial diameter, overall Y thickness and hole diameter stay fixed. This is a solid
ring profile, without grooves or a hollow tyre cavity. SDF uses exact rounded-box
section distance; mesh and support bounds use the same section. Sampled Boolean
round-overs remain subject to existing grid resolution, not printer guarantees.

Desktop exposes a labelled percentage slider; Quest exposes the same numeric
percentage field. API create/update, batches and proposals retain it without unit
conversion; source scaling preserves it. Native **v21** is required when either
current/original source explicitly contains `tyre`, including zero. Lower tags reject
it. Existing torus files remain v20 and round. Saving, recovery and Library copies
use the same codec. Curved previews use 16 radial segments and fewer tube/cap bands;
applied/source export tessellation is unchanged. Cone numeric UI entries clamp below
zero to zero; API validation continues to reject negative diameters.

The tyre slider uses whole-number steps and a separate numeric readout, with
**0 = Torus** and **100 = Tyre** endpoints. Numeric UI tyre edits round to whole
numbers; API/native percentages retain their validated numeric precision.
