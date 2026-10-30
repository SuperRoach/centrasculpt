# Phase 4.8 — Advanced Layer Workflows

Use Layers to select a source or group. A source remains an independent sculpt volume; a group is a folder with a transform and inherited visibility/locking.

## Working with layers

- **Duplicate** a source from its More menu (VR) or source details (desktop). The copy has independent samples, masks and editable tube metadata. Progress can be cancelled without publishing a partial source. Undo removes the complete copy; Redo restores its identity.
- **Create Group** adds an empty folder. **Group this node** wraps the selected source/group. **Move to Group** offers Root and eligible parents; moving preserves the assembled world pose. Desktop parent selection requires **Move to selected group**.
- Select a group and use Move/Rotate/Scale or Tool Hand grab to transform its assembly. Select a child to sculpt, mask, deform or edit its spline independently. Groups have no sculpt surface of their own.
- Hide/lock a group to inherit those flags throughout its descendants. Each child retains its own flags for when the ancestor is enabled/unlocked. An unlocked ancestor can move a locked child's assembly; the child's local source stays unchanged.
- Rename with the VR keyboard or desktop name field followed by **Save name** (Enter also applies). Collapse/expand groups, and page through four VR rows at a time. Selection and collapsed state are session UI state.
- Up/down changes visual hierarchy order, moving a group's descendants together. **Boolean order** is a separate explicit operation because Difference and Intersect depend on sequence.
- Ungroup keeps children and preserves world poses. Deleting a group offers keep children or delete descendants; deletion of all sources or locked descendants is rejected. Group creation, name, reparent, transform, flags, order and deletion participate in Undo/Redo. Normal individual-source deletion retains the prior history-clearing behaviour.

## Storage and compatibility

Native format v7 adds bounded hierarchy metadata: local transforms/flags, parent IDs, group records, display order and Boolean sequence. Parent composition supplies effective source transforms to tools, composition, bake and export. Flat projects still select earlier compatible versions. Legacy files load as root sources; saving must never detach live owners. Recovery uses the same hierarchy validation/serialization, including its actual worker path. Embedded reference images and mask payloads continue through existing storage paths.

Groups allocate no SDF or surface. Limits are eight source volumes, 32 groups and depth eight. IDs, cycles, parents, orders, uniform group scale and effective transform bounds are checked before mutation. Reparenting decomposes the inverse-parent world pose. Copy uses independent buffers and conservative source/geometry/history memory accounting; failed/cancelled actions preserve prior state and redo. Group transforms do not remesh children. GLB stores assembled effective transforms and visibility; hierarchy helpers and mask overlays are excluded. Bake evaluates the separate Boolean sequence.

No linked instances, group-subtree duplication or VR drag/drop is included. Previous mask source-overlay and legacy nonuniform transform restrictions remain. Host benchmark timings are not headset frame-rate evidence.

## Evidence

`tests/advanced-layers.test.mjs` covers independent copies at 64³/128³/192³, grown lattices, masks, cancellation, history/resource disposal, inherited state, parent validation, grouped brushes/Move/stamps/tubes, actual controller bridges, native/recovery worker and all GLB presets. Full suite: 1,149 passed; advanced worker runner: 55 passed. Production build passed.

`outputs/phase-4-8/layer-benchmark.json` contains host-only measured copy/memory and group-transform results. Reproduce with `node scripts/benchmark-layer-workflows.mjs`. Open `scripts/fixtures/layer-workflows.html` through Vite for the actual XR palette beside grouped sources. Screenshots: `outputs/phase-4-8/layers-studio.jpg` and `layers-transparent.jpg` (simulated AR, not real Passthrough).

## Quest 3 acceptance

Every item below is **PENDING user confirmation**. Repeat controller interactions with left and right Tool Hand configurations; check real headset readability/reach, not just canvas screenshots.

1. Create two independent sculpt layers.
2. Duplicate one layer.
3. Move the duplicate independently.
4. Verify editing the duplicate does not change the original.
5. Create a group.
6. Move both layers into the group.
7. Grab and transform the group.
8. Confirm both children move together.
9. Rotate and scale the group.
10. Edit one child while grouped.
11. Hide and show the group.
12. Lock and unlock the group.
13. Reparent a layer while preserving its visible position.
14. Duplicate a masked layer and verify mask independence.
15. Group a procedural tube and edit its spline.
16. Undo/Redo grouping and transformations.
17. Save and reopen the project.
18. Export the grouped model as GLB.
19. Check Layers Palette in Studio and real Passthrough.
20. Confirm frame-rate and memory behaviour during sustained larger-scene use.

Next: Phase 4.9 — Colour and Material Painting. Later: Linked Instances, Advanced Scene Organisation and additional sculpting tools.
