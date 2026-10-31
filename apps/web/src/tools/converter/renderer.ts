import {
  applyMotionFrame,
  compileMotion,
  evaluateMotion,
  type Composition,
  type Effect,
  type MotionProgram,
} from "@musart/core";
import { getUiPresentation } from "../../state/session/ui-presentation";
import type { ToolDocument } from "./model";
import type { ImageOutput, ToolRenderApi } from "./types";

/** One retained Melt session, one in-flight frame and one coalesced latest request. */
export class ToolRenderer {
  private readonly session: ReturnType<ToolRenderApi["createRenderSession"]>;
  private readonly abort = new AbortController();
  private readonly presentation = getUiPresentation();
  private readonly observer: IntersectionObserver;
  private readonly unsubscribe: () => void;
  private frame: number | null = null;
  private pending: Promise<void> | null = null;
  private program: MotionProgram | null = null;
  private dirty = true;
  private foreground = false;
  private draft: Effect | null = null;
  private comparing = false;
  private generation = 0;
  private closed = false;
  private frozen = false;
  private visible = true;
  private first = true;
  private anchor: number | null = null;
  private time = 0;
  private notified = 0;
  playing: boolean;
  private disposal: Promise<void> | null = null;
  private readonly unlink: () => void;
  constructor(
    private readonly model: ToolDocument,
    api: ToolRenderApi,
    private readonly host: HTMLElement,
    signal: AbortSignal,
    private readonly callbacks: {
      ready: () => void;
      time: (time: number, playing: boolean) => void;
      error: (error: unknown) => void;
    },
  ) {
    signal.throwIfAborted();
    const abort = () => this.abort.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    this.unlink = () => signal.removeEventListener("abort", abort);
    this.playing = model.tool.media === "video";
    this.session = api.createRenderSession({
      maxBytes: 192 * 1024 * 1024,
      mediaResolver: model.source.resolver,
      signal: this.abort.signal,
    });
    this.update();
    this.unsubscribe = this.presentation.subscribe(this.environment);
    this.observer = new IntersectionObserver(
      (entries) => {
        this.visible = (entries[0]?.intersectionRatio ?? 0) > 0;
        this.environment();
      },
      { threshold: [0, 0.01] },
    );
    this.observer.observe(host);
    document.addEventListener("visibilitychange", this.environment);
  }
  private blocked() {
    return (
      this.frozen ||
      !this.visible ||
      document.hidden ||
      this.presentation.busy() ||
      this.draft !== null
    );
  }
  private clock() {
    return this.anchor === null
      ? this.time
      : Math.max(0, (performance.now() - this.anchor) / 1000) % this.model.clipLength;
  }
  private freezeClock() {
    if (this.anchor !== null) this.time = this.clock();
    this.anchor = null;
  }
  private readonly environment = () => {
    if (this.blocked()) this.freezeClock();
    if (this.frozen || !this.visible || document.hidden) {
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.frame = null;
      return;
    }
    this.schedule();
  };
  private schedule() {
    if (
      this.closed ||
      this.abort.signal.aborted ||
      this.frozen ||
      !this.visible ||
      document.hidden ||
      this.frame !== null ||
      this.pending
    )
      return;
    if (this.blocked() && !this.foreground) return;
    if (this.dirty || this.playing) this.frame = requestAnimationFrame(this.tick);
  }
  update() {
    this.program =
      this.model.tool.media === "video"
        ? compileMotion(this.model.project(), { compositionId: this.model.page().id })
        : null;
    this.time = Math.min(this.time, this.model.clipLength || 0);
    this.draft = null;
    this.request(true);
  }
  preview(effect: Effect | null) {
    this.freezeClock();
    this.draft = effect;
    this.request(true);
  }
  compare(original: boolean) {
    this.comparing = original;
    this.request(true);
  }
  seek(time: number) {
    if (!Number.isFinite(time)) return;
    this.time = Math.max(0, Math.min(time, this.model.clipLength));
    this.anchor = null;
    this.callbacks.time(this.time, this.playing);
    this.request(true);
  }
  play(value: boolean) {
    this.freezeClock();
    this.playing = value;
    this.callbacks.time(this.time, value);
    this.schedule();
  }
  freeze(value: boolean) {
    this.freezeClock();
    this.frozen = value;
    if (value && this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    if (!value) {
      this.dirty = true;
      this.schedule();
    }
  }
  private request(foreground: boolean) {
    this.generation++;
    this.dirty = true;
    this.foreground ||= foreground;
    this.schedule();
  }
  private page(
    at: number,
    preview: boolean,
  ): { page: Composition; plan: ReturnType<typeof evaluateMotion> | undefined } {
    const plan = this.program
      ? evaluateMotion(
          this.program,
          { value: Math.round(at * 1_000_000), rate: 1_000_000 },
          { terminalPreview: true },
        )
      : undefined;
    const page = this.program && plan ? applyMotionFrame(this.program, plan) : this.model.page();
    const effect = preview ? (this.draft ?? this.model.effect()) : this.model.effect();
    return {
      page: {
        ...page,
        layers: page.layers.map((layer) =>
          layer.id === this.model.layerId
            ? {
                ...layer,
                effects: [
                  { ...effect, enabled: preview && this.comparing ? false : effect.enabled },
                ],
              }
            : layer,
        ),
      },
      plan,
    };
  }
  private readonly tick = () => {
    this.frame = null;
    if (this.closed || this.abort.signal.aborted || this.frozen || !this.visible || document.hidden)
      return;
    if (this.blocked()) {
      this.freezeClock();
      if (!this.foreground) return;
    } else if (this.playing && this.anchor === null)
      this.anchor = performance.now() - this.time * 1000;
    const time = this.playing && !this.blocked() ? Math.floor(this.clock() * 30) / 30 : this.time;
    if (!this.dirty && time === this.time) {
      this.schedule();
      return;
    }
    this.time = time;
    const { page, plan } = this.page(time, true),
      generation = this.generation;
    this.dirty = false;
    this.foreground = false;
    this.pending = this.session
      .withCanvasFrame(
        page,
        this.model.project().assets,
        (canvas) => {
          if (this.closed || generation !== this.generation || this.abort.signal.aborted) return;
          canvas.dataset.toolRenderer = this.session.stats()?.backend ?? "unknown";
          if (canvas.parentElement !== this.host) this.host.replaceChildren(canvas);
          if (this.first) {
            this.first = false;
            this.callbacks.ready();
          }
          if (performance.now() - this.notified > 100) {
            this.notified = performance.now();
            this.callbacks.time(this.time, this.playing);
          }
        },
        {
          scale: Math.min(1, 768 / Math.max(page.width, page.height)),
          motionFrame: plan,
          mediaResolver: this.model.source.resolver,
          mediaMode: "exact",
          signal: this.abort.signal,
          canRender: () =>
            !this.closed && generation === this.generation && !this.abort.signal.aborted,
        },
      )
      .catch((error: unknown) => {
        if (this.closed || this.abort.signal.aborted || generation !== this.generation) return;
        this.playing = false;
        this.dirty = false;
        this.foreground = false;
        this.callbacks.error(error);
      })
      .finally(() => {
        this.pending = null;
        this.schedule();
      });
  };
  async image(format: ImageOutput, signal: AbortSignal): Promise<Blob> {
    await this.pending;
    signal.throwIfAborted();
    const { page, plan } = this.page(0, false),
      mime = `image/${format}`;
    return this.session.withCanvasFrame(
      page,
      this.model.project().assets,
      (canvas) =>
        new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (!blob || blob.type !== mime)
                reject(new Error("The browser could not encode this image format."));
              else resolve(blob);
            },
            mime,
            0.94,
          );
        }),
      { scale: 1, motionFrame: plan, signal, mediaResolver: this.model.source.resolver },
    );
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.closed = true;
    this.abort.abort();
    this.unlink();
    this.observer.disconnect();
    this.unsubscribe();
    document.removeEventListener("visibilitychange", this.environment);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.disposal = (async () => {
      await this.pending;
      await this.session.dispose();
      this.host.replaceChildren();
    })();
    return this.disposal;
  }
}
