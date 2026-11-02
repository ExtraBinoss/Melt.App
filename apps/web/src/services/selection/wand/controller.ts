import { SelectionCheckpoint } from "./checkpoint";
import { readDataUrl } from "../../assets/imports";
import { copySelectionCommands } from "./copy-commands";
import type { MaskSelectionPort } from "../preview";
import type { MaskResult } from "../selection";
import { createLayerGeometryIndex, isImageAsset, type Asset, type EnginePort } from "@musart/core";
import {
  captureGestureOrigin,
  isGestureOriginCurrent,
  type GestureOrigin,
} from "../../../canvas/interaction/gesture-origin";
import { maskToDataUrl } from "../pixel-selection";
import { WandClient } from "./client";
import { MAX_SELECTION_PIXELS } from "./worker-host";
import { selectionMaskCommands } from "./mask-commands";
import type { PixelSelectionState, SelectionMode, WandPreview, WandResponse } from "./model";
interface Dependencies {
  pixels(asset: Asset): Promise<ImageData>;
  client?(): WandClient;
  encode?: typeof maskToDataUrl;
  maskName?(): string;
  copyName?(sourceName: string): string;
  copyEmpty?(): string;
  reselectEmpty?(): string;
}
interface Target {
  origin: GestureOrigin;
  layerId: string;
  width: number;
  height: number;
  x: number;
  y: number;
}
const cancelled = () => new DOMException("Pixel selection cancelled.", "AbortError");
/** Selection is presentation state. Explicit Keep/Erase publishes one document transaction. */
export class PixelSelectionController implements MaskSelectionPort {
  private readonly listeners = new Set<() => void>();
  private state: PixelSelectionState | null = null;
  private accepted: PixelSelectionState | null = null;
  private target: Target | null = null;
  private client: WandClient | null = null;
  private stop: (() => void) | null = null;
  private generation = 0;
  private gestureVersion = 0;
  private loading: Promise<void> = Promise.resolve();
  private running: Promise<void> | null = null;
  private accepting: Promise<void> | null = null;
  private controlling: Promise<void> | null = null;
  private wanted: number | null = null;
  private closed = false;
  private readonly checkpoint: SelectionCheckpoint;
  constructor(
    private readonly engine: EnginePort,
    private readonly dependencies: Dependencies,
  ) {
    this.checkpoint = new SelectionCheckpoint(engine);
  }
  read = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: PixelSelectionState | null) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  private current(generation: number) {
    const snapshot = this.engine.getSnapshot();
    return (
      !this.closed &&
      generation === this.generation &&
      this.target &&
      isGestureOriginCurrent(this.engine, this.target.origin) &&
      snapshot.selection.length === 1 &&
      snapshot.selection[0] === this.target.layerId
    );
  }
  private requireCurrent(generation: number) {
    if (!this.current(generation)) throw cancelled();
  }
  private preview(response: WandResponse): WandPreview {
    if (!("preview" in response)) throw Error("Pixel selection preview is missing.");
    return response.preview;
  }
  private async prepareTarget(
    layerId: string,
    x: number,
    y: number,
    tolerance: number,
    mode: SelectionMode = "new",
    contiguous = true,
    dragging = true,
  ) {
    if (this.closed) throw cancelled();
    const enteredGeneration = this.generation,
      enteredGesture = this.gestureVersion,
      snapshot = this.engine.getSnapshot(),
      page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!,
      index = createLayerGeometryIndex(page),
      layer = index.byId.get(layerId),
      asset = layer?.assetId ? snapshot.project.assets[layer.assetId] : undefined;
    if (
      !layer ||
      layer.kind !== "image" ||
      !asset ||
      !isImageAsset(asset) ||
      index.isLocked(layer.id) ||
      !index.isVisible(layer.id)
    )
      throw Object.assign(Error("Select an unlocked image for pixel selection."), {
        code: "PIXEL_SELECTION_IMAGE_REQUIRED",
      });
    if (asset.width * asset.height > MAX_SELECTION_PIXELS)
      throw Object.assign(
        Error("This image is too large for pixel selection. Resize it before retrying."),
        { code: "PIXEL_SELECTION_TOO_LARGE" },
      );
    await Promise.all([this.running, this.accepting, this.controlling]).catch(() => undefined);
    if (
      enteredGeneration !== this.generation ||
      enteredGesture !== this.gestureVersion ||
      this.engine.getSnapshot().project !== snapshot.project ||
      this.engine.getSnapshot().pageId !== snapshot.pageId
    )
      throw cancelled();
    if (!this.current(this.generation) || this.target?.layerId !== layerId) this.deselect(false);
    const generation = this.generation;
    this.gestureVersion++;
    this.target = {
      origin: captureGestureOrigin(this.engine),
      layerId,
      width: layer.width,
      height: layer.height,
      x: Math.max(0, Math.min(asset.width - 1, (x / layer.width) * asset.width)),
      y: Math.max(0, Math.min(asset.height - 1, (y / layer.height) * asset.height)),
    };
    this.publish({
      width: asset.width,
      height: asset.height,
      path: this.accepted?.path ?? "",
      selected: this.accepted?.selected ?? 0,
      simplified: this.accepted?.simplified ?? false,
      layerId,
      tolerance,
      mode,
      contiguous,
      busy: true,
      dragging,
      replacesMask: Boolean(layer.mask),
    });
    if (!this.stop)
      this.stop = this.engine.subscribe(() => {
        if (!this.current(this.generation)) this.deselect(false);
      });
    if (!this.client) {
      const client = this.dependencies.client ? this.dependencies.client() : new WandClient();
      this.client = client;
      this.loading = (async () => {
        const pixels = await this.dependencies.pixels(asset);
        this.requireCurrent(generation);
        await client.request({
          type: "source",
          data: pixels.data,
          width: pixels.width,
          height: pixels.height,
        });
        this.requireCurrent(generation);
      })();
    }
    return generation;
  }
  async begin(
    layerId: string,
    x: number,
    y: number,
    tolerance: number,
    mode: SelectionMode = "new",
    contiguous = true,
  ) {
    await this.prepareTarget(layerId, x, y, tolerance, mode, contiguous);
    await this.update(tolerance);
  }
  /** Shared import boundary for ML, color selection and future selection algorithms. */
  async prepareMask(layerId: string) {
    const generation = await this.prepareTarget(layerId, 0, 0, 32, "new", true, false);
    try {
      await this.loading;
      this.requireCurrent(generation);
    } catch (error) {
      if (generation === this.generation) this.deselect();
      throw error;
    }
  }
  setBusy(busy: boolean) {
    if (this.state) this.publish({ ...this.state, busy, ...(busy ? { error: undefined } : {}) });
  }
  failMask(error: string) {
    if (this.state) this.publish({ ...this.state, busy: false, error });
  }
  async previewMask(mask: MaskResult, holdBusy = false) {
    const generation = this.generation,
      version = this.gestureVersion;
    this.requireControl(generation, version);
    const preview = this.preview(
      await this.client!.request({
        type: "mask",
        data: mask.data,
        width: mask.width,
        height: mask.height,
      }),
    );
    this.requireControl(generation, version);
    this.accepted = { ...this.state!, ...preview, busy: false, dragging: false, applying: false };
    this.publish(holdBusy ? { ...this.accepted, busy: true } : this.accepted);
  }
  update = (tolerance: number): Promise<void> => {
    if (!this.target || !this.state?.dragging || this.closed) return Promise.reject(cancelled());
    this.wanted = Math.max(0, Math.min(255, Math.round(tolerance)));
    if (this.running) return this.running;
    const generation = this.generation,
      version = this.gestureVersion;
    this.running = (async () => {
      await this.loading;
      while (this.wanted !== null && this.state?.dragging) {
        this.requireCurrent(generation);
        const value = this.wanted,
          state = this.state,
          target = this.target!;
        this.wanted = null;
        const preview = this.preview(
          await this.client!.request({
            type: "preview",
            x: target.x,
            y: target.y,
            tolerance: value,
            mode: state.mode,
            contiguous: state.contiguous,
          }),
        );
        this.requireCurrent(generation);
        if (version !== this.gestureVersion) throw cancelled();
        if (this.state?.dragging)
          this.publish({ ...state, ...preview, tolerance: value, busy: this.wanted !== null });
      }
    })().finally(() => {
      if (generation === this.generation) this.running = null;
    });
    return this.running;
  };
  accept(): Promise<void> {
    if (this.accepting) return this.accepting;
    const generation = this.generation;
    this.accepting = (async () => {
      await this.running;
      this.requireCurrent(generation);
      if (!this.state?.dragging) return;
      // Pointer release accepts presentation state before its worker acknowledgment.
      // A following gesture waits for that ACK and must not restore an older base.
      this.accepted = { ...this.state, busy: false, dragging: false };
      this.publish({ ...this.accepted, busy: true });
      const accepted = this.accepted;
      const preview = this.preview(await this.client!.request({ type: "accept" }));
      this.requireCurrent(generation);
      this.accepted = { ...accepted, ...preview };
      this.publish(this.accepted);
    })()
      .catch((error) => {
        if (generation === this.generation) this.deselect();
        throw error;
      })
      .finally(() => {
        if (generation === this.generation) this.accepting = null;
      });
    return this.accepting;
  }
  cancel = () => {
    this.gestureVersion++;
    this.wanted = null;
    if (!this.accepted) {
      this.deselect();
      return;
    }
    const pending = [this.running, this.accepting, this.controlling].filter(
        (task) => task !== null,
      ),
      generation = this.generation,
      version = this.gestureVersion;
    this.publish(pending.length ? { ...this.accepted, busy: true } : this.accepted);
    if (pending.length)
      void Promise.allSettled(pending).then(() => {
        if (generation === this.generation && version === this.gestureVersion && this.accepted)
          this.publish(this.accepted);
      });
  };
  private requireControl(generation: number, gesture: number) {
    this.requireCurrent(generation);
    if (gesture !== this.gestureVersion) throw cancelled();
  }
  private control(action: (generation: number, gesture: number) => Promise<void>): Promise<void> {
    const generation = this.generation,
      gesture = this.gestureVersion;
    let pending!: Promise<void>;
    pending = Promise.resolve()
      .then(() => {
        this.requireControl(generation, gesture);
        return action(generation, gesture);
      })
      .catch((error) => {
        if (generation === this.generation) this.deselect();
        throw error;
      })
      .finally(() => {
        if (this.controlling === pending) this.controlling = null;
      });
    this.controlling = pending;
    this.publish({ ...this.state!, busy: true, applying: true });
    return pending;
  }
  async invert() {
    if (!this.state || this.state.busy || this.state.dragging || this.state.error) return;
    return this.control(async (generation, gesture) => {
      const preview = this.preview(await this.client!.request({ type: "invert" }));
      this.requireControl(generation, gesture);
      this.accepted = { ...this.state!, ...preview, busy: false, dragging: false, applying: false };
      this.publish(this.accepted);
    });
  }
  async createMask() {
    return this.applyMask(false);
  }
  async erase() {
    return this.applyMask(true);
  }
  async reselect() {
    if (this.state) return;
    const saved = await this.checkpoint.read();
    if (this.state) return;
    if (!saved)
      throw Error(
        this.dependencies.reselectEmpty?.() ?? "No previous pixel selection is available.",
      );
    const generation = this.generation;
    this.engine.select([saved.layerId]);
    if (generation !== this.generation || this.state) return;
    await this.prepareMask(saved.layerId);
    const current = this.generation;
    const response = await this.client!.request({ type: "restore", alpha: saved.alpha.slice() });
    this.requireCurrent(current);
    this.accepted = {
      ...saved.state,
      ...this.preview(response),
      busy: false,
      dragging: false,
      applying: false,
    };
    this.publish(this.accepted);
  }
  async copyPixels() {
    return this.extract(false);
  }
  async cutPixels() {
    return this.extract(true);
  }
  private async extract(cut: boolean) {
    if (!this.state || this.state.busy || this.state.dragging || this.state.error) return;
    const empty = () => Error(this.dependencies.copyEmpty?.() ?? "The selected area is empty.");
    if (!this.state.selected) throw empty();
    return this.control(async (generation, gesture) => {
      const state = this.state!,
        response = await this.client!.request({ type: "extract" });
      this.requireControl(generation, gesture);
      if (!("image" in response)) throw Error("Copied selection pixels are missing.");
      if (!response.image) throw empty();
      const image = response.image;
      const dataUrl =
        "blob" in image
          ? await readDataUrl(image.blob)
          : (this.dependencies.encode ?? maskToDataUrl)(image.data, image.width, image.height);
      this.requireControl(generation, gesture);
      const snapshot = this.engine.getSnapshot(),
        page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!,
        original = createLayerGeometryIndex(page).get(this.target!.layerId),
        name = this.dependencies.copyName?.(original.name) ?? `${original.name} copy`;
      const commands = copySelectionCommands(
        page,
        original.id,
        {
          id: crypto.randomUUID(),
          name,
          mime: "image/png",
          width: image.width,
          height: image.height,
          dataUrl,
        },
        { x: image.x, y: image.y, sourceWidth: state.width, sourceHeight: state.height },
        name,
        this.dependencies.maskName?.() ?? "Selection mask",
      );
      if (cut) {
        const mask = await this.client!.request({ type: "export" });
        this.requireControl(generation, gesture);
        if (!("mask" in mask)) throw Error("Selection mask is missing.");
        const dataUrl = (this.dependencies.encode ?? maskToDataUrl)(
          mask.mask.data,
          mask.mask.width,
          mask.mask.height,
        );
        commands.unshift(
          ...selectionMaskCommands(
            page,
            original.id,
            {
              id: crypto.randomUUID(),
              name: this.dependencies.maskName?.() ?? "Selection mask",
              mime: "image/png",
              width: mask.mask.width,
              height: mask.mask.height,
              dataUrl,
            },
            true,
          ),
        );
      }
      this.requireControl(generation, gesture);
      this.engine.transaction(commands);
      this.deselect(false);
    });
  }
  private async applyMask(erase: boolean) {
    if (!this.state?.selected || this.state.busy || this.state.dragging || this.state.error) return;
    return this.control(async (generation, gesture) => {
      const response = await this.client!.request({ type: "export" });
      this.requireControl(generation, gesture);
      if (!("mask" in response)) throw Error("Pixel selection mask is missing.");
      const dataUrl = (this.dependencies.encode ?? maskToDataUrl)(
          response.mask.data,
          response.mask.width,
          response.mask.height,
        ),
        id = crypto.randomUUID(),
        layerId = this.target!.layerId;
      this.requireControl(generation, gesture);
      const snapshot = this.engine.getSnapshot(),
        page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
      this.engine.transaction(
        selectionMaskCommands(
          page,
          layerId,
          {
            id,
            name: this.dependencies.maskName?.() ?? "Selection mask",
            mime: "image/png",
            width: response.mask.width,
            height: response.mask.height,
            dataUrl,
          },
          erase,
        ),
      );
      this.deselect();
    });
  }
  deselect = (remember = true) => {
    const previous = this.accepted,
      client = this.client;
    if (remember && previous && client)
      this.checkpoint.save(client, previous, [this.running, this.accepting, this.controlling]);
    this.generation++;
    this.wanted = null;
    this.running = null;
    this.accepting = null;
    this.controlling = null;
    this.loading = Promise.resolve();
    if (!remember || !previous) client?.dispose();
    this.client = null;
    this.stop?.();
    this.stop = null;
    this.target = null;
    this.accepted = null;
    this.publish(null);
  };
  dispose = () => {
    if (this.closed) return;
    this.closed = true;
    this.deselect(false);
    this.checkpoint.dispose();
    this.listeners.clear();
  };
}
