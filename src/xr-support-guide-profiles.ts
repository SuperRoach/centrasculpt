/** Guide calibration only: never used to resolve input mappings or controller ownership. */
export type SupportGuideHand = "left" | "right";
export type SupportGuidePose = Readonly<{
  offset: readonly [number, number, number];
  rotationAxis: readonly [number, number, number];
  rotationRadians: number;
}>;
export type SupportGuideProfile = Readonly<{
  id: "quest-3" | "generic" | "steam-frame";
  anchor: "grip";
  orientation: "grip-local";
  hands: Readonly<Record<SupportGuideHand, SupportGuidePose>>;
  scale: number;
  faceClearance: number;
  reappearanceMargin: number;
}>;
export type SupportGuideSelection = "auto" | SupportGuideProfile["id"];

export const QUEST_3_SUPPORT_GUIDE_LAYOUT = Object.freeze({
  width: 512,
  height: 512,
  metres: Object.freeze([0.11, 0.11] as const),
  centre: Object.freeze([256, 256] as const),
  arrow: Object.freeze({ tipRadius: 224, innerRadius: 100, separatorWidth: 32 }),
  directions: Object.freeze({
    left: Object.freeze({ x: 92, y: 256, dx: -1, dy: 0 }),
    right: Object.freeze({ x: 420, y: 256, dx: 1, dy: 0 }),
    up: Object.freeze({ x: 256, y: 92, dx: 0, dy: -1 }),
    down: Object.freeze({ x: 256, y: 420, dx: 0, dy: 1 }),
  }),
});

// Static texture is shared across profiles; device profiles change only pose/physical scale.
export const SUPPORT_GUIDE_LAYOUT = QUEST_3_SUPPORT_GUIDE_LAYOUT;

/** Accepted Quest 3 / Touch Plus baseline at 5dfd219 (2026-11-04).
 * Both hands deliberately use +X, not mirrored X. Do not normalize/round this rotation.
 * Face measurements: tests/fixtures/quest-touch-plus-face.json.
 * Layout above and shared VR_UI_SCALES (1.25 / 1.35) remain unchanged.
 */
const quest3Pose: SupportGuidePose = Object.freeze({
  offset: Object.freeze([0.005, -0.0043, -0.0207] as const),
  rotationAxis: Object.freeze([1, 0, 0] as const),
  rotationRadians: (-(90 + 37.2) * Math.PI) / 180,
});
export const QUEST_3_SUPPORT_GUIDE_PROFILE: SupportGuideProfile = Object.freeze({
  id: "quest-3",
  anchor: "grip",
  orientation: "grip-local",
  hands: Object.freeze({ left: quest3Pose, right: quest3Pose }),
  scale: 1,
  faceClearance: 0.18,
  reappearanceMargin: 0.04,
});
/** Compatibility fallback preserves pre-profile behavior, NOT verified fit on other hardware. */
export const GENERIC_SUPPORT_GUIDE_PROFILE: SupportGuideProfile = Object.freeze({
  ...QUEST_3_SUPPORT_GUIDE_PROFILE,
  id: "generic",
});
/** Fill with an independently measured, frozen SupportGuideProfile when hardware is available.
 * Null deliberately falls back to generic; there is no Steam Frame auto-detection claim.
 */
export const STEAM_FRAME_SUPPORT_GUIDE_PROFILE: SupportGuideProfile | null = null;
export const SUPPORT_GUIDE_PROFILES = Object.freeze({
  "quest-3": QUEST_3_SUPPORT_GUIDE_PROFILE,
  generic: GENERIC_SUPPORT_GUIDE_PROFILE,
  "steam-frame": STEAM_FRAME_SUPPORT_GUIDE_PROFILE,
});
/** Touch Plus is a controller identity, not proof of a particular headset model.
 * xr-standard gamepad mapping/axes and user agent cannot establish physical face geometry.
 * Older Touch profile IDs intentionally use generic. No UA or button-count guesses.
 */
export function resolveSupportGuideProfile(
  source: Pick<XRInputSource, "profiles"> | null | undefined,
  selection: SupportGuideSelection = "auto",
): SupportGuideProfile {
  if (selection !== "auto")
    return SUPPORT_GUIDE_PROFILES[selection] ?? GENERIC_SUPPORT_GUIDE_PROFILE;
  if (source) {
    for (let i = 0; i < source.profiles.length; i++) {
      if (source.profiles[i] === "meta-quest-touch-plus") return QUEST_3_SUPPORT_GUIDE_PROFILE;
    }
  }
  return GENERIC_SUPPORT_GUIDE_PROFILE;
}
