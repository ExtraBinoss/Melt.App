import type { ToolDefinition } from "../catalog";
/** Reject unsupported work before downloading the renderer or reading media bytes. */
export function acceptToolFile(file: File, tool: ToolDefinition) {
  const allowed =
    tool.media === "video"
      ? file.type.startsWith("video/")
      : /^image\/(png|jpeg|webp|avif|gif|svg\+xml)$/.test(file.type);
  if (!allowed || !file.size) throw new Error("invalidFile");
  const maximum =
    file.type === "image/svg+xml" ? 256 * 1024 : (tool.media === "video" ? 512 : 50) * 1024 * 1024;
  if (file.size > maximum) throw new Error("fileTooLarge");
}
