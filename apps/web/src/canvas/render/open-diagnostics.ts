import type { PreviewRequest } from "./frame-request";

/** One bounded watchdog per opening; slow work is reported honestly, never marked successful. */
export class CanvasOpenDiagnostics {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending?: { projectId?: string; pageId: string; revision: number; phase: string };
  private visibleScope = "";
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly read: () => unknown,
  ) {}
  start(request: PreviewRequest) {
    const scope = JSON.stringify([request.origin?.projectId, request.page.id]);
    this.dispose();
    this.pending = {
      projectId: request.origin?.projectId,
      pageId: request.page.id,
      revision: request.revision,
      phase: "preparation",
    };
    if (import.meta.env.DEV && scope !== this.visibleScope)
      console.info("[Melt canvas] Preparing", this.pending);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      console.warn("[Melt canvas stalled] No visible frame after 8 seconds", this.details());
    }, 8000);
  }
  prepared(revision: number) {
    if (this.pending?.revision === revision) this.pending.phase = "awaiting-presentation";
  }
  presented(revision: number) {
    if (this.pending?.revision !== revision) return;
    const scope = JSON.stringify([this.pending.projectId, this.pending.pageId]);
    if (import.meta.env.DEV && scope !== this.visibleScope)
      console.info("[Melt canvas] Visible", this.pending);
    this.visibleScope = scope;
    this.dispose();
  }
  failed(error: unknown) {
    console.error("[Melt canvas failed]", error, this.details());
    this.dispose();
  }
  private details() {
    return {
      ...this.pending,
      prepared: this.canvas.dataset.compositionPrepared,
      presented: this.canvas.dataset.presentationReady,
      diagnostics: this.read(),
    };
  }
  dispose() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = undefined;
  }
}
