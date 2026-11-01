import type { EffectType } from "@musart/core";
export const TOOL_STYLES = [
  { id: "ascii", effect: "ascii" },
  { id: "dither", effect: "dither" },
  { id: "halftone", effect: "halftone" },
  { id: "cyanotype", effect: "cyanotype" },
  { id: "crt", effect: "crt" },
  { id: "posterize", effect: "posterize" },
] as const satisfies readonly { id: string; effect: EffectType }[];
export type ToolStyle = (typeof TOOL_STYLES)[number]["id"];
export type ToolMedia = "image" | "video";
export interface ToolDefinition {
  slug: string;
  style: ToolStyle;
  effect: EffectType;
  media: ToolMedia;
}
export const TOOLS: readonly ToolDefinition[] = TOOL_STYLES.flatMap((style) =>
  (["image", "video"] as const).map((media) => ({
    slug: `${style.id}-${media}-converter`,
    style: style.id,
    effect: style.effect,
    media,
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
