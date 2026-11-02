import {
  createLayerGeometryIndex,
  isImageAsset,
  type EnginePort,
  type ImageAsset,
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
interface Target {
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
  private history: SelectionPrompt[] = [];
  private choice: "points" | "box" = "points";
  private readonly stop: () => void;
  constructor(
    private readonly engine: EnginePort,
    private readonly client: SelectionClient,
    private readonly pixels: MaskSelectionPort,
  ) {
    this.stop = pixels.subscribe(() => {
      if (!this.state || this.preparing) return;
      const selection = pixels.read();
      if (!selection) this.clear();
      else if (Boolean(this.state.applying) !== Boolean(selection.applying))
        this.publish({ ...this.state, applying: Boolean(selection.applying) });
    });
  }
  read = () => this.state;
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
      asset,
      width: layer.width,
      height: layer.height,
      origin: captureGestureOrigin(this.engine),
    };
    this.publish({
      layerId,
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
    this.remember();
    this.publish({ ...this.state!, points: [...this.state!.points, point], scanning: false });
    return this.request();
  }
  async box(layerId: string, box: SelectionBox) {
    this.attach(layerId);
    const a = this.position(Math.min(box.x, box.right), Math.min(box.y, box.bottom)),
      b = this.position(Math.max(box.x, box.right), Math.max(box.y, box.bottom));
    if (a.x === b.x || a.y === b.y) throw Error("Draw a rectangle with a nonzero area.");
    this.remember();
    this.publish({ ...this.state!, box: { ...a, right: b.x, bottom: b.y }, scanning: false });
    return this.request();
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
      points: this.state.points,
      ...(this.state.box ? { box: this.state.box } : {}),
    });
    if (this.history.length > 64) this.history.shift();
  }
  async removeLast() {
    if (this.pixels.read()?.applying) throw abort();
    if (!this.state) return;
    const previous = this.history.pop();
    if (!previous || (!previous.points.length && !previous.box)) {
      this.reset();
      return;
    }
    this.publish({ ...this.state, ...previous, box: previous.box, scanning: false });
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
      const result = state.scanning
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
    this.clear();
    this.pixels.deselect();
  };
  dispose = () => {
    if (this.closed) return;
    this.closed = true;
    this.stop();
    this.reset();
    this.listeners.clear();
  };
}
