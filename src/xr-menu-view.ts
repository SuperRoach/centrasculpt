import type { Matrix4 } from "three";
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { VR_WHEEL_TOOLS } from "./editor-tool-state";
import type { XRControllerState } from "./xr-input";
import type { MenuButton, MenuContent } from "./xr-menu-model";
import { MENU_SIZE, WHEEL, type XRMenuModel } from "./xr-menu-model";
import type { XRMenuRequest } from "./xr-support-shortcuts";
import {
  drawVRText,
  paintVRPanel,
  roundedVRRect,
  VR_UI,
  VR_UI_SCALES,
  vrControlStyle,
} from "./xr-ui-style";
export const MENU_TEXTURE_SIZE = 2048;
/** The polling bridge supplies poses/actions; the menu owns ray hits, trigger capture and drawing. */
export interface XRMenuInteraction {
  readonly active: boolean;
  readonly layerSelectionActive?: boolean;
  update(
    request: XRMenuRequest | null,
    tool: XRControllerState | undefined,
    pose: Matrix4 | undefined,
    time: number,
    active: boolean,
  ): number | null;
  close(): void;
}
export class XRMenuView implements XRMenuInteraction {
  readonly cursor = new Mesh(
    new SphereGeometry(0.004, 12, 8),
    new MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  readonly dragRing = new Mesh(
    new RingGeometry(0.005, 0.0065, 24),
    new MeshBasicMaterial({
      color: "#ffffff",
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly canvas: HTMLCanvasElement;
  paintCount = 0;
  private readonly texture: CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly raycaster = new Raycaster();
  private readonly direction = new Vector3();
  private readonly thumbnailImages = new Map<string, HTMLImageElement>();
  private readonly eye = new Vector3();
  private readonly head = new Quaternion();
  private readonly forward = new Vector3();
  private slider: string | null = null;
  private dragPageHover: string | null = null;
  private dragPageSince = 0;
  private scrollScope = "";
  scrollOffset = 0;
  private scrollTime: number | null = null;
  private ready = false;
  private owner = 0;
  private hasPose = false;
  private lastContent = "";
  private lastRefresh = -Infinity;
  private content: MenuContent | null = null;
  get layerSelectionActive(): boolean {
    return this.model.layerSelectionActive;
  }
  constructor(readonly model: XRMenuModel) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = MENU_TEXTURE_SIZE;
    this.ctx = this.canvas.getContext("2d")!;
    const rasterScale = MENU_TEXTURE_SIZE / MENU_SIZE;
    this.ctx.setTransform(rasterScale, 0, 0, rasterScale, 0, 0);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.anisotropy = 4;
    this.mesh = new Mesh(
      new PlaneGeometry(0.72, 0.72),
      new MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        toneMapped: false,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.mesh.name = "VR tools / layers / contextual options";
    this.mesh.renderOrder = 1000;
    this.mesh.visible = false;
    // Start the foreground depth layer after the menu, once per rendered XR eye.
    // Controllers retain depth testing so their buttons/body correctly occlude each other.
    this.mesh.onAfterRender = (renderer) => {
      renderer.state.buffers.depth.setMask(true);
      renderer.clearDepth();
    };
    this.cursor.name = "Menu ray hit cursor";
    this.cursor.renderOrder = 1002;
    this.cursor.visible = false;
    this.cursor.raycast = () => {};
    this.mesh.add(this.cursor);
    this.dragRing.position.z = 0.005;
    this.dragRing.renderOrder = 1003;
    this.dragRing.raycast = () => {};
    this.dragRing.visible = false;
    this.cursor.add(this.dragRing);
  }
  private menuContent(): MenuContent {
    const raw = this.model.content();
    const scope = raw.scroll
      ? "library"
      : this.model.page === "layers" && this.model.palette.view === "list"
        ? "layers"
        : "";
    if (scope !== this.scrollScope) {
      this.scrollOffset = 0;
      this.scrollTime = null;
      this.scrollScope = scope;
    }
    if (raw.scroll) {
      this.scrollOffset = Math.max(0, Math.min(raw.scroll.max, this.scrollOffset));
      return {
        ...raw,
        scroll: { ...raw.scroll, offset: this.scrollOffset },
        buttons: raw.buttons.map((b) =>
          b.clip && b.rect ? { ...b, rect: { ...b.rect, y: b.rect.y - this.scrollOffset } } : b,
        ),
      };
    }
    if (this.model.page !== "layers" || this.model.palette.view !== "list") return raw;
    const palette = this.model.palette,
      page = palette.page,
      count = this.model.tools.port.layers().hierarchyRows().length,
      max = Math.max(0, count * 140 - 28 - 652);
    this.scrollOffset = Math.max(0, Math.min(max, this.scrollOffset));
    let base: MenuContent | undefined;
    const rows: MenuButton[] = [];
    for (let i = 0; i < Math.max(1, Math.ceil(count / 4)); i++) {
      palette.page = i;
      const content = this.model.content();
      base ??= content;
      for (const b of content.buttons)
        if (b.rect && b.rect.y >= 244 && b.rect.y < 900)
          rows.push({
            ...b,
            rect: { ...b.rect, y: b.rect.y + i * 560 - this.scrollOffset },
            clip: { x: 32, y: 244, width: 1088, height: 652 },
          });
    }
    palette.page = page;
    return {
      ...base!,
      subtitle: "Layers · indented rows are children",
      buttons: [
        ...base!.buttons.filter(
          (b) =>
            b.rect &&
            (b.rect.y < 244 || b.rect.y >= 900) &&
            b.id !== "hier:prev" &&
            b.id !== "hier:next",
        ),
        ...rows,
      ],
      scroll: { offset: this.scrollOffset, max },
      footer:
        palette.feedback ||
        (max
          ? "Tool stick ↑ / ↓ scrolls · hold trigger on a grip to drag"
          : "Hold trigger on a grip to drag"),
    };
  }
  get active(): boolean {
    return !!this.model.request;
  }
  place(
    position: { x: number; y: number; z: number },
    orientation: { x: number; y: number; z: number; w: number },
  ): void {
    this.eye.set(position.x, position.y, position.z);
    this.head.set(orientation.x, orientation.y, orientation.z, orientation.w);
    this.hasPose = true;
  }
  private anchor(): void {
    this.forward.set(0, 0, -1).applyQuaternion(this.head);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 0.001) this.forward.set(0, 0, -1);
    this.forward.normalize();
    this.mesh.position.copy(this.eye).addScaledVector(this.forward, 1.05);
    this.mesh.position.y -= 0.12;
    this.mesh.lookAt(this.eye);
    this.mesh.updateWorldMatrix(true, false);
  }
  close(): void {
    this.scrollOffset = 0;
    this.scrollTime = null;
    this.cursor.visible = false;
    this.slider = null;
    this.model.setRequest(null);
    this.mesh.visible = false;
    this.ready = false;
    this.owner = 0;
    this.content = null;
    this.lastContent = "";
    this.lastRefresh = -Infinity;
    for (const image of this.thumbnailImages.values()) image.src = "";
    this.thumbnailImages.clear();
  }
  start(): void {
    this.close();
    this.hasPose = false;
  }
  stop(): void {
    this.start();
    this.mesh.removeFromParent();
  }
  update(
    request: XRMenuRequest | null,
    tool: XRControllerState | undefined,
    pose: Matrix4 | undefined,
    time: number,
    active: boolean,
  ): number | null {
    if (!active || !request) {
      this.close();
      return null;
    }
    const factor = VR_UI_SCALES[this.model.tools.port.layers().display.vrUiScale];
    this.mesh.scale.setScalar(factor);
    this.cursor.scale.setScalar(1);
    this.dragRing.visible = false;
    const opened = request !== this.model.request;
    if (opened) {
      this.slider = null;
      this.model.setRequest(request);
      this.ready = false;
      this.owner = 0;
      this.anchor();
      this.lastRefresh = -Infinity;
    }
    if (!this.mesh.visible && this.hasPose) this.anchor();
    this.mesh.visible = this.hasPose;
    if (!this.mesh.visible) return null;
    if (time - this.lastRefresh >= 100 || !this.content) {
      this.content = this.menuContent();
      this.lastRefresh = time;
    }
    const wanted = new Set(
      this.content.buttons.flatMap((button) => (button.thumbnail ? [button.thumbnail] : [])),
    );
    for (const [key, image] of this.thumbnailImages)
      if (!wanted.has(key)) {
        image.src = "";
        this.thumbnailImages.delete(key);
      }
    let distance: number | null = null;
    this.model.hover = null;
    this.cursor.visible = false;
    if (
      tool?.connected &&
      tool.role === "tool" &&
      tool.tracked &&
      tool.gripTracked &&
      pose &&
      pose.elements.every(Number.isFinite) &&
      Math.abs(pose.determinant()) > 1e-10
    ) {
      if (tool.connectionId !== this.owner) {
        this.scrollOffset = 0;
        this.scrollTime = null;
        this.model.palette.dragged = null;
        this.slider = null;
        this.owner = tool.connectionId;
        this.ready = false;
      }
      if (this.content?.scroll !== undefined && tool.stick?.available && !this.model.tools.busy) {
        const dt =
          this.scrollTime === null ? 0 : Math.max(0, Math.min(50, time - this.scrollTime)) / 1000;
        this.scrollTime = time;
        const x = tool.stick.x,
          y = tool.stick.y;
        if (
          Number.isFinite(x) &&
          Number.isFinite(y) &&
          Math.abs(y) > 0.2 &&
          Math.abs(y) > Math.abs(x)
        ) {
          this.scrollOffset += ((Math.sign(y) * (Math.abs(y) - 0.2)) / 0.8) * 500 * dt;
          this.content = this.menuContent();
        }
      } else this.scrollTime = null;
      this.mesh.updateWorldMatrix(true, false);
      this.raycaster.ray.origin.setFromMatrixPosition(pose);
      this.direction.set(0, 0, -1).transformDirection(pose);
      this.raycaster.ray.direction.copy(this.direction);
      this.raycaster.far = 3;
      const hit = this.raycaster.intersectObject(this.mesh, false)[0];
      if (hit?.uv) {
        distance = hit.distance;
        this.model.hover = this.model.hit(
          hit.uv.x * MENU_SIZE,
          (1 - hit.uv.y) * MENU_SIZE,
          this.content,
        );
        const target = this.content.buttons.find((b) => b.id === this.model.hover);
        this.cursor.visible = !!target;
        this.cursor.material.color.set(
          target?.disabled
            ? VR_UI.disabled
            : this.slider === target?.id
              ? VR_UI.text
              : VR_UI.accent,
        );
        this.cursor.position.set((hit.uv.x - 0.5) * 0.72, (hit.uv.y - 0.5) * 0.72, 0.002);
      }
      if (!this.model.palette.dragged && this.model.hover === "hier:root") {
        this.model.hover = null;
        this.cursor.visible = false;
      }
      if (
        this.model.palette.dragged &&
        hit?.uv &&
        !this.model.hover &&
        (1 - hit.uv.y) * MENU_SIZE >= 140 &&
        (1 - hit.uv.y) * MENU_SIZE < 948
      )
        this.model.hover = "hier:root";
      if (this.model.palette.dragged && tool.buttons.trigger.pressed) {
        const hover = this.model.hover;
        if (hover === "hier:prev" || hover === "hier:next") {
          if (this.dragPageHover !== hover) {
            this.dragPageHover = hover;
            this.dragPageSince = time;
          } else if (time - this.dragPageSince > 700) {
            this.model.activate(hover, this.content);
            this.content = this.menuContent();
            this.dragPageSince = time;
          }
        } else {
          this.dragPageHover = null;
          const target = this.content.buttons.find((b) => b.id === hover);
          this.content = { ...this.content, footer: this.model.palette.dropPreview(hover).message };
        }
      } else this.dragPageHover = null;
      if (!tool.buttons.trigger.pressed && tool.buttons.trigger.rawValue < 0.45) {
        if (this.model.palette.dragged) {
          this.model.palette.endDrag(this.model.hover);
          this.content = this.menuContent();
        }
        this.ready = true;
        this.slider = null;
      }
      if (!opened && this.ready && tool.buttons.trigger.justPressed) {
        this.ready = false;
        if (this.model.hover) {
          if (
            this.model.hover.startsWith("slider:") &&
            !this.content.buttons.find((b) => b.id === this.model.hover)?.disabled
          )
            this.slider = this.model.hover;
          else if (this.model.hover.startsWith("hier:drag:"))
            this.model.palette.beginDrag(this.model.hover.slice(10));
          else this.model.activate(this.model.hover, this.content);
          this.content = this.menuContent();
          this.lastRefresh = time;
        }
      }
      if (this.slider && tool.buttons.trigger.pressed && hit?.uv) {
        const b = this.content.buttons.find((b) => b.id === this.slider);
        if (b?.rect) {
          this.model.setSlider(
            this.slider,
            (hit.uv.x * MENU_SIZE - b.rect.x - 20) / (b.rect.width - 40),
          );
          this.content = this.menuContent();
        }
      }
    } else {
      this.scrollOffset = 0;
      this.scrollTime = null;
      this.model.palette.dragged = null;
      this.slider = null;
      this.ready = false;
      this.owner = 0;
    }
    if (this.model.palette.dragged && distance !== null) {
      const drop = this.model.palette.dropPreview(this.model.hover);
      this.cursor.visible = true;
      this.cursor.scale.setScalar(1.7);
      this.cursor.material.color.set(drop.colour);
      this.dragRing.material.color.set(drop.valid ? "#ffffff" : "#ef9c8c");
      this.dragRing.visible = true;
    }
    this.paint(this.content);
    return distance;
  }
  private paint(content: MenuContent): void {
    const key = JSON.stringify([
      content,
      this.model.hover,
      this.slider,
      this.model.palette.dragged,
    ]);
    if (key === this.lastContent) return;
    this.lastContent = key;
    this.paintCount++;
    const ctx = this.ctx,
      wheel =
        this.model.page === "tool-wheel" && content.buttons.some((b) => b.sector !== undefined);
    if (wheel) ctx.clearRect(0, 0, MENU_SIZE, MENU_SIZE);
    else paintVRPanel(ctx, MENU_SIZE, MENU_SIZE);
    // Independent small title/footer plaques keep the floating wheel readable in AR.
    if (wheel) {
      for (const r of [
        { x: 24, y: 24, width: 798, height: 106 },
        { x: 24, y: 1050, width: 1104, height: 64 },
      ]) {
        roundedVRRect(ctx, r.x, r.y, r.width, r.height);
        ctx.fillStyle = "rgba(16,26,32,0.88)";
        ctx.fill();
      }
    }
    drawVRText(
      ctx,
      content.title,
      { x: 40, y: 32, width: 776, height: 56 },
      VR_UI.heading,
      VR_UI.text,
      true,
    );
    drawVRText(
      ctx,
      content.subtitle,
      { x: 40, y: 92, width: 776, height: 38 },
      VR_UI.detail,
      VR_UI.muted,
    );
    for (const b of content.buttons) {
      ctx.save();
      if (b.clip) {
        ctx.beginPath();
        ctx.rect(b.clip.x, b.clip.y, b.clip.width, b.clip.height);
        ctx.clip();
      }
      if (b.muted) ctx.globalAlpha *= 0.55;
      this.button(b);
      ctx.restore();
    }
    if (content.scroll && content.scroll.offset < content.scroll.max - 0.5) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = VR_UI.text;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(562, 918);
      ctx.lineTo(576, 930);
      ctx.lineTo(590, 918);
      ctx.stroke();
      ctx.restore();
    }
    if (this.model.palette.dragged) {
      const drop = this.model.palette.dropPreview(this.model.hover),
        target = content.buttons.find((b) => b.id === this.model.hover);
      if (drop.parent !== undefined && (target?.rect || drop.parent === null)) {
        const root = drop.parent === null,
          r = root ? { x: 32, y: 140, width: 1088, height: 804 } : target!.rect!;
        ctx.save();
        if (target?.clip) {
          ctx.beginPath();
          ctx.rect(target.clip.x, target.clip.y, target.clip.width, target.clip.height);
          ctx.clip();
        }
        roundedVRRect(
          ctx,
          root ? r.x - 6 : 32,
          r.y - 6,
          root ? r.width + 12 : 1088,
          r.height + 12,
          18,
        );
        ctx.strokeStyle = drop.valid ? "#b2e5ce" : "#ef9c8c";
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.restore();
      }
    }

    if (this.model.palette.dragged && !content.scroll?.max) {
      drawVRText(
        ctx,
        "Drop in empty space to detach",
        { x: 40, y: 912, width: 1072, height: 38 },
        VR_UI.detail,
        VR_UI.muted,
        false,
        "center",
      );
    }
    for (const label of content.labels)
      drawVRText(
        ctx,
        label.text,
        {
          x: label.x,
          y: label.y,
          width: label.width ?? MENU_SIZE - label.x - 44,
          height: label.height ?? 46,
        },
        label.small ? VR_UI.label : label.value ? VR_UI.value : VR_UI.label,
        label.small ? VR_UI.muted : VR_UI.text,
      );
    const hovered = content.buttons.find((b) => b.id === this.model.hover),
      info = hovered?.layerInfo;
    const hint =
      this.model.hover === "ui-scale"
        ? "Switch the size of VR menus"
        : this.model.hover?.startsWith("hier:drag:")
          ? "Hold Tool trigger, then drag onto a layer or empty space"
          : info
            ? `${info.resolution ? `${info.resolution}³ · ` : ""}${info.operation === "difference" ? "Subtracts from earlier layers" : info.operation === "intersect" ? "Keeps overlapping volume" : info.operation === "union" ? "Adds to the combined volume" : "Layer group"}${info.tube ? " · Procedural Tube" : info.primitive ? ` · Parametric ${info.primitive}` : ""}${info.children ? ` · ${info.children} nested items` : ""}`
            : content.footer;
    if (!wheel)
      drawVRText(
        ctx,
        this.model.palette.dragged ? content.footer : hint,
        { x: wheel ? 744 : 40, y: 1048, width: wheel ? 368 : 1072, height: 72 },
        VR_UI.footer,
        VR_UI.muted,
      );
    this.texture.needsUpdate = true;
  }
  private button(b: MenuButton): void {
    const ctx = this.ctx,
      hover = b.id === this.model.hover && !b.disabled,
      style = vrControlStyle(b.disabled, hover, b.selected, this.slider === b.id);
    if (b.slider) {
      const r = b.rect!,
        u = Math.max(
          0,
          Math.min(1, (b.slider.value - b.slider.min) / (b.slider.max - b.slider.min)),
        );
      roundedVRRect(ctx, r.x, r.y, r.width, r.height, 18);
      ctx.fillStyle = style.fill;
      ctx.fill();
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.lineWidth;
      ctx.stroke();
      ctx.strokeStyle = b.disabled ? VR_UI.disabled : VR_UI.accent;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(r.x + 20, r.y + r.height / 2);
      ctx.lineTo(r.x + r.width - 20, r.y + r.height / 2);
      ctx.stroke();
      ctx.fillStyle = style.text;
      ctx.beginPath();
      ctx.arc(r.x + 20 + u * (r.width - 40), r.y + r.height / 2, 17, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (b.sector !== undefined) {
      const angle = -Math.PI / 2 + (b.sector * Math.PI * 2) / VR_WHEEL_TOOLS.length,
        x = WHEEL.x + Math.cos(angle) * WHEEL.labelRadius,
        y = WHEEL.y + Math.sin(angle) * WHEEL.labelRadius;
      roundedVRRect(ctx, x - 78, y - 59, 156, 118, 20);
      ctx.fillStyle = b.disabled
        ? "rgba(25,34,40,.76)"
        : hover
          ? style.fill
          : b.selected
            ? style.fill
            : "rgba(17,28,35,.86)";
      ctx.fill();
      if (hover || b.selected) {
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = style.lineWidth;
        ctx.stroke();
      }
      this.icon(b.id.slice(5), x, y - 34, style.text);
      const label =
        b.id === "tool:stamp"
          ? "Stamp"
          : b.id === "tool:transform"
            ? "Transform"
            : b.id === "tool:edit-spline"
              ? "Edit Spline"
              : b.id === "tool:move"
                ? "Move"
                : b.label;
      drawVRText(
        ctx,
        label,
        { x: x - 74, y: y - 10, width: 148, height: 70 },
        VR_UI.radial,
        style.text,
        true,
        "center",
      );
      return;
    }
    if (b.id === "hier:root") return;
    const r = b.rect!;
    roundedVRRect(ctx, r.x, r.y, r.width, r.height);
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.lineWidth;
    ctx.stroke();
    if (b.icon) {
      drawVRText(
        ctx,
        b.icon,
        { x: r.x, y: r.y + 4, width: r.width, height: r.height * 0.55 },
        36,
        style.text,
        true,
        "center",
      );
      drawVRText(
        ctx,
        b.label,
        { x: r.x + 4, y: r.y + r.height * 0.56, width: r.width - 8, height: r.height * 0.4 },
        18,
        style.text,
        true,
        "center",
      );
      return;
    }
    if (b.thumbnail) {
      let image = this.thumbnailImages.get(b.thumbnail);
      if (!image) {
        image = new Image();
        this.thumbnailImages.set(b.thumbnail, image);
        image.onload = () => {
          this.lastContent = "";
        };
        image.src = b.thumbnail;
      }
      if (image.complete && image.naturalWidth) {
        const size = Math.min(b.id.startsWith("library:select:") ? 156 : 116, r.height - 18);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(r.x + 12, r.y + (r.height - size) / 2, size, size, 12);
        ctx.clip();
        ctx.drawImage(image, r.x + 12, r.y + (r.height - size) / 2, size, size);
        ctx.restore();
        drawVRText(
          ctx,
          b.label,
          {
            x: r.x + size + 26,
            y: r.y + 12,
            width: r.width - size - 40,
            height: b.detail ? r.height * 0.56 : r.height - 24,
          },
          VR_UI.value,
          style.text,
          true,
        );
        if (b.detail)
          drawVRText(
            ctx,
            b.detail,
            {
              x: r.x + size + 26,
              y: r.y + r.height * 0.62,
              width: r.width - size - 40,
              height: r.height * 0.32,
            },
            22,
            style.text,
            false,
          );
        return;
      }
    }
    if (b.layerInfo) {
      const info = b.layerInfo,
        pad = b.colour ? 36 : 16;
      if (b.colour) {
        roundedVRRect(ctx, r.x + 12, r.y + 12, 12, r.height - 24, 6);
        ctx.fillStyle = b.colour;
        ctx.fill();
      }
      if (info.children)
        drawVRText(
          ctx,
          info.collapsed ? "▸" : "▾",
          { x: r.x + pad, y: r.y + 12, width: 30, height: 34 },
          24,
          style.text,
          true,
        );
      const badges = [
        info.resolution ? `${info.resolution}³` : "Group",
        info.operation === "difference" ? "−" : info.operation === "intersect" ? "∩" : "+",
        ...(info.tube ? ["Tube"] : info.primitive ? [info.primitive] : []),
        ...(info.children && info.collapsed ? [`${info.children} children`] : []),
      ];
      const badgeText = badges.join("  ·  "),
        badgeWidth = Math.min(r.width - pad - 44, badgeText.length * 11);
      drawVRText(
        ctx,
        badgeText,
        { x: r.x + r.width - 16 - badgeWidth, y: r.y + 12, width: badgeWidth, height: 28 },
        20,
        VR_UI.muted,
        false,
        "center",
      );
      drawVRText(
        ctx,
        b.label,
        { x: r.x + pad, y: r.y + 43, width: r.width - pad - 16, height: r.height - 48 },
        VR_UI.radial,
        style.text,
        true,
        "center",
      );
      return;
    }
    if (b.id.startsWith("hier:drag:")) {
      const x = r.x + r.width / 2,
        y = r.y + r.height / 2;
      ctx.save();
      ctx.strokeStyle = style.text;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const offset of [-14, 0, 14]) {
        ctx.moveTo(x - 20, y + offset);
        ctx.lineTo(x + 20, y + offset);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (b.id.startsWith("visible:") || b.id.startsWith("locked:")) {
      const x = r.x + r.width / 2,
        y = r.y + r.height / 2;
      ctx.save();
      ctx.strokeStyle = style.text;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      if (b.id.startsWith("visible:")) {
        ctx.moveTo(x - 27, y);
        ctx.quadraticCurveTo(x, y - 31, x + 27, y);
        ctx.quadraticCurveTo(x, y + 31, x - 27, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        if (b.label === "Hidden") {
          ctx.moveTo(x - 26, y - 24);
          ctx.lineTo(x + 26, y + 24);
        }
      } else {
        roundedVRRect(ctx, x - 21, y - 4, 42, 34, 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 13, y - 4);
        ctx.lineTo(x - 13, y - 18);
        if (b.detail === "Locked" || b.label === "Unlock" || b.label === "Locked") {
          ctx.quadraticCurveTo(x - 13, y - 34, x, y - 34);
          ctx.quadraticCurveTo(x + 13, y - 34, x + 13, y - 18);
          ctx.lineTo(x + 13, y - 4);
        } else {
          ctx.quadraticCurveTo(x - 13, y - 34, x + 4, y - 34);
          ctx.quadraticCurveTo(x + 23, y - 34, x + 23, y - 18);
        }
        ctx.moveTo(x, y + 9);
        ctx.lineTo(x, y + 18);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (b.id === "hier:transform" && r.height >= 200) {
      const x = r.x + r.width / 2;
      this.icon("transform", x, r.y + 58, style.text);
      drawVRText(
        ctx,
        b.label,
        { x: r.x + 16, y: r.y + 112, width: r.width - 32, height: 54 },
        VR_UI.value,
        style.text,
        true,
        "center",
      );
      drawVRText(
        ctx,
        b.detail ?? "",
        { x: r.x + 16, y: r.y + 180, width: r.width - 32, height: 40 },
        VR_UI.detail,
        VR_UI.muted,
        false,
        "center",
      );
      return;
    }
    if (b.id.startsWith("paint-swatch:")) {
      roundedVRRect(ctx, r.x + 6, r.y + 6, r.width - 12, r.height - 12, 16);
      ctx.fillStyle = b.colour!;
      ctx.fill();
      if (b.selected) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 5;
        ctx.stroke();
      }
      return;
    }
    if (b.id === "tool:mask" || b.id === "tool:paint") {
      this.icon(b.id.slice(5), r.x + 48, r.y + r.height / 2, style.text);
      drawVRText(
        ctx,
        b.label,
        {
          x: r.x + 88,
          y: r.y + (r.height - VR_UI.value * 1.15) / 2,
          width: r.width - 108,
          height: VR_UI.value * 1.15,
        },
        VR_UI.value,
        style.text,
        true,
        "center",
      );
      return;
    }
    if (b.swatch && b.colour) {
      const cy = r.y + r.height / 2,
        labelHeight = VR_UI.label * 1.05,
        checkHeight = VR_UI.control * 1.05;
      roundedVRRect(ctx, r.x + 20, cy - 44, 88, 88, 18);
      ctx.fillStyle = b.colour;
      ctx.fill();
      ctx.strokeStyle = VR_UI.muted;
      ctx.lineWidth = 2;
      ctx.stroke();
      drawVRText(
        ctx,
        b.label,
        { x: r.x + 124, y: cy - labelHeight / 2, width: r.width - 144, height: labelHeight },
        VR_UI.label,
        style.text,
        true,
        "center",
      );
      if (b.selected) {
        drawVRText(
          ctx,
          "✓",
          { x: r.x + 22, y: cy - checkHeight / 2, width: 84, height: checkHeight },
          VR_UI.control,
          parseInt(b.colour.slice(1, 3), 16) > 130 ? "#101a20" : "#ffffff",
          true,
          "center",
        );
      }
      return;
    }
    if (b.colour) {
      roundedVRRect(ctx, r.x + 12, r.y + 12, 12, r.height - 24, 6);
      ctx.fillStyle = b.colour;
      ctx.fill();
    }
    // Navigation chevrons get their own aligned column instead of font-glyph spacing.
    if (b.label.startsWith("‹ ")) {
      const cy = r.y + r.height / 2;
      ctx.save();
      ctx.strokeStyle = style.text;
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(r.x + 36, cy - 9);
      ctx.lineTo(r.x + 27, cy);
      ctx.lineTo(r.x + 36, cy + 9);
      ctx.stroke();
      ctx.restore();
      drawVRText(
        ctx,
        b.label.slice(2),
        {
          x: r.x + 58,
          y: cy - (VR_UI.label * 1.05) / 2,
          width: r.width - 78,
          height: VR_UI.label * 1.05,
        },
        VR_UI.label,
        style.text,
        true,
      );
      return;
    }
    const layerActionIcon =
      b.id === "hier:duplicate" ? "duplicate" : b.id === "hier:delete-layer" ? "trash" : null;
    if (layerActionIcon) this.icon(layerActionIcon, r.x + 52, r.y + r.height / 2, style.text);
    const pad = layerActionIcon ? 88 : b.colour ? 36 : 16,
      size = ["+", "-", "‹", "›"].includes(b.label)
        ? VR_UI.control
        : r.width < 210
          ? VR_UI.label
          : r.width < 300
            ? VR_UI.label
            : VR_UI.value;
    const labelHeight = b.detail ? r.height * 0.52 : r.height - 16;
    drawVRText(
      ctx,
      b.label,
      {
        x: r.x + pad,
        y: r.y + (b.detail ? 8 : Math.max(8, (r.height - size * 1.15) / 2)),
        width: r.width - pad - 16,
        height: labelHeight,
      },
      size,
      style.text,
      true,
      "center",
    );
    if (b.detail)
      drawVRText(
        ctx,
        b.detail,
        {
          x: r.x + pad,
          y: r.y + r.height * 0.55,
          width: r.width - pad - 16,
          height: r.height * 0.43,
        },
        VR_UI.detail,
        b.disabled ? VR_UI.disabled : VR_UI.muted,
        false,
        "center",
      );
  }
  private icon(id: string, x: number, y: number, colour: string): void {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.scale(0.85, 0.85);
    c.strokeStyle = colour;
    c.fillStyle = colour;
    c.lineWidth = 4;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    if (id === "duplicate") {
      c.rect(-7, -7, 29, 29);
      c.moveTo(-22, 7);
      c.lineTo(-22, -22);
      c.lineTo(7, -22);
      c.lineTo(7, -7);
      c.moveTo(-22, 7);
      c.lineTo(-7, 7);
    } else if (id === "trash") {
      c.moveTo(-24, -15);
      c.lineTo(24, -15);
      c.moveTo(-8, -15);
      c.lineTo(-8, -23);
      c.lineTo(8, -23);
      c.lineTo(8, -15);
      c.moveTo(-18, -8);
      c.lineTo(-15, 23);
      c.lineTo(15, 23);
      c.lineTo(18, -8);
      for (const x of [-6, 6]) {
        c.moveTo(x, -6);
        c.lineTo(x, 14);
      }
    } else if (id === "clay" || id === "inflate") {
      c.arc(0, 0, 14, 0, Math.PI * 2);
      c.moveTo(-7, 0);
      c.lineTo(7, 0);
      if (id === "clay") {
        c.moveTo(0, -7);
        c.lineTo(0, 7);
      } else {
        c.moveTo(-20, 0);
        c.lineTo(-26, 0);
        c.moveTo(20, 0);
        c.lineTo(26, 0);
      }
    } else if (id === "paint") {
      c.moveTo(-6, 6);
      c.lineTo(12, -22);
      c.quadraticCurveTo(18, -28, 23, -22);
      c.quadraticCurveTo(27, -18, 21, -12);
      c.lineTo(0, 12);
      c.closePath();
      c.moveTo(-7, 8);
      c.bezierCurveTo(-23, 7, -12, 23, -27, 25);
      c.bezierCurveTo(-10, 31, 5, 23, 0, 13);
      c.closePath();
    } else if (id === "mask") {
      // A half-shaded shield communicates painted protection at headset scale.
      c.moveTo(0, -23);
      c.lineTo(-21, -17);
      c.lineTo(-21, 1);
      c.bezierCurveTo(-21, 15, -9, 24, 0, 29);
      c.closePath();
      c.save();
      c.globalAlpha = 0.32;
      c.fill();
      c.restore();
      c.beginPath();
      c.moveTo(0, -23);
      c.lineTo(21, -17);
      c.lineTo(21, 1);
      c.bezierCurveTo(21, 15, 9, 24, 0, 29);
      c.bezierCurveTo(-9, 24, -21, 15, -21, 1);
      c.lineTo(-21, -17);
      c.closePath();
      c.moveTo(0, -20);
      c.lineTo(0, 24);
    } else if (id === "cut") {
      c.moveTo(-24, -16);
      c.lineTo(-6, -16);
      c.lineTo(-6, 16);
      c.lineTo(-24, 16);
      c.closePath();
      c.moveTo(6, -16);
      c.lineTo(24, -16);
      c.lineTo(24, 16);
      c.lineTo(6, 16);
      c.closePath();
      c.moveTo(0, -27);
      c.lineTo(0, 27);
    } else if (id === "smooth") {
      c.moveTo(-24, 5);
      c.bezierCurveTo(-12, -22, 5, 22, 24, -5);
    } else if (id === "tube" || id === "edit-spline") {
      c.moveTo(-24, 12);
      c.bezierCurveTo(-15, -24, 8, 24, 24, -12);
      if (id === "tube") {
        c.moveTo(-24, 3);
        c.bezierCurveTo(-15, -33, 8, 15, 24, -21);
      } else {
        for (const p of [
          [-24, 12],
          [0, 0],
          [24, -12],
        ]) {
          c.moveTo(p[0] + 5, p[1]);
          c.arc(p[0], p[1], 5, 0, Math.PI * 2);
        }
      }
    } else if (id === "stamp") {
      c.rect(-15, -12, 30, 26);
      c.moveTo(-22, 21);
      c.lineTo(22, 21);
      c.moveTo(0, -12);
      c.lineTo(0, -22);
    } else if (id === "move") {
      // A local patch pulled upward: deformation, distinct from whole-layer arrows.
      c.moveTo(-26, 17);
      c.bezierCurveTo(-12, 17, -12, -3, 0, -3);
      c.bezierCurveTo(12, -3, 12, 17, 26, 17);
      c.moveTo(-25, 23);
      c.bezierCurveTo(-8, 23, -7, 7, 0, 7);
      c.bezierCurveTo(7, 7, 8, 23, 25, 23);
      c.moveTo(0, -8);
      c.lineTo(0, -25);
      c.moveTo(-7, -18);
      c.lineTo(0, -25);
      c.lineTo(7, -18);
    } else if (id === "transform") {
      c.rect(-6, -6, 12, 12);
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        const dx = Math.cos(a),
          dy = Math.sin(a);
        c.moveTo(dx * 9, dy * 9);
        c.lineTo(dx * 24, dy * 24);
        c.moveTo(dx * 17 - dy * 6, dy * 17 + dx * 6);
        c.lineTo(dx * 24, dy * 24);
        c.lineTo(dx * 17 + dy * 6, dy * 17 - dx * 6);
      }
    } else if (id === "pinch" || id === "crease") {
      c.moveTo(-25, -14);
      c.lineTo(-8, 0);
      c.lineTo(-25, 14);
      c.moveTo(25, -14);
      c.lineTo(8, 0);
      c.lineTo(25, 14);
      if (id === "crease") {
        c.moveTo(0, -20);
        c.lineTo(0, 17);
        c.lineTo(-6, 10);
        c.moveTo(0, 17);
        c.lineTo(6, 10);
      }
    } else {
      c.moveTo(-24, 14);
      c.lineTo(24, 14);
      c.moveTo(-16, -12);
      c.lineTo(16, id === "scrape" ? -2 : -12);
      c.moveTo(0, -8);
      c.lineTo(0, 7);
    }
    c.stroke();
    c.restore();
  }
  dispose(): void {
    this.stop();
    this.cursor.geometry.dispose();
    this.cursor.material.dispose();
    this.dragRing.geometry.dispose();
    this.dragRing.material.dispose();
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
