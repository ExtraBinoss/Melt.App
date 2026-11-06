import type { EnginePort, SessionSnapshot } from "@musart/core";
import type { PreviewValue } from "../../state/session/preview-source";
import type { SavedTreatment } from "./store";
import { effectPresetPreview } from "./preview";

type Options = {
  engine: EnginePort | undefined;
  context: () => {
    effectId: string;
    layerId?: string;
    get: (id: string) => Promise<SavedTreatment | null>;
    onCancel?: () => void;
    onError: (message: string) => void;
  };
  read: () => PreviewValue | null;
  write: (preview: PreviewValue | null) => void;
};
type Request = {
  id: string;
  token: number;
  origin: SessionSnapshot;
  baseline: PreviewValue | null;
  effectId: string;
  layerId: string | undefined;
};
/** One accepted payload read and one latest pending hover. Reads and render previews are never writes. */
export class EffectPresetPreviewController {
  private token = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queued: Request | null = null;
  private loading = false;
  private owned: PreviewValue | null = null;
  private origin: SessionSnapshot | null = null;
  private requested = "";
  private closed = false;
  private stop: (() => void) | undefined;
  constructor(private readonly options: Options) {}
  start() {
    this.closed = false;
    this.stop?.();
    this.stop = this.options.engine?.subscribe(() => {
      if (this.origin && !this.current(this.origin)) this.cancel();
    });
  }
  private current(origin: SessionSnapshot) {
    const next = this.options.engine?.getSnapshot();
    return (
      next?.project === origin.project &&
      next.pageId === origin.pageId &&
      next.selection === origin.selection
    );
  }
  preview = (id: string) => {
    if (this.closed || !this.options.engine || id === "custom") {
      this.cancel();
      return;
    }
    if (this.requested === id && this.origin && this.current(this.origin)) return;
    this.cancel();
    const context = this.options.context();
    context.onCancel?.();
    const origin = this.options.engine.getSnapshot();
    this.origin = origin;
    this.requested = id;
    const request: Request = {
      id,
      token: ++this.token,
      origin,
      baseline: this.options.read(),
      effectId: context.effectId,
      layerId: context.layerId,
    };
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (request.token !== this.token || this.closed) return;
      this.queued = request;
      void this.drain();
    }, 60);
  };
  private async drain() {
    if (this.loading || !this.queued || this.closed) return;
    const request = this.queued;
    this.queued = null;
    this.loading = true;
    try {
      const record = await this.options.context().get(request.id);
      if (
        this.closed ||
        request.token !== this.token ||
        !this.current(request.origin) ||
        this.options.read() !== request.baseline
      )
        return;
      if (!record) throw Error("Preset unavailable");
      const preview = effectPresetPreview(
        request.origin,
        request.effectId,
        request.layerId,
        record.treatment,
      );
      this.owned = preview;
      this.options.write(preview);
    } catch (reason) {
      if (!this.closed && request.token === this.token && this.current(request.origin)) {
        this.cancel();
        this.options.context().onError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      this.loading = false;
      if (this.queued && !this.closed) void this.drain();
    }
  }
  cancel = () => {
    this.token++;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.queued = null;
    this.requested = "";
    this.origin = null;
    if (this.owned && this.options.read() === this.owned) this.options.write(null);
    this.owned = null;
  };
  dispose = () => {
    this.closed = true;
    this.cancel();
    this.stop?.();
    this.stop = undefined;
  };
}
