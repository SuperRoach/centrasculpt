import { booleanUI } from "./boolean-ui";
import type { EditorToolState } from "./editor-tool-state";
import type { IndependentLayers } from "./independent-layers";
import { LayerGroup, validateHierarchy } from "./layer-hierarchy";
import { newId } from "./layers";
import type { MenuButton, MenuContent } from "./xr-menu-model";

const PAGE = 4;
/** Explicit ray targets instead of drag/drop. Page size stays fixed at both UI scales. */
export class LayerPaletteModel {
  dragged: string | null = null;
  private resample: { id: string; from: number; to: number } | null = null;
  page = 0;
  context: string | null = null;
  view: "list" | "node" | "parents" | "rename" | "delete" | "boolean" | "resolution" | "live" =
    "list";
  private liveSource = 0;
  private liveModifier = 0;
  name = "";
  keyPage = 0;
  shift = false;
  symbols = false;
  private copy?: AbortController;
  feedback = "";
  constructor(readonly tools: EditorToolState) {}
  close() {
    this.resample = null;
    this.dragged = null;
    this.copy?.abort();
    this.copy = undefined;
    this.context = null;
    this.view = "list";
    this.page = 0;
  }
  beginDrag(id: string): void {
    const l = this.tools.port.layers();
    if (this.tools.busy || !l.project.layerStack.hierarchy.get(id).editable) return;
    this.dragged = id;
    this.feedback = "Release over a layer to attach, or Outside to detach";
  }
  dropPreview(target: string | null): {
    valid: boolean;
    parent: string | null | undefined;
    message: string;
    colour: string;
  } {
    const l = this.tools.port.layers(),
      h = l.project.layerStack.hierarchy,
      id = this.dragged,
      layer = l.project.layerStack.layers.find((n) => n.id === id),
      colour = layer ? l.display.colour(l.project.id, layer.id, layer.order) : "#b2e5ce";
    let parent: string | null | undefined;
    if (target === "hier:root") parent = null;
    else if (target) {
      for (const prefix of [
        "select:",
        "hier:group:",
        "hier:node:",
        "hier:drag:",
        "visible:",
        "locked:",
      ])
        if (target.startsWith(prefix)) {
          parent = target.slice(prefix.length);
          break;
        }
    }
    const fail = (message: string) => ({ valid: false, parent, message, colour });
    if (!id || parent === undefined) return fail("Release to cancel · point at a layer or Outside");
    if (this.tools.busy) return fail("Cannot drop while busy");
    if (parent === id) return fail("Cannot attach a layer to itself");
    if (parent && h.descendants(id).includes(parent)) return fail("Cannot attach to a child layer");
    try {
      if (!h.get(id).editable || (parent && !h.get(parent).editable))
        return fail("Cannot drop · layer is hidden or locked");
      const state = h.snapshot(),
        node = [...state.layers, ...state.groups].find((n) => n.id === id)!;
      node.parentId = parent;
      validateHierarchy(
        state,
        state.layers.map((n) => n.id),
      );
    } catch {
      return fail("Cannot drop here · hierarchy limit");
    }
    return {
      valid: true,
      parent,
      message: parent
        ? `Release to attach to ${h.get(parent).name}`
        : "Release to detach · Outside all layers",
      colour,
    };
  }
  endDrag(target: string | null): void {
    const id = this.dragged,
      drop = this.dropPreview(target);
    this.dragged = null;
    if (!id) return;
    if (!drop.valid) {
      this.feedback = drop.message;
      return;
    }
    try {
      this.tools.port.layers().reparent(id, drop.parent!);
      this.feedback = drop.parent ? "Attached to layer" : "Moved outside";
      this.tools.port.changed();
    } catch (e) {
      this.feedback = e instanceof Error ? e.message : String(e);
    }
  }
  content(): MenuContent {
    const l = this.tools.port.layers(),
      h = l.project.layerStack.hierarchy,
      busy = this.tools.busy,
      buttons: MenuButton[] = [],
      labels: MenuContent["labels"] = [];
    const add = (
      id: string,
      label: string,
      x: number,
      y: number,
      width: number,
      height = 110,
      disabled = busy,
      detail?: string,
      selected = false,
    ) => buttons.push({ id, label, detail, rect: { x, y, width, height }, disabled, selected });
    const nav = () => add("hier:list", "‹ Layers", 40, 140, 340, 74, false);
    if (this.copy) {
      add("hier:cancel-copy", "Cancel duplication", 40, 440, 1072, 136, false);
      return {
        title: "DUPLICATING LAYER",
        subtitle: this.feedback,
        buttons,
        labels,
        footer: "Original source and redo remain intact until completion",
      };
    }
    if (this.context) {
      try {
        h.get(this.context);
      } catch {
        this.context = null;
        this.view = "list";
      }
    }
    if (this.view === "rename" && this.context) {
      nav();
      labels.push({ text: `${this.name.slice(-46)}│`, x: 40, y: 244, width: 1072, height: 90 });
      const rows = this.symbols
        ? ["1234567890", "-_/().,:!?", `@#&+*="'`]
        : ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
      rows.forEach((row, r) => {
        const width = 100,
          gap = 8,
          start = (1152 - (row.length * (width + gap) - gap)) / 2;
        [...row].forEach((char, i) => {
          const key = this.shift && !this.symbols ? char.toUpperCase() : char;
          add(`hier:key:${key}`, key, start + i * (width + gap), 370 + r * 122, width, 108, false);
        });
      });
      add(
        "hier:key-shift",
        this.shift ? "SHIFT ↑" : "Shift ↑",
        40,
        754,
        200,
        100,
        false,
        undefined,
        this.shift,
      );
      add("hier:key-space", "Space", 256, 754, 384, 100, false);
      add("hier:key-back", "⌫ Delete", 656, 754, 256, 100, false);
      add(
        "hier:key-symbols",
        this.symbols ? "ABC" : "123 / #",
        928,
        754,
        184,
        100,
        false,
        undefined,
        this.symbols,
      );
      add("hier:key-clear", "Clear name", 40, 872, 300, 64, false);
      add("hier:node-back", "Cancel", 40, 960, 524, 88, false);
      add("hier:rename-done", "Save name", 588, 960, 524, 88, busy || !this.name.trim());
      return {
        title: "RENAME",
        subtitle: "QWERTY · Tool ray + trigger · 128 characters maximum",
        buttons,
        labels,
        footer:
          this.feedback ||
          "Shift for capitals · 123 for numbers and symbols · Cancel keeps original",
      };
    }
    if (this.view === "parents" && this.context) {
      nav();
      const excluded = new Set([this.context, ...h.descendants(this.context)]),
        choices = [
          { id: "root", name: "Outside · sculpture root" },
          ...h.groups
            .filter((g) => !excluded.has(g.id) && g.editable)
            .map((g) => ({ id: g.id, name: g.name })),
        ];
      this.page = Math.max(0, Math.min(this.page, Math.ceil(choices.length / PAGE) - 1));
      add("hier:prev", "‹", 788, 140, 144, 74, this.page === 0);
      add("hier:next", "›", 948, 140, 164, 74, (this.page + 1) * PAGE >= choices.length);
      choices.slice(this.page * PAGE, this.page * PAGE + PAGE).forEach((g, i) => {
        add(
          `hier:parent:${g.id}`,
          g.name,
          40,
          244 + i * 174,
          1072,
          150,
          busy,
          "Preserve visible pose",
        );
      });
      return {
        title: "ATTACH TO LAYER",
        subtitle: h.get(this.context).name,
        buttons,
        labels,
        footer: this.feedback || "No voxel resampling · parent transform stays separate",
      };
    }
    if (this.view === "delete" && this.context) {
      nav();
      add(
        "hier:ungroup",
        "Ungroup · keep all children",
        40,
        284,
        1072,
        150,
        busy,
        "Preserve their visible positions",
      );
      add(
        "hier:delete-children",
        "Delete group AND its children",
        40,
        484,
        1072,
        150,
        busy,
        "One Undo action · at least one sculpt layer must remain",
      );
      add("hier:node-back", "Cancel", 40, 784, 1072, 120, false);
      return {
        title: "DELETE GROUP?",
        subtitle: h.get(this.context).name,
        buttons,
        labels,
        footer: this.feedback || "Children are kept unless explicitly deleted above",
      };
    }
    if (this.view === "live" && this.context) {
      const target = l.project.layerStack.get(this.context),
        sources = l.project.layerStack.layers.filter((s) => s.id !== target.id),
        modifiers = target.booleanModifiers ?? [];
      const source = sources[this.liveSource % Math.max(1, sources.length)],
        m = modifiers[this.liveModifier % Math.max(1, modifiers.length)];
      nav();
      add(
        "hier:live-source",
        `Source: ${source?.name ?? "Create another shape"} ›`,
        40,
        240,
        1072,
        100,
        busy || !source,
      );
      for (const [i, op] of (["union", "difference", "intersect"] as const).entries())
        add(
          `hier:live-add:${op}`,
          op === "union" ? "Add" : op === "difference" ? "Subtract" : "Intersect",
          40 + i * 362,
          356,
          348,
          100,
          busy || !source || !target.editable,
        );
      add(
        "hier:live-modifier",
        m
          ? `Modifier ${(this.liveModifier % modifiers.length) + 1}: ${m.operation} ${l.project.layerStack.get(m.sourceId).name} ›`
          : "No modifiers",
        40,
        476,
        1072,
        100,
        busy || !m,
      );
      add("hier:live-select", "Edit source", 40, 594, 342, 100, busy || !m);
      add("hier:live-toggle", m?.enabled ? "Disable" : "Enable", 404, 594, 342, 100, busy || !m);
      add("hier:live-remove", "Remove", 768, 594, 344, 100, busy || !m);
      add(
        "hier:live-earlier",
        "Move earlier",
        40,
        714,
        342,
        100,
        busy || !m || this.liveModifier % modifiers.length === 0,
      );
      add("hier:live-operation", "Operation ›", 404, 714, 342, 100, busy || !m);
      add("hier:live-bake", "Bake visible result", 768, 714, 344, 100, busy);
      add("hier:node-back", "Back to layer actions", 40, 844, 1072, 110, false);
      return {
        title: "LIVE BOOLEAN SHAPES",
        subtitle: target.name,
        buttons,
        labels,
        footer:
          this.feedback ||
          "Top to bottom · enabled sources appear only in result · editable until explicit Bake",
      };
    }
    if (this.view === "boolean" && this.context) {
      const n = h.get(this.context),
        index = h.compositionOrder.indexOf(n.id);
      nav();
      add(
        "hier:boolean-up",
        "Evaluate earlier",
        40,
        354,
        1072,
        150,
        busy || index <= 0 || n.locked,
      );
      add(
        "hier:boolean-down",
        "Evaluate later",
        40,
        554,
        1072,
        150,
        busy || index === h.compositionOrder.length - 1 || n.locked,
      );
      add("hier:live", "Live Boolean Shapes…", 40, 724, 1072, 100, busy);
      add("hier:node-back", "Back to layer actions", 40, 844, 1072, 136, false);
      return {
        title: "BOOLEAN SEQUENCE",
        subtitle: `Step ${index + 1} / ${h.compositionOrder.length} · ${n.name}`,
        buttons,
        labels,
        footer: "Explicitly changes the Boolean result · one Undo action",
      };
    }
    if (this.view === "resolution" && this.resample) {
      const r = this.resample;
      nav();
      labels.push(
        { text: `${r.from}³ → ${r.to}³`, x: 56, y: 280, width: 1000, height: 70, value: true },
        {
          text: "Resampling clears this layer’s sculpt Undo history.",
          x: 56,
          y: 390,
          width: 1000,
          height: 100,
        },
        {
          text:
            r.to < r.from
              ? "Decreasing resolution can permanently remove fine detail."
              : "Increasing resolution adds editing detail; it does not restore lost detail.",
          x: 56,
          y: 510,
          width: 1000,
          height: 120,
        },
      );
      add("hier:resample-confirm", "Apply resolution change", 40, 714, 1072, 136, busy);
      add("hier:node-back", "Cancel", 40, 884, 1072, 120, false);
      return {
        title: "CHANGE LAYER RESOLUTION",
        subtitle: h.get(r.id).name,
        buttons,
        labels,
        footer: this.feedback || "Other layers and transforms are kept",
      };
    }
    if (this.view === "node" && this.context) {
      const n = h.get(this.context),
        group = n instanceof LayerGroup,
        siblings = h.children(h.parent(n.id)),
        index = siblings.indexOf(n.id);
      nav();
      add(
        "hier:transform",
        "Transform",
        40,
        244,
        524,
        240,
        busy || !n.editable,
        "Move · Rotate · Scale",
      );
      if (!group) {
        const resolution = n.volume.resolution,
          steps = [64, 128, 192],
          up = steps.find((v) => v > resolution),
          down = [...steps].reverse().find((v) => v < resolution),
          blocked = busy || !n.editable || !!(n.procedural || n.primitive);
        add(
          "hier:upres",
          "Increase Res",
          588,
          244,
          524,
          110,
          blocked || !up,
          up ? `${resolution}³ → ${up}³` : `Maximum · ${resolution}³`,
        );
        add(
          "hier:downres",
          "Decrease Res",
          588,
          374,
          524,
          110,
          blocked || !down,
          down ? `${resolution}³ → ${down}³` : `Minimum · ${resolution}³`,
        );
      }
      add("hier:duplicate", "Duplicate", 40, 524, 524, 110, busy || group || !n.editable);
      add("hier:rename", "Rename", 588, 524, 524, 110, busy || n.locked);
      add("hier:parents", "Attach to layer", 40, 654, 524, 110, busy || !n.editable);
      add(
        `hier:fold:${n.id}`,
        l.collapsedGroups.has(n.id) ? "Expand children" : "Collapse children",
        588,
        654,
        524,
        110,
        !h.children(n.id).length,
      );
      add("hier:up", "Move up", 40, 784, 524, 110, busy || index === 0 || !n.editable);
      add(
        "hier:down",
        "Move down",
        588,
        784,
        524,
        110,
        busy || index === siblings.length - 1 || !n.editable,
      );
      if (!group) add("hier:boolean", "Boolean order…", 40, 914, 1072, 110, busy || n.locked);
      else {
        add("hier:ungroup", "Ungroup", 588, 244, 524, 110, busy || !n.editable);
        add("hier:delete", "Delete group…", 588, 374, 524, 110, busy || !n.editable);
      }
      return {
        title: group ? "GROUP OPTIONS" : "LAYER OPTIONS",
        subtitle: group ? n.name : `${n.name} · ${n.volume.resolution}³`,
        buttons,
        labels,
        footer: this.feedback || "Resolution changes require confirmation",
      };
    }
    const rows = l.hierarchyRows(),
      pages = Math.max(1, Math.ceil(rows.length / PAGE));
    this.page = Math.min(this.page, pages - 1);
    add("hier:root", "Outside", 400, 140, 360, 74, busy, "Drop here to detach");
    add("hier:prev", "‹", 788, 140, 144, 74, this.page === 0);
    add("hier:next", "›", 948, 140, 164, 74, this.page === pages - 1);
    rows.slice(this.page * PAGE, this.page * PAGE + PAGE).forEach((row, i) => {
      const n = h.get(row.id),
        y = 244 + i * 140,
        indent = Math.min(row.depth, 3) * 48,
        selected = row.group
          ? l.selectedGroupId === n.id
          : !l.selectedGroupId && l.project.activeLayerId === n.id;
      add(`hier:drag:${n.id}`, "Drag layer", 40 + indent, y, 104, 112, busy || !n.editable);
      add(
        `${row.group ? "hier:group:" : "select:"}${n.id}`,
        n.name,
        164 + indent,
        y,
        396 - indent,
        112,
        busy,
        undefined,
        selected,
      );
      const entry = buttons[buttons.length - 1],
        children = h.descendants(n.id).length;
      entry.layerInfo = {
        resolution: row.group ? undefined : l.project.layerStack.get(n.id).volume.resolution,
        operation: row.group ? undefined : l.project.layerStack.get(n.id).operation,
        primitive: row.group ? undefined : l.project.layerStack.get(n.id).primitive?.kind,
        tube: !row.group && !!l.project.layerStack.get(n.id).procedural,
        children,
        collapsed: l.collapsedGroups.has(n.id),
      };
      if (!row.group)
        entry.colour = l.display.colour(l.project.id, n.id, l.project.layerStack.get(n.id).order);
      add(
        `visible:${n.id}`,
        n.localVisible ? "Visible" : "Hidden",
        576,
        y,
        160,
        112,
        busy || h.parentsLocked(n.id),
        n.localVisible && !n.visible ? "Hidden by parent" : n.visible ? "Visible" : "Hidden",
      );
      buttons[buttons.length - 1].muted = n.localVisible && !n.visible;
      add(
        `locked:${n.id}`,
        n.localLocked ? "Unlock" : "Lock",
        752,
        y,
        176,
        112,
        busy || h.parentsLocked(n.id),
        n.locked ? "Locked" : "Unlocked",
      );
      add(`hier:node:${n.id}`, "More", 944, y, 168, 112, busy);
    });
    add(
      "new-layer",
      "＋ Add New Layer",
      40,
      960,
      524,
      78,
      busy || l.project.layerStack.layers.length >= 8,
      l.project.layerStack.layers.length >= 8
        ? "Maximum of 8 layers reached"
        : "Empty clay volume · 64³",
    );
    add(
      "merge-layers",
      "Merge with…",
      588,
      960,
      524,
      78,
      busy || l.project.layerStack.layers.length >= 8 || l.project.layerStack.layers.length < 2,
    );
    return {
      title: "LAYERS",
      subtitle: `Page ${this.page + 1} / ${pages} · indented rows are children`,
      buttons,
      labels,
      footer: this.feedback || "Tool stick ↑ / ↓ changes page · hold grip icon to drag",
    };
  }
  activate(id: string): boolean {
    if (!id.startsWith("hier:")) return false;
    const l = this.tools.port.layers(),
      h = l.project.layerStack.hierarchy,
      parts = id.split(":"),
      action = parts[1],
      value = parts.slice(2).join(":");
    if (action === "cancel-copy") {
      this.copy?.abort();
      return true;
    }
    if (action === "fold") {
      l.collapsedGroups.has(value) ? l.collapsedGroups.delete(value) : l.collapsedGroups.add(value);
      return true;
    }
    if (action === "list") {
      this.view = "list";
      this.context = null;
      this.page = 0;
      return true;
    }
    if (action === "prev") {
      this.page--;
      return true;
    }
    if (action === "next") {
      this.page++;
      return true;
    }
    if (this.tools.busy) throw new Error("Finish the current interaction first.");
    if (action === "group") {
      l.selectGroup(value);
      this.tools.select("transform");
    } else if (action === "node") {
      this.context = value;
      this.view = "node";
    } else if (action === "node-back") this.view = "node";
    else if (action === "create") {
      l.createGroup();
      this.tools.select("transform");
    } else if (action === "keys-prev") this.keyPage--;
    else if (action === "keys-next") this.keyPage++;
    else if (action === "key-shift") this.shift = !this.shift;
    else if (action === "key-symbols") this.symbols = !this.symbols;
    else if (action === "key") this.name = (this.name + value).slice(0, 128);
    else if (action === "key-space") this.name = (this.name + " ").slice(0, 128);
    else if (action === "key-back") this.name = this.name.slice(0, -1);
    else if (action === "key-clear") this.name = "";
    else if (this.context) {
      const n = h.get(this.context);
      if (action === "live") {
        this.view = "live";
        this.liveSource = 0;
        this.liveModifier = 0;
      } else if (action.startsWith("live-")) {
        const target = l.project.layerStack.get(n.id),
          ms = structuredClone(target.booleanModifiers ?? []),
          index = this.liveModifier % Math.max(1, ms.length),
          m = ms[index],
          sources = l.project.layerStack.layers.filter((s) => s.id !== target.id);
        if (action === "live-source") this.liveSource++;
        else if (action === "live-modifier") this.liveModifier++;
        else if (action === "live-add")
          l.setBooleanModifiers(target.id, [
            ...ms,
            {
              id: newId(),
              sourceId: sources[this.liveSource % sources.length].id,
              operation: value,
              enabled: true,
            },
          ]);
        else if (action === "live-select" && m) {
          l.select(m.sourceId);
          this.context = m.sourceId;
          this.view = "node";
        } else if (action === "live-toggle" && m) {
          m.enabled = !m.enabled;
          l.setBooleanModifiers(target.id, ms);
        } else if (action === "live-remove" && m)
          l.setBooleanModifiers(
            target.id,
            ms.filter((s) => s.id !== m.id),
          );
        else if (action === "live-operation" && m) {
          m.operation =
            m.operation === "union"
              ? "difference"
              : m.operation === "difference"
                ? "intersect"
                : "union";
          l.setBooleanModifiers(target.id, ms);
        } else if (action === "live-earlier" && m && index > 0) {
          [ms[index - 1], ms[index]] = [ms[index], ms[index - 1]];
          l.setBooleanModifiers(target.id, ms);
          this.liveModifier = index - 1;
        } else if (action === "live-bake")
          void l.bake({ name: "Boolean baked", resolution: 128, hideSources: true }).catch((e) => {
            this.feedback = String(e);
          });
      } else if (action === "boolean") this.view = "boolean";
      else if (action === "boolean-up" || action === "boolean-down")
        l.moveBoolean(n.id, action === "boolean-up" ? -1 : 1);
      else if (action === "transform") {
        n instanceof LayerGroup ? l.selectGroup(n.id) : l.select(n.id);
        this.tools.select("transform");
      } else if (action === "upres" || action === "downres") {
        if (n instanceof LayerGroup || !n.editable || n.procedural || n.primitive)
          throw new Error("Select an editable sculpt layer.");
        const steps = action === "upres" ? [64, 128, 192] : [192, 128, 64],
          to = steps.find((v) =>
            action === "upres" ? v > n.volume.resolution : v < n.volume.resolution,
          );
        if (to) {
          this.resample = { id: n.id, from: n.volume.resolution, to };
          this.view = "resolution";
        }
      } else if (action === "resample-confirm") {
        const r = this.resample;
        if (!r || r.id !== n.id || n instanceof LayerGroup || n.volume.resolution !== r.from)
          throw new Error("Layer changed; choose resolution again.");
        l.select(n.id);
        l.resampleActive(r.to);
        this.feedback = `Resolution changed to ${r.to}³`;
        this.resample = null;
        this.view = "node";
      } else if (action === "rename") {
        this.name = n.name;
        this.view = "rename";
        this.keyPage = 0;
        this.shift = false;
        this.symbols = false;
      } else if (action === "rename-done") {
        l.renameNode(n.id, this.name);
        this.view = "node";
      } else if (action === "parents") {
        this.view = "parents";
        this.page = 0;
      } else if (action === "parent") {
        l.reparent(n.id, value === "root" ? null : value);
        this.view = "node";
      } else if (action === "wrap") {
        l.groupNode(n.id);
        this.view = "list";
      } else if (action === "up" || action === "down") l.moveNode(n.id, action === "up" ? -1 : 1);
      else if (action === "ungroup") {
        l.deleteGroup(n.id, "keep");
        this.view = "list";
        this.context = null;
      } else if (action === "delete") this.view = "delete";
      else if (action === "delete-children") {
        l.deleteGroup(n.id, "delete");
        this.view = "list";
        this.context = null;
      } else if (action === "duplicate") {
        const abort = new AbortController();
        this.copy = abort;
        void l
          .duplicateAsync(n.id, abort.signal, (text) => {
            this.feedback = text;
          })
          .then(() => {
            this.view = "list";
            this.context = null;
            this.tools.port.changed();
          })
          .catch((e) => {
            this.feedback = e instanceof Error ? e.message : String(e);
          })
          .finally(() => {
            this.copy = undefined;
          });
      }
    }
    this.tools.port.changed();
    return true;
  }
}
/** Desktop companion: native inputs for names/parents, shared atomic layer commands. */
export class DesktopLayerPalette {
  private readonly booleans: ReturnType<typeof booleanUI>;
  private readonly host = document.createElement("div");
  private dragged: string | null = null;
  private resample: { id: string; from: number; to: number } | null = null;
  private key = "";
  private abort?: AbortController;
  constructor(
    private layers: () => IndependentLayers,
    private legacy: HTMLElement,
    private transform: () => void,
    private changed: () => void,
    private error: (text: string) => void,
    private busy: () => boolean = () => false,
    private beforeAction: () => void = () => {},
  ) {
    legacy.before(this.host);
    this.host.className = "hierarchy-palette";
    legacy.hidden = true;
    this.booleans = booleanUI(this.layers, document.createElement("div"), this.busy, this.changed);
  }
  render(): void {
    this.booleans.sync();
    const l = this.layers(),
      h = l.project.layerStack.hierarchy,
      key = JSON.stringify([
        h.snapshot(),
        l.project.layerStack.layers.map((layer) =>
          l.display.colour(l.project.id, layer.id, layer.order),
        ),
        l.project.layerStack.layers.map((layer) => layer.booleanModifiers),
        l.selectedGroupId,
        l.project.activeLayerId,
        [...l.collapsedGroups],
        l.duplicating,
        this.busy(),
      ]);
    if (key === this.key) return;
    this.key = key;
    this.host.replaceChildren();
    const run = (action: () => void) => {
      if (this.busy()) return;
      try {
        this.beforeAction();
        action();
        this.changed();
      } catch (e) {
        this.error(e instanceof Error ? e.message : String(e));
      }
    };
    const button = (host: HTMLElement, label: string, action: () => void, disabled = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.disabled = disabled || l.duplicating || this.busy();
      b.onclick = () => run(action);
      host.append(b);
      return b;
    };
    const root = document.createElement("div");
    root.className = "hierarchy-root-drop";
    root.textContent = "Drop here to move outside";
    this.host.append(root);
    const wireDrop = (target: HTMLElement, parent: string | null) => {
      target.ondragover = (e) => {
        if (this.dragged && !this.busy() && !l.duplicating) {
          e.preventDefault();
          target.classList.add("drop-target");
        }
      };
      target.ondragleave = () => target.classList.remove("drop-target");
      target.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        target.classList.remove("drop-target");
        const id = this.dragged;
        this.dragged = null;
        if (id && id !== parent) run(() => l.reparent(id, parent));
      };
    };
    wireDrop(root, null);
    if (l.duplicating) {
      const cancel = button(this.host, "Cancel duplication", () => this.abort?.abort());
      cancel.disabled = false;
    }
    for (const row of l.hierarchyRows()) {
      const n = h.get(row.id),
        card = document.createElement("div");
      card.className = `hierarchy-row${(row.group ? l.selectedGroupId === n.id : !l.selectedGroupId && l.project.activeLayerId === n.id) ? " active" : ""}`;
      card.style.marginLeft = `${row.depth * 12}px`;
      if (row.depth) {
        card.classList.add("hierarchy-child");
        card.title = "Child of " + h.get(h.parent(n.id)!).name;
      }
      card.dataset.nodeId = n.id;
      this.host.append(card);
      wireDrop(card, n.id);
      const header = document.createElement("div");
      header.className = "hierarchy-row-header";
      card.append(header);
      const handle = button(header, "⠿", () => {}, !n.editable);
      handle.title = "Drag onto a layer to attach; drag outside to detach";
      handle.setAttribute("aria-label", "Drag " + n.name);
      handle.draggable = n.editable && !this.busy();
      handle.ondragstart = (e) => {
        if (this.busy() || l.duplicating) {
          e.preventDefault();
          return;
        }
        this.dragged = n.id;
        e.dataTransfer?.setData("text/plain", n.id);
      };
      handle.ondragend = () => {
        this.dragged = null;
        for (const el of this.host.querySelectorAll(".drop-target"))
          el.classList.remove("drop-target");
      };
      if (h.children(n.id).length) {
        const fold = button(header, l.collapsedGroups.has(n.id) ? "▸" : "▾", () => {
          l.collapsedGroups.has(n.id)
            ? l.collapsedGroups.delete(n.id)
            : l.collapsedGroups.add(n.id);
        });
        fold.setAttribute(
          "aria-label",
          l.collapsedGroups.has(n.id) ? "Expand children" : "Collapse children",
        );
        fold.setAttribute("aria-expanded", String(!l.collapsedGroups.has(n.id)));
        fold.className = "hierarchy-fold";
      }
      const title = button(header, n.name, () => {
        row.group ? (l.selectGroup(n.id), this.transform()) : l.select(n.id);
      });
      title.className = "hierarchy-name";
      const nameLabel = document.createElement("span");
      nameLabel.className = "layer-name-label";
      nameLabel.textContent = n.name;
      title.replaceChildren(nameLabel);
      title.title = n.name;
      const swatch = document.createElement("span");
      swatch.className = row.group ? "layer-swatch group-swatch" : "layer-swatch";
      swatch.setAttribute("aria-hidden", "true");
      if (!row.group) {
        const layer = l.project.layerStack.get(n.id);
        swatch.style.backgroundColor = l.display.colour(l.project.id, n.id, layer.order);
      }
      title.prepend(swatch);
      if (!row.group) {
        const modifiers = l.project.layerStack.get(n.id).booleanModifiers ?? [],
          consumers = l.project.layerStack.layers.filter((layer) =>
            layer.booleanModifiers?.some((m) => m.enabled && m.sourceId === n.id),
          );
        if (modifiers.length || consumers.length) {
          const info = document.createElement("small");
          info.textContent = modifiers.length ? `Live CSG · ${modifiers.length}` : "CSG source";
          info.title = modifiers.length
            ? "Editable modifiers in Live Boolean Shapes"
            : `Used by ${consumers.map((l) => l.name).join(", ")}; excluded from independent Boolean output`;
          info.className = "layer-csg-info";
          card.append(info);
        }
      }
      const visibility = button(
        header,
        "",
        () => l.setNodeFlag(n.id, "visible", !n.localVisible),
        h.parentsLocked(n.id),
      );
      visibility.className = "layer-visibility";
      const inheritedHidden = n.localVisible && !n.visible;
      visibility.dataset.inheritedHidden = String(inheritedHidden);
      visibility.title = inheritedHidden
        ? "Visible locally · hidden by parent"
        : n.localVisible
          ? "Hide layer"
          : "Show layer";
      if (inheritedHidden)
        visibility.setAttribute(
          "aria-description",
          "Visibility is enabled for this layer, but a parent is hidden.",
        );
      visibility.setAttribute("aria-label", `${n.localVisible ? "Hide" : "Show"} ${n.name}`);
      visibility.setAttribute("aria-pressed", String(n.localVisible));
      visibility.innerHTML = n.localVisible
        ? '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a20 20 0 0 1-3.2 4M6.2 6.2A22 22 0 0 0 2 12s3.5 7 10 7a13 13 0 0 0 5.8-1.8"/></svg>';

      const lock = button(
        header,
        "",
        () => l.setNodeFlag(n.id, "locked", !n.localLocked),
        h.parentsLocked(n.id),
      );
      lock.className = "layer-lock";
      lock.title = h.parentsLocked(n.id)
        ? "Locked by parent"
        : n.localLocked
          ? "Unlock layer"
          : "Lock layer";
      lock.setAttribute("aria-label", `${n.localLocked ? "Unlock" : "Lock"} ${n.name}`);
      lock.setAttribute("aria-pressed", String(n.locked));
      lock.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="${n.locked ? "M8 10V7a4 4 0 0 1 8 0v3" : "M8 10V7a4 4 0 0 1 8 0"}"/><path d="M12 14v3"/></svg>`;
      if (h.children(n.id).length && l.collapsedGroups.has(n.id)) {
        const count = document.createElement("span");
        count.className = "layer-child-count";
        count.textContent = String(h.descendants(n.id).length);
        count.setAttribute("aria-label", `${h.descendants(n.id).length} nested items`);
        title.append(count);
        card.classList.add("children-collapsed");
      }
      const selected = row.group
        ? l.selectedGroupId === n.id
        : !l.selectedGroupId && l.project.activeLayerId === n.id;
      if (!selected) continue;
      const name = document.createElement("input");
      name.value = n.name;
      name.maxLength = 128;
      name.setAttribute("aria-label", "Rename " + n.name);
      name.disabled = n.locked || this.busy() || l.duplicating;
      name.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          run(() => l.renameNode(n.id, name.value));
        }
      });
      card.append(name);
      if (!row.group) card.append(this.booleans.element);

      const parentActions = document.createElement("details"),
        parentSummary = document.createElement("summary");
      parentSummary.textContent = "Attach / detach…";
      parentSummary.title =
        "Attach this layer to a parent so it follows the parent’s movement, rotation, scale, visibility and locking. Choose Outside to detach. Its current position is preserved.";
      parentActions.append(parentSummary);
      card.append(parentActions);
      const parent = document.createElement("select");
      parent.setAttribute("aria-label", "Parent layer for " + n.name);
      parent.add(new Option("Outside · sculpture root", ""));
      const excluded = new Set([n.id, ...h.descendants(n.id)]);
      for (const group of [...h.groups, ...l.project.layerStack.layers])
        if (!excluded.has(group.id)) parent.add(new Option(group.name, group.id));
      parent.value = h.parent(n.id) ?? "";
      parent.disabled = !n.editable || l.duplicating || this.busy();
      const parentChoice = document.createElement("div");
      parentChoice.className = "parent-layer-choice";
      const parentSwatch = document.createElement("span");
      parentSwatch.className = "layer-swatch";
      parentSwatch.setAttribute("aria-hidden", "true");
      const updateParentSwatch = () => {
        const selected = l.project.layerStack.layers.find((layer) => layer.id === parent.value);
        parentSwatch.style.backgroundColor = selected
          ? l.display.colour(l.project.id, selected.id, selected.order)
          : "transparent";
        parentSwatch.title = selected ? selected.name : parent.value ? "Group" : "Outside";
      };
      parent.addEventListener("change", updateParentSwatch);
      updateParentSwatch();
      parentChoice.append(parentSwatch, parent);
      parentActions.append(parentChoice);
      button(parentActions, "Apply", () => l.reparent(n.id, parent.value || null), !n.editable);
      const actions = document.createElement("div"),
        primary = document.createElement("div");
      actions.className = "layer-action-layout";
      primary.className = "layer-action-stack";
      actions.append(primary);
      card.append(actions);
      const transform = button(
        primary,
        "Transform",
        () => {
          this.transform();
        },
        !n.editable,
      );
      iconAction(
        transform,
        "Transform",
        '<path d="M12 3v18M3 12h18m-12-6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/>',
      );
      const siblings = h.children(h.parent(n.id)),
        index = siblings.indexOf(n.id),
        reorder = document.createElement("div");
      reorder.className = "layer-reorder";
      reorder.setAttribute("role", "group");
      reorder.setAttribute("aria-label", "Layer order");
      const up = button(reorder, "↑", () => l.moveNode(n.id, -1), index === 0 || !n.editable),
        down = button(
          reorder,
          "↓",
          () => l.moveNode(n.id, 1),
          index === siblings.length - 1 || !n.editable,
        );
      up.title = "Move up in layer list";
      up.setAttribute("aria-label", "Move " + n.name + " up");
      down.title = "Move down in layer list";
      down.setAttribute("aria-label", "Move " + n.name + " down");
      if (row.group) {
        card.append(reorder);
        button(card, "Ungroup · keep children", () => l.deleteGroup(n.id, "keep"), !n.editable);
        const details = document.createElement("details"),
          summary = document.createElement("summary");
        summary.textContent = "Delete group and children…";
        details.append(summary);
        button(
          details,
          "Confirm delete group AND children",
          () => l.deleteGroup(n.id, "delete"),
          !n.editable,
        );
        card.append(details);
      } else {
        const duplicate = button(
          primary,
          "Duplicate",
          () => {
            this.abort = new AbortController();
            void l
              .duplicateAsync(n.id, this.abort.signal)
              .then(() => {
                this.key = "";
                this.changed();
              })
              .catch((e) => this.error(String(e)))
              .finally(() => {
                this.abort = undefined;
                this.key = "";
                this.changed();
              });
            this.key = "";
            this.changed();
          },
          !n.editable,
        );
        iconAction(
          duplicate,
          "Duplicate layer",
          '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
        );
        const remove = button(
          primary,
          "Delete layer",
          () => {
            this.legacy
              .querySelector<HTMLButtonElement>(`[data-layer-id="${n.id}"] [data-action="delete"]`)
              ?.click();
          },
          n.locked || l.project.layerStack.layers.length === 1,
        );
        iconAction(
          remove,
          "Delete layer",
          '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
        );
        remove.classList.add("layer-delete");
        const settings = document.createElement("div");
        settings.className = "layer-compact-settings";
        settings.append(reorder);
        card.append(settings);
        const layer = l.project.layerStack.get(n.id),
          colour = document.createElement("input");
        colour.type = "color";
        colour.value = l.display.colour(l.project.id, n.id, layer.order);
        colour.setAttribute("aria-label", "Viewport colour for " + n.name);
        colour.disabled = this.busy() || l.duplicating;
        colour.addEventListener("change", () =>
          run(() => {
            l.display.setColour(l.project.id, n.id, colour.value);
            l.syncPresentation();
          }),
        );
        colour.title = "Layer display colour";
        settings.append(colour);
        const operation = document.createElement("select");
        operation.setAttribute("aria-label", "Boolean operation for " + n.name);
        for (const [op, label] of [
          ["union", "∪ Union"],
          ["difference", "− Subtract"],
          ["intersect", "∩ Intersect"],
        ])
          operation.add(new Option(label, op));
        operation.title = "Boolean operation";
        operation.value = layer.operation;
        operation.disabled = layer.locked;
        operation.addEventListener("change", () =>
          run(() => l.setOperation(n.id, operation.value as "union" | "difference" | "intersect")),
        );
        settings.append(operation);
        const order = document.createElement("div");
        order.className = "boolean-order";
        const booleanIndex = h.compositionOrder.indexOf(n.id),
          label = document.createElement("span");
        label.textContent = `Boolean order · ${booleanIndex + 1}`;
        order.append(label);
        order.title = "Order in which layers combine in the Boolean result";
        const advanced = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "Boolean order";
        advanced.className = "layer-boolean-settings";
        advanced.title =
          "Evaluation order affects subtraction and intersection independently of list order";
        advanced.append(summary, order);
        card.append(advanced);
        const earlier = button(
            order,
            "↑",
            () => l.moveBoolean(n.id, -1),
            booleanIndex === 0 || n.locked,
          ),
          later = button(
            order,
            "↓",
            () => l.moveBoolean(n.id, 1),
            booleanIndex === h.compositionOrder.length - 1 || n.locked,
          );
        earlier.title = "Evaluate earlier";
        earlier.setAttribute("aria-label", "Evaluate " + n.name + " earlier");
        later.title = "Evaluate later";
        later.setAttribute("aria-label", "Evaluate " + n.name + " later");
      }
    }
  }
}

function iconAction(button: HTMLButtonElement, label: string, paths: string): void {
  button.title = label;
  button.setAttribute("aria-label", label);
  button.classList.add("layer-icon-action");
  button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
