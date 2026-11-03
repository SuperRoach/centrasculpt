import type { Matrix4 } from "three";
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { XRControllerState } from "./xr-input";
import {
  GENERIC_SUPPORT_GUIDE_PROFILE,
  resolveSupportGuideProfile,
  SUPPORT_GUIDE_LAYOUT,
  type SupportGuideHand,
  type SupportGuideProfile,
  type SupportGuideSelection,
} from "./xr-support-guide-profiles";
import type { XRShortcutBinding } from "./xr-support-shortcuts";
import { SUPPORT_STICK_BINDINGS } from "./xr-support-shortcuts";
import { VR_UI_SCALES } from "./xr-ui-style";

export { SUPPORT_GUIDE_LAYOUT } from "./xr-support-guide-profiles";
export const SUPPORT_GUIDE_STYLE = Object.freeze({
  arrow: "rgba(230, 232, 231, 0.38)",
  glyph: "rgba(28, 32, 34, 0.85)",
});
const GUIDE_RADIUS = Math.hypot(...SUPPORT_GUIDE_LAYOUT.metres) / 2;
/** Vector glyphs avoid font dependencies and keep the overlay entirely wordless. */
function drawShortcutGlyph(ctx: CanvasRenderingContext2D, binding: XRShortcutBinding): void {
  const id = binding.kind === "command" ? binding.action : binding.menu;
  ctx.strokeStyle = SUPPORT_GUIDE_STYLE.glyph;
  ctx.fillStyle = SUPPORT_GUIDE_STYLE.glyph;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (id === "undo" || id === "redo") {
    ctx.save();
    if (id === "redo") ctx.scale(-1, 1);
    ctx.beginPath();
    ctx.moveTo(24, 19);
    ctx.bezierCurveTo(34, -15, -4, -32, -25, -7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-28, -25);
    ctx.lineTo(-28, -3);
    ctx.lineTo(-6, -3);
    ctx.stroke();
    ctx.restore();
  } else if (id === "tool-wheel") {
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 13, Math.sin(angle) * 13);
      ctx.lineTo(Math.cos(angle) * 25, Math.sin(angle) * 25);
      ctx.stroke();
    }
  } else if (id === "layers") {
    for (const y of [0, 14]) {
      ctx.beginPath();
      ctx.moveTo(-28, y);
      ctx.lineTo(0, y + 15);
      ctx.lineTo(28, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(28, -13);
    ctx.lineTo(0, 2);
    ctx.lineTo(-28, -13);
    ctx.closePath();
    ctx.stroke();
  }
}
/** One static, noninteractive texture in tracking space. No input or workspace ownership.
 * Centred above the controller face in grip-local metres; orientation follows the wrist.
 * Transparent centre leaves the physical thumbstick/model visible.
 */
export class XRSupportGuide {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  // Mutable tuning copies; the accepted baseline in the profile remains immutable.
  readonly offset = new Vector3();
  readonly orientationOffset = new Quaternion();
  private readonly rotationAxis = new Vector3();
  private selection: SupportGuideSelection = "auto";
  private profile: SupportGuideProfile = GENERIC_SUPPORT_GUIDE_PROFILE;
  private hand: SupportGuideHand = "left";
  get activeProfile(): SupportGuideProfile {
    return this.profile;
  }
  /** Code-level testing/configuration override; auto resumes source-based resolution.
   * An uncalibrated steam-frame slot uses generic. No UI or project metadata changes.
   */
  setProfileOverride(selection: SupportGuideSelection): void {
    if (selection === this.selection) return;
    this.selection = selection;
    this.applyProfile(resolveSupportGuideProfile(null, selection), this.hand);
    this.hide();
  }
  private applyProfile(profile: SupportGuideProfile, hand: SupportGuideHand): void {
    this.profile = profile;
    this.hand = hand;
    const pose = profile.hands[hand];
    this.offset.fromArray(pose.offset);
    this.orientationOffset.setFromAxisAngle(
      this.rotationAxis.fromArray(pose.rotationAxis),
      pose.rotationRadians,
    );
  }
  readonly texture: CanvasTexture;
  private readonly target = new Vector3();
  private readonly eye = new Vector3();
  private disposed = false;
  constructor(bindings = SUPPORT_STICK_BINDINGS) {
    this.applyProfile(this.profile, this.hand);
    const canvas = document.createElement("canvas");
    canvas.width = SUPPORT_GUIDE_LAYOUT.width;
    canvas.height = SUPPORT_GUIDE_LAYOUT.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Support guide requires a canvas context.");
    ctx.clearRect(0, 0, 512, 512);
    const { tipRadius, innerRadius, separatorWidth } = SUPPORT_GUIDE_LAYOUT.arrow;
    ctx.fillStyle = SUPPORT_GUIDE_STYLE.arrow;
    // One fill prevents alpha seams. The circular hole follows the controller's rounded face.
    ctx.beginPath();
    ctx.moveTo(256, 256 - tipRadius);
    ctx.lineTo(256 + tipRadius, 256);
    ctx.lineTo(256, 256 + tipRadius);
    ctx.lineTo(256 - tipRadius, 256);
    ctx.closePath();
    ctx.moveTo(256 + innerRadius, 256);
    ctx.arc(256, 256, innerRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill("evenodd");
    // Transparent diagonal cuts separate the four tabs without adding coloured borders.
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = separatorWidth;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(512, 512);
    ctx.moveTo(512, 0);
    ctx.lineTo(0, 512);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    for (const [direction, point] of Object.entries(SUPPORT_GUIDE_LAYOUT.directions)) {
      ctx.save();
      ctx.translate(point.x, point.y);
      drawShortcutGlyph(ctx, bindings[direction as keyof typeof bindings]);
      ctx.restore();
    }
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.mesh = new Mesh(
      new PlaneGeometry(...SUPPORT_GUIDE_LAYOUT.metres),
      new MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        toneMapped: false,
        depthTest: true,
        depthWrite: false,
      }),
    );
    this.mesh.name = "Support controller shortcut guide · presentation only";
    this.mesh.raycast = () => {};
    this.mesh.visible = false;
  }
  hide(): void {
    this.mesh.visible = false;
  }
  /** Pose and viewer are relative to the same tracking root as mesh.parent. */
  update(
    state: XRControllerState | undefined,
    grip: Matrix4 | undefined,
    viewer: { x: number; y: number; z: number } | null,
    _time: number,
    active: boolean,
    scale: number = VR_UI_SCALES.normal,
  ): void {
    if (
      this.disposed ||
      !active ||
      !viewer ||
      !grip ||
      !state?.connected ||
      state.role !== "support" ||
      !state.tracked ||
      !state.gripTracked ||
      !state.stick.available
    ) {
      this.hide();
      return;
    }
    const profile = resolveSupportGuideProfile(state.source, this.selection);
    const hand = state.handedness === "right" ? "right" : "left";
    if (profile !== this.profile || hand !== this.hand) this.applyProfile(profile, hand);
    this.target.copy(this.offset);
    this.target.applyMatrix4(grip);
    this.eye.set(viewer.x, viewer.y, viewer.z);
    // Hide the whole guide before its nearest edge reaches the face. Hysteresis avoids flicker.
    const guideScale = scale * this.profile.scale;
    const clearance = this.profile.faceClearance + GUIDE_RADIUS * guideScale;
    if (
      this.target.distanceToSquared(this.eye) <
      (clearance + (this.mesh.visible ? 0 : this.profile.reappearanceMargin)) ** 2
    ) {
      this.hide();
      return;
    }
    this.mesh.position.copy(this.target);
    this.mesh.quaternion.setFromRotationMatrix(grip).multiply(this.orientationOffset);
    this.mesh.scale.setScalar(guideScale);
    this.mesh.visible = true;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hide();
    this.mesh.removeFromParent();
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
