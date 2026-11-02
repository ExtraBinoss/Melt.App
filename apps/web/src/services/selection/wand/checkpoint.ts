import { isImageAsset, type Asset, type EnginePort } from "@musart/core";
import type { PixelSelectionState } from "../preview";
import type { WandClient } from "./client";
interface Saved {
  projectId: string;
  pageId: string;
  layerId: string;
  assetId: string;
  asset: WeakRef<Asset>;
  state: PixelSelectionState;
  alpha: Uint8Array;
}
/** One bounded alpha checkpoint; originals and documents are never strongly retained. */
export class SelectionCheckpoint {
  private saved: Saved | null = null;
  private worker: WandClient | null = null;
  private version = 0;
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly engine: EnginePort) {}
  save(worker: WandClient, state: PixelSelectionState, waits: readonly (Promise<void> | null)[]) {
    const snapshot = this.engine.getSnapshot(),
      page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!,
      layer = page.layers.find((layer) => layer.id === state.layerId),
      asset = layer?.assetId ? snapshot.project.assets[layer.assetId] : undefined;
    if (!asset || !isImageAsset(asset)) {
      worker.dispose();
      return;
    }
    this.worker?.dispose();
    this.worker = worker;
    const version = ++this.version;
    this.pending = (async () => {
      await Promise.allSettled(waits.filter((wait) => wait !== null));
      if (version !== this.version) return;
      const response = await worker.request({ type: "snapshot" });
      if (version !== this.version || !("selection" in response)) return;
      this.saved = {
        projectId: snapshot.project.id,
        pageId: snapshot.pageId,
        layerId: state.layerId,
        assetId: asset.id,
        asset: new WeakRef(asset),
        state: { ...state, busy: false, dragging: false, applying: false },
        alpha: response.selection,
      };
    })()
      .catch(() => {
        if (version === this.version) this.saved = null;
      })
      .finally(() => {
        worker.dispose();
        if (this.worker === worker) this.worker = null;
      });
  }
  async read() {
    await this.pending;
    const saved = this.saved;
    if (!saved) return null;
    const snapshot = this.engine.getSnapshot(),
      page = snapshot.project.pages.find((page) => page.id === snapshot.pageId),
      layer = page?.layers.find((layer) => layer.id === saved.layerId),
      asset = snapshot.project.assets[saved.assetId],
      original = saved.asset.deref();
    if (
      snapshot.project.id !== saved.projectId ||
      snapshot.pageId !== saved.pageId ||
      layer?.assetId !== saved.assetId ||
      !asset ||
      !original ||
      asset !== original ||
      !isImageAsset(asset) ||
      !isImageAsset(original) ||
      asset.width !== saved.state.width ||
      asset.height !== saved.state.height ||
      asset.dataUrl !== original.dataUrl
    )
      return null;
    return saved;
  }
  dispose() {
    this.version++;
    this.worker?.dispose();
    this.worker = null;
    this.saved = null;
  }
}
