import { readDataUrl } from "../assets/imports";
import { isImageAsset, isVideoAsset, type Effect, type EnginePort, type Layer } from "@musart/core";
import { DepthClient } from "./client";
import { canPrepareDepth, depthVideoOriginal, generateEffectDepth } from "./service";
import { SelectionPresentation } from "../selection/object/presentation";
export interface DepthPreparationState {
  layerId: string;
  effectId: string;
  targetName: string;
  thumbnail?: string;
  automatic: true;
  preparingSource: boolean;
  mediaKind: "image" | "video";
  busy: boolean;
  completed: boolean;
  progress: number;
  error: string;
}
const controllers = new WeakMap<EnginePort, DepthPreparationController>();
export const depthPreparationFor = (engine: EnginePort) => controllers.get(engine);
/** Application-owned job: inspector closure never discards download/progress/completion UI. */
export class DepthPreparationController {
  readonly client: DepthClient;
  readonly presentation = new SelectionPresentation();
  private state: DepthPreparationState | null = null;
  private listeners = new Set<() => void>();
  private cancellation: AbortController | null = null;
  private stop: () => void;
  private projectId: string;
  private known = new Set<string>();
  constructor(
    private readonly engine: EnginePort,
    client = new DepthClient(),
  ) {
    this.client = client;
    this.projectId = engine.getSnapshot().project.id;
    this.known = this.effectIds();
    controllers.set(engine, this);
    this.stop = engine.subscribe(() => {
      const snapshot = engine.getSnapshot();
      const next = this.effectIds(),
        previous = this.known;
      this.known = next;
      if (snapshot.project.id !== this.projectId) {
        this.projectId = snapshot.project.id;
        this.reset();
        return;
      }
      const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId);
      if (this.state) {
        const owner = page?.layers.find((layer) => layer.id === this.state!.layerId);
        if (
          !owner ||
          (this.state.completed &&
            !owner.effects.some(
              (effect) => effect.id === this.state!.effectId && effect.inputs?.depth,
            ))
        )
          this.reset();
      }
      for (const layer of page?.layers ?? []) {
        const effect = layer.effects.find(
          (effect) =>
            effect.type === "depth-anything" && !effect.inputs?.depth && !previous.has(effect.id),
        );
        if (effect && canPrepareDepth(engine, layer.id)) {
          void this.request(layer.id, effect);
          break;
        }
      }
    });
  }
  private effectIds() {
    return new Set(
      this.engine
        .getSnapshot()
        .project.pages.flatMap((page) =>
          page.layers.flatMap((layer) => layer.effects.map((effect) => effect.id)),
        ),
    );
  }
  read = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(value: DepthPreparationState | null) {
    this.state = value;
    for (const listener of this.listeners) listener();
  }
  retainPresentation = this.presentation.retain;
  presented = this.presentation.painted;
  async request(layerId: string, effect: Effect): Promise<void> {
    this.reset();
    const before = this.engine.getSnapshot(),
      page = before.project.pages.find((page) => page.id === before.pageId);
    const layer = page?.layers.find((layer) => layer.id === layerId),
      asset = layer?.assetId ? before.project.assets[layer.assetId] : undefined;
    if (
      !layer ||
      !asset ||
      !layer.effects.includes(effect) ||
      !canPrepareDepth(this.engine, layerId)
    )
      return;
    const cancellation = new AbortController();
    this.cancellation = cancellation;
    this.client.model.start();
    const painted = this.presentation.wait(layerId);
    this.publish({
      layerId,
      effectId: effect.id,
      targetName: layer.name,
      ...(isImageAsset(asset) ? { thumbnail: asset.dataUrl } : {}),
      automatic: true,
      preparingSource: isVideoAsset(asset),
      mediaKind: isVideoAsset(asset) ? "video" : "image",
      busy: true,
      completed: false,
      progress: 0,
      error: "",
    });
    const current = () => {
      cancellation.signal.throwIfAborted();
      const now = this.engine.getSnapshot();
      if (
        now.project.id !== before.project.id ||
        now.pageId !== before.pageId ||
        now.project.pages
          .find((page) => page.id === before.pageId)
          ?.layers.find((item: Layer) => item.id === layerId) !== layer
      )
        throw new DOMException("Depth target changed.", "AbortError");
    };
    const stop = this.engine.subscribe(() => {
      try {
        current();
      } catch {
        cancellation.abort();
        this.client.cancel();
      }
    });
    try {
      let original: Blob | undefined;
      if (isVideoAsset(asset)) {
        original = await depthVideoOriginal(this.engine, asset, cancellation.signal);
        current();
        const poster = await this.client.poster(original, asset);
        current();
        const thumbnail = await readDataUrl(poster.blob);
        current();
        if (this.state) this.publish({ ...this.state, thumbnail, preparingSource: false });
      }
      if (painted) await painted;
      current();
      await this.client.model.prepare(); // One download action continues directly into generation.
      current();
      stop();
      await generateEffectDepth(
        this.engine,
        layerId,
        effect,
        this.client,
        cancellation.signal,
        (progress) => {
          if (!cancellation.signal.aborted && this.state) this.publish({ ...this.state, progress });
        },
        original,
      );
      if (!cancellation.signal.aborted && this.state)
        this.publish({ ...this.state, busy: false, completed: true, progress: 1 });
    } catch (error) {
      if (this.cancellation !== cancellation) return;
      if (error instanceof DOMException && error.name === "AbortError") this.reset();
      else if (this.state)
        this.publish({
          ...this.state,
          busy: false,
          error: error instanceof Error ? error.message : String(error),
        });
    } finally {
      stop();
      if (this.cancellation === cancellation) this.client.cancel();
    }
  }
  reset = () => {
    this.cancellation?.abort();
    this.cancellation = null;
    this.presentation.cancel();
    this.client.model.cancel();
    this.publish(null);
  };
  dispose() {
    this.stop();
    this.reset();
    this.client.dispose();
    this.listeners.clear();
    if (controllers.get(this.engine) === this) controllers.delete(this.engine);
  }
}
