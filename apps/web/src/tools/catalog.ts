import type { EffectType, EffectSettings } from "@musart/core";
export const TOOL_STYLES = [
  {
    id: "ascii",
    effect: "ascii",
    basic: ["scale", "characters", "brightness", "contrast", "palette", "foreground", "background"],
    initialSettings: { brightness: 0.06, contrast: 1.1, gamma: 1.15 },
  },
  {
    id: "dither",
    effect: "bit-dither",
    basic: ["method", "scale", "contrast", "foreground", "background"],
  },
  { id: "halftone", effect: "halftone", basic: ["amount", "scale", "color"] },
  {
    id: "cyanotype",
    effect: "cyanotype",
    basic: ["exposure", "contrast", "inkColor", "paperColor"],
  },
  { id: "crt", effect: "crt", basic: ["amount", "scale", "mask", "scanlineStrength", "glow"] },
  { id: "posterize", effect: "posterize", basic: ["amount", "levels"] },
] as const satisfies readonly {
  id: string;
  effect: EffectType;
  basic: readonly string[];
  initialSettings?: Readonly<EffectSettings>;
}[];
export type ToolStyle = (typeof TOOL_STYLES)[number]["id"];
export type ToolMedia = "image" | "video";
export interface ToolDefinition {
  slug: string;
  style: ToolStyle;
  effect: EffectType;
  media: ToolMedia;
  basic: readonly string[];
  initialSettings?: Readonly<EffectSettings>;
}
export const TOOLS: readonly ToolDefinition[] = TOOL_STYLES.flatMap((style) =>
  (["image", "video"] as const).map((media) => ({
    slug: `${style.id}-${media}-converter`,
    style: style.id,
    effect: style.effect,
    media,
    basic: style.basic,
    ...("initialSettings" in style ? { initialSettings: style.initialSettings } : {}),
  })),
);
/** One public entry per effect; media-specific definitions remain internal to the engine. */
export const TOOL_PAGES: readonly ToolDefinition[] = TOOLS.filter(
  (tool) => tool.media === "image",
).map((tool) => ({ ...tool, slug: `${tool.style}-converter` }));
export const findTool = (slug: string) =>
  TOOL_PAGES.find((tool) => tool.slug === slug) ?? TOOLS.find((tool) => tool.slug === slug);
export const toolPath = (tool: ToolDefinition) => `/tools/${tool.style}-converter`;
export const sourceTool = (tool: ToolDefinition, file: Pick<File, "type">) =>
  TOOLS.find(
    (candidate) =>
      candidate.style === tool.style &&
      candidate.media === (file.type.startsWith("video/") ? "video" : "image"),
  )!;
export const publicHref = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;
