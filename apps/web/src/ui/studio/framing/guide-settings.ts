import { SOCIAL_PRESETS, type CaptureGuides } from "@musart/core";
import type { FrameChoice } from "./FramePresetPicker";

export type StudioGuideAppearance = Pick<CaptureGuides, "color" | "center" | "safeArea" | "margin">;

export const DEFAULT_STUDIO_GUIDES: StudioGuideAppearance = {
  color: "cyan",
  center: false,
  safeArea: "format",
  margin: 10,
};

export const STUDIO_GUIDE_COLORS = {
  cyan: "#67e8f9",
  magenta: "#f0abfc",
  lime: "#bef264",
  white: "#ffffff",
} as const;

/** Fractions of the displayed crop: these guides never change delivered dimensions. */
export function studioSafeInsets(choice: FrameChoice | undefined, guides: StudioGuideAppearance) {
  if (guides.safeArea === "none") return null;
  const preset = !choice?.full && SOCIAL_PRESETS.find((item) => item.id === choice?.preset);
  if (guides.safeArea === "format" && preset && preset.safeArea)
    return {
      top: preset.safeArea.top / preset.height,
      right: preset.safeArea.right / preset.width,
      bottom: preset.safeArea.bottom / preset.height,
      left: preset.safeArea.left / preset.width,
    };
  // Formats without catalog safe-area metadata use an explicitly adjustable
  // composition margin, not an assertion about changing platform interface overlays.
  const margin = (guides.safeArea === "custom" ? guides.margin : 10) / 100;
  return { top: margin, right: margin, bottom: margin, left: margin };
}
