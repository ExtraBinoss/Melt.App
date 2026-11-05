import { SelectionPresentation } from "./presentation";
import { readDataUrl } from "../../assets/imports";
import { selectionMaskCommands } from "../wand/mask-commands";
import {
  createLayerGeometryIndex,
  isImageAsset,
  type EnginePort,
  type ImageAsset,
  type Layer,
} from "@musart/core";
import {
  captureGestureOrigin,
  isGestureOriginCurrent,
  type GestureOrigin,
} from "../../../canvas/interaction/gesture-origin";
import type { SelectionClient } from "../selection";
import { MAX_SELECTION_POINTS, type SelectionBox, type SelectionPrompt } from "../prompts";
import type { MaskSelectionPort } from "../preview";
import type { ObjectSelectionPort, ObjectSelectionState } from "./model";
import type { VideoBackgroundController } from "../video/controller";
interface Target {
  layer: Layer;
  asset: ImageAsset;
  width: number;
  height: number;
  origin: GestureOrigin;
}
const abort = () => new DOMException("Object selection cancelled.", "AbortError");
/** Algorithm-specific prompts feed the same ephemeral mask and document actions as the wand. */
export class ObjectSelectionController implements ObjectSelectionPort {
  private state: ObjectSelectionState | null = null;
  private target: Target | null = null;
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private generation = 0;
  private running: Promise<void> | null = null;
  private preparing = false;
  private wanted = false;
  private closed = false;
  private history: (SelectionPrompt & { automatic?: boolean })[] = [];
  private choice: "points" | "box" = "points";
  private readonly stop: () => void;
  private readonly stopEngine: () => void;
  private readonly stopVideo?: () => void;
  private committing = false;
  private readonly presentation = new SelectionPresentation();
  retainPresentation = () => {
    const image = this.presentation.retain(),
      video = this.video?.presentation.retain();
    return () => {
      image();
      video?.();
    };
  };
  presented = (id: string) => {
    this.presentation.painted(id);
    this.video?.presentation.painted(id);
  };
  constructor(
    private readonly engine: EnginePort,
    private readonly client: SelectionClient,
    private readonly pixels: MaskSelectionPort,
    private readonly maskName = () => "Selection mask",
    private readonly video?: VideoBackgroundController,
  ) {
    this.stopVideo = video?.subscribe(() => {
      for (const listener of this.listeners) listener();
    });
    this.stop = pixels.subscribe(() => {
      if (!this.state || this.preparing || this.state.automatic) return;
      const selection = pixels.read();
      if (!selection) this.clear();
      else if (Boolean(this.state.applying) !== Boolean(selection.applying))
        this.publish({ ...this.state, applying: Boolean(selection.applying) });
    });
    this.stopEngine = engine.subscribe(() => {
      if (!this.state || !this.target || this.committing) return;
      const snapshot = engine.getSnapshot();
      if (this.state.automatic) {
        if (!this.automaticCurrent(this.target)) this.reset();
        else if (this.target.origin.project !== snapshot.project)
          this.target.origin = captureGestureOrigin(engine);
        return;
      }
      if (
        !isGestureOriginCurrent(engine, this.target.origin) ||
        snapshot.selection.length !== 1 ||
        snapshot.selection[0] !== this.state.layerId
      )
        this.reset();
    });
  }
  read = () => this.video?.read() ?? this.state;
  mode = () => this.choice;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: ObjectSelectionState | null) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  setMode = (mode: "points" | "box") => {
    this.choice = mode;
    this.publish(this.state ? { ...this.state, mode } : null);
  };
  private attach(layerId: string) {
    const selected = this.engine.getSnapshot().selection;
    if (selected.length && (selected.length !== 1 || selected[0] !== layerId)) throw abort();
    if (this.closed || this.pixels.read()?.applying) throw abort();
    if (
      this.state?.layerId === layerId &&
      this.target &&
      isGestureOriginCurrent(this.engine, this.target.origin)
    )
      return;
    this.reset();
    const snapshot = this.engine.getSnapshot(),
      page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!,
      index = createLayerGeometryIndex(page),
      layer = index.byId.get(layerId),
      asset = layer?.assetId ? snapshot.project.assets[layer.assetId] : undefined;
    if (
      !layer ||
      layer.kind !== "image" ||
      layer.spatial ||
      !asset ||
      !isImageAsset(asset) ||
      index.isLocked(layerId) ||
      !index.isVisible(layerId)
    )
      throw Object.assign(Error("Select an unlocked 2D image for object selection."), {
        code: "PIXEL_SELECTION_IMAGE_REQUIRED",
      });
    this.engine.select([layerId]);
    this.target = {
      layer,
      asset,
      width: layer.width,
      height: layer.height,
      origin: captureGestureOrigin(this.engine),
    };
    this.publish({
      layerId,
      targetName: layer.name,
      thumbnail: asset.dataUrl,
      width: asset.width,
      height: asset.height,
      points: [],
      busy: false,
      scanning: false,
      candidates: [],
      error: "",
      mode: this.choice,
    });
  }
  private automaticCurrent(target: Target) {
    const snapshot = this.engine.getSnapshot();
    if (
      snapshot.project.id !== target.origin.project.id ||
      snapshot.pageId !== target.origin.pageId
    )
      return false;
    const page = snapshot.project.pages.find((item) => item.id === target.origin.pageId);
    return Boolean(
      page &&
      createLayerGeometryIndex(page).byId.get(target.layer.id) === target.layer &&
      snapshot.project.assets[target.asset.id] === target.asset,
    );
  }
  private position(x: number, y: number) {
    const { asset, width, height } = this.target!;
    if (![x, y].every(Number.isFinite)) throw Error("Invalid object selection position.");
    return {
      x: Math.max(0, Math.min(asset.width - 1, (x * asset.width) / width)),
      y: Math.max(0, Math.min(asset.height - 1, (y * asset.height) / height)),
    };
  }
  async point(layerId: string, x: number, y: number, foreground: boolean) {
    this.attach(layerId);
    if (this.state!.points.length >= MAX_SELECTION_POINTS)
      throw Error("The selection has reached 64 points. Remove a point or start again.");
    const point = { ...this.position(x, y), label: foreground ? (1 as const) : (0 as const) };
    const previous = this.state!.hovering ? [] : this.state!.points;
    if (!this.state!.hovering) this.remember();
    this.publish({
      ...this.state!,
      points: [...previous, point],
      hovering: false,
      automatic: false,
      scanning: false,
    });
    return this.request();
  }
  async box(layerId: string, box: SelectionBox) {
    this.attach(layerId);
    const a = this.position(Math.min(box.x, box.right), Math.min(box.y, box.bottom)),
      b = this.position(Math.max(box.x, box.right), Math.max(box.y, box.bottom));
    if (a.x === b.x || a.y === b.y) throw Error("Draw a rectangle with a nonzero area.");
    this.remember();
    this.publish({
      ...this.state!,
      points: [],
      box: { ...a, right: b.x, bottom: b.y },
      hovering: false,
      automatic: false,
      scanning: false,
    });
    return this.request();
  }
  /** The common action never decodes original pixels or constructs preview contours on the UI thread. */
  async removeBackground(layerId: string) {
    const snapshot = this.engine.getSnapshot();
    const layer = snapshot.project.pages
      .find((page) => page.id === snapshot.pageId)
      ?.layers.find((layer) => layer.id === layerId);
    if (layer?.kind === "video" && this.video) {
      if (this.running) throw Error("Background removal is already running for another layer.");
      this.clear();
      return this.video.removeBackground(layerId);
    }
    if (this.video?.read()?.busy)
      throw Error("Background removal is already running for another layer.");
    if (this.running && this.state?.automatic) {
      if (this.state.layerId === layerId) return this.running;
      throw Error("Background removal is already running for another layer.");
    }
    const replaceAssetId = this.state?.layerId === layerId ? this.state.automaticMask : undefined;
    this.reset();
    this.attach(layerId);
    const generation = this.generation,
      target = this.target!;
    const current = () =>
      generation === this.generation && this.target === target && this.automaticCurrent(target);
    const presented = this.presentation.wait(layerId);
    this.publish({ ...this.state!, automatic: true, completed: false, busy: true, error: "" });
    const task = (async () => {
      if (presented) await presented;
      if (!current()) throw abort();
      const result = await this.client.backgroundEncoded(target.asset.dataUrl);
      if (!current()) throw abort();
      const dataUrl = await readDataUrl(result.blob);
      if (!current()) throw abort();
      const snapshot = this.engine.getSnapshot(),
        page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
      const asset = {
        id: crypto.randomUUID(),
        name: this.maskName(),
        mime: "image/png",
        width: result.width,
        height: result.height,
        dataUrl,
      };
      this.committing = true;
      try {
        this.engine.transaction(selectionMaskCommands(page, layerId, asset, false, replaceAssetId));
        this.engine.select(snapshot.selection);
      } finally {
        this.committing = false;
      }
      const committed = this.engine.getSnapshot(),
        committedPage = committed.project.pages.find((item) => item.id === committed.pageId)!;
      this.target = {
        ...target,
        layer: createLayerGeometryIndex(committedPage).get(layerId),
        origin: captureGestureOrigin(this.engine),
      };
      this.publish({
        ...this.state!,
        busy: false,
        completed: true,
        automaticMask: asset.id,
        points: result.seed ? [result.seed] : [],
        selected: undefined,
      });
    })()
      .catch((error: unknown) => {
        if (generation === this.generation) {
          if (error instanceof DOMException && error.name === "AbortError") this.reset();
          else
            this.publish({
              ...this.state!,
              busy: false,
              error: error instanceof Error ? error.message : String(error),
            });
        }
        throw error;
      })
      .finally(() => {
        if (this.running === task) this.running = null;
      });
    this.running = task;
    return task;
  }
  refine() {
    if (!this.state?.completed || this.state.busy) return;
    this.engine.select([this.state.layerId]);
    this.publish({ ...this.state, automatic: false, completed: false, selected: 0 });
  }
  async background(layerId: string) {
    this.attach(layerId);
    this.remember();
    this.publish({
      ...this.state!,
      points: [],
      box: undefined,
      automatic: true,
      hovering: false,
      scanning: false,
      candidates: [],
    });
    return this.request();
  }
  async hover(layerId: string, x: number, y: number) {
    const selection = this.engine.getSnapshot().selection;
    if (selection.length !== 1 || selection[0] !== layerId) return;
    if (this.state && !this.state.hovering) return;
    // Hover never starts a model download. It is available after explicit preparation.
    if (this.client.model.read().phase !== "ready") return;
    this.attach(layerId);
    const point = { ...this.position(x, y), label: 1 as const };
    this.publish({
      ...this.state!,
      points: [point],
      hovering: true,
      automatic: false,
      scanning: false,
    });
    return this.request();
  }
  clearHover() {
    if (!this.state?.hovering) return;
    this.reset();
  }
  async apply() {
    if (!this.state || this.state.busy || this.state.error || this.state.hovering) throw abort();
    await this.pixels.createMask(this.state.automaticMask);
  }
  async scan(layerId: string) {
    this.attach(layerId);
    this.remember();
    this.publish({ ...this.state!, points: [], box: undefined, scanning: true, candidates: [] });
    return this.request();
  }
  async candidate(index: number) {
    const candidate = this.state?.candidates[index];
    if (!candidate) throw Error("Object candidate is unavailable.");
    const current = this.state!;
    if (
      current.box ||
      current.points.length !== 1 ||
      current.points[0]?.x !== candidate.x ||
      current.points[0]?.y !== candidate.y
    )
      this.remember();
    this.publish({
      ...this.state!,
      points: [{ x: candidate.x, y: candidate.y, label: 1 }],
      box: undefined,
      scanning: false,
    });
    return this.request();
  }
  private remember() {
    if (this.pixels.read()?.applying) throw abort();
    if (!this.state) return;
    this.history.push({
      automatic: this.state.automatic,
      points: this.state.hovering ? [] : this.state.points,
      ...(this.state.box ? { box: this.state.box } : {}),
    });
    if (this.history.length > 64) this.history.shift();
  }
  async removeLast() {
    if (this.pixels.read()?.applying) throw abort();
    if (!this.state) return;
    const previous = this.history.pop();
    if (!previous || (!previous.points.length && !previous.box && !previous.automatic)) {
      this.reset();
      return;
    }
    this.publish({
      ...this.state,
      ...previous,
      box: previous.box,
      automatic: previous.automatic,
      hovering: false,
      scanning: false,
    });
    return this.request();
  }
  private request(): Promise<void> {
    this.version++;
    this.wanted = true;
    this.publish({ ...this.state!, busy: true, error: "" });
    this.pixels.setBusy(true);
    if (this.running) return this.running;
    const generation = this.generation;
    this.running = this.drain(generation)
      .catch((error: unknown) => {
        if (generation !== this.generation) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          this.reset();
          throw error;
        }
        this.pixels.failMask(error instanceof Error ? error.message : String(error));
        this.publish({
          ...this.state!,
          busy: false,
          scanning: false,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      })
      .finally(() => {
        if (generation === this.generation) this.running = null;
      });
    return this.running;
  }
  private async drain(generation: number) {
    const target = this.target!,
      layerId = this.state!.layerId;
    const current = () =>
      generation === this.generation &&
      this.target === target &&
      isGestureOriginCurrent(this.engine, target.origin);
    if (this.pixels.read()?.layerId !== layerId) {
      this.preparing = true;
      try {
        await this.pixels.prepareMask(layerId);
      } finally {
        if (generation === this.generation) this.preparing = false;
      }
    }
    if (!current()) throw abort();
    while (this.wanted && current()) {
      this.wanted = false;
      const version = this.version,
        state = this.state!;
      const prompt: SelectionPrompt = {
        points: state.points,
        ...(state.box ? { box: state.box } : {}),
      };
      const result = state.automatic
        ? await this.client.background(target.asset.dataUrl)
        : state.scanning
          ? await this.client.scan(target.asset.dataUrl)
          : await this.client.prompt(target.asset.dataUrl, prompt);
      if (!current()) throw abort();
      if (version !== this.version) continue;
      await this.pixels.previewMask(result, true);
      if (!current()) throw abort();
      const candidate = result.candidates?.[0];
      if (version !== this.version) {
        this.pixels.setBusy(true);
        continue;
      }
      this.publish({
        ...this.state!,
        busy: this.wanted,
        selected: this.pixels.read()?.selected ?? 0,
        ...(result.seed ? { points: [result.seed] } : {}),
        scanning: false,
        ...(result.candidates
          ? {
              candidates: result.candidates,
              points: candidate ? [{ x: candidate.x, y: candidate.y, label: 1 }] : [],
            }
          : {}),
      });
      this.pixels.setBusy(this.wanted);
    }
  }
  private clear() {
    this.presentation.cancel();
    this.generation++;
    this.version++;
    this.wanted = false;
    if (this.running) this.client.cancel();
    this.running = null;
    this.target = null;
    this.preparing = false;
    this.history = [];
    this.publish(null);
  }
  release = () => {
    const busy = this.state?.busy;
    this.clear();
    if (busy) this.pixels.cancel();
  };
  reset = () => {
    this.video?.reset();
    this.clear();
    this.pixels.deselect();
  };
  dispose = () => {
    if (this.closed) return;
    this.closed = true;
    this.stop();
    this.stopEngine();
    this.stopVideo?.();
    this.video?.dispose();
    this.reset();
    this.listeners.clear();
  };
}
