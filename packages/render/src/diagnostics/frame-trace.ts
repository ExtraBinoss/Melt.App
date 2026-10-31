/** Optional trace events, with no retained history, pixel reads or console traffic. */
export function traceRenderFrame(
  enabled: boolean | undefined,
  phase: "video" | "gpu-ready" | "display",
  detail: Record<string, unknown>,
): void {
  if (!enabled || typeof performance.mark !== "function") return;
  const name = `Melt frame: ${phase}`;
  performance.mark(name, { detail });
  performance.clearMarks(name);
}
