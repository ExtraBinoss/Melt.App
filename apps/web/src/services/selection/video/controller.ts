import {
  createLayerGeometryIndex,
  isVideoAsset,
  motionTimeToSeconds,
  type EnginePort,
  type Layer,
  type VideoAsset,
} from "@musart/core";
import type { ProjectStore } from "../../projects/storage";
import { readDataUrl } from "../../assets/imports";
import type { SelectionClient } from "../selection";
import type { ObjectSelectionState } from "../object/model";
import { SelectionPresentation } from "../object/presentation";
import { i18n } from "../../../state/i18n";

const aborted = () => new DOMException("Video background removal cancelled.", "AbortError");
export interface VideoBackgroundDependencies {
  store: Pick<ProjectStore, "loadMediaOriginal" | "prepareSaveCurrent" | "persistPrepared">;
  flush?: () => Promise<void>;
  probe(
    blob: Blob,
  ): Promise<
    Pick<
      VideoAsset,
      "width" | "height" | "duration" | "firstTimestamp" | "timeResolution" | "orientation"
    >
  >;
  maskName(): string;
}
/** Immutable original + native matte are admitted in one reserved document/storage transaction. */
export class VideoBackgroundController {
  private state: ObjectSelectionState | null = null;
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private running: Promise<void> | null = null;
  private target: { projectId: string; pageId: string; layer: Layer; asset: VideoAsset } | null =
    null;
  private committing = false;
  private closed = false;
  private cancellation = new AbortController();
  readonly presentation = new SelectionPresentation();
  private readonly stop: () => void;
  constructor(
    private readonly engine: EnginePort,
    private readonly client: SelectionClient,
    private readonly dependencies: VideoBackgroundDependencies,
  ) {
    this.stop = engine.subscribe(() => {
      if (this.target && !this.committing && !this.current()) this.reset();
    });
  }
  read = () => this.state;
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
  private current() {
    const target = this.target;
    if (!target || this.closed) return false;
    const snapshot = this.engine.getSnapshot();
    if (snapshot.project.id !== target.projectId || snapshot.pageId !== target.pageId) return false;
    const page = snapshot.project.pages.find((page) => page.id === target.pageId);
    return (
      !!page &&
      page.layers.find((layer) => layer.id === target.layer.id) === target.layer &&
      snapshot.project.assets[target.asset.id] === target.asset
    );
  }
  removeBackground(layerId: string): Promise<void> {
    if (this.running)
      return this.state?.layerId === layerId
        ? this.running
        : Promise.reject(Error("Background removal is already running for another layer."));
    if (this.closed) return Promise.reject(aborted());
    this.reset();
    const snapshot = this.engine.getSnapshot();
    const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
    const geometry = createLayerGeometryIndex(page),
      layer = geometry.byId.get(layerId);
    const asset = layer?.assetId ? snapshot.project.assets[layer.assetId] : undefined;
    if (
      !layer ||
      layer.kind !== "video" ||
      layer.spatial ||
      layer.maskSource ||
      !asset ||
      !isVideoAsset(asset) ||
      geometry.isLocked(layer.id) ||
      !geometry.isVisible(layer.id)
    )
      return Promise.reject(Error("Select an unlocked 2D video for person background removal."));
    if (
      layer.mask &&
      !(layer.mask.assetId && isVideoAsset(snapshot.project.assets[layer.mask.assetId]!))
    )
      return Promise.reject(Error(i18n.t("pixelSelection:videoExistingMask")));
    this.target = { projectId: snapshot.project.id, pageId: snapshot.pageId, layer, asset };
    this.publish({
      layerId,
      targetName: layer.name,
      mediaKind: "video",
      preparingSource: true,
      width: asset.width,
      height: asset.height,
      points: [],
      busy: true,
      automatic: true,
      scanning: false,
      candidates: [],
      error: "",
      mode: "points",
    });
    const generation = this.generation,
      projectId = snapshot.project.id;
    const assertCurrent = () => {
      if (generation !== this.generation || !this.current()) throw aborted();
    };
    const task = (async () => {
      const original = await this.dependencies.store.loadMediaOriginal(projectId, asset, {
        signal: this.cancellation.signal,
      });
      assertCurrent();
      const poster = await this.client.videoPoster(original, asset);
      assertCurrent();
      const thumbnail = await readDataUrl(poster.blob);
      assertCurrent();
      const presented = this.presentation.wait(layerId);
      this.publish({ ...this.state!, thumbnail, preparingSource: false });
      if (presented) await presented;
      assertCurrent();
      const result = await this.client.videoBackground(original, asset, (progress) => {
        if (generation === this.generation && this.current())
          this.publish({ ...this.state!, videoProgress: progress });
      });
      assertCurrent();
      const metadata = await this.dependencies.probe(result.blob);
      assertCurrent();
      if (
        metadata.width !== result.width ||
        metadata.height !== result.height ||
        Math.abs(motionTimeToSeconds(metadata.duration) - motionTimeToSeconds(asset.duration)) >
          Math.max(0.1, 2 / asset.timeResolution)
      )
        throw Error("The generated video mask does not match the source duration or dimensions.");
      const matte: VideoAsset = {
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        firstTimestamp: metadata.firstTimestamp,
        timeResolution: metadata.timeResolution,
        orientation: metadata.orientation,
        kind: "video",
        id: crypto.randomUUID(),
        originalId: crypto.randomUUID(),
        contentRevision: crypto.randomUUID(),
        byteLength: result.blob.size,
        mime: result.blob.type,
        name: this.dependencies.maskName(),
      };
      await this.dependencies.flush?.();
      assertCurrent();
      if (!this.engine.reserveTransaction)
        throw Error("Atomic video mask persistence is unavailable.");
      const reservation = this.engine.reserveTransaction(
        [
          { type: "addAssets", assets: [matte] },
          {
            type: "updateLayers",
            ids: [layerId],
            patch: {
              mask: { assetId: matte.id, enabled: true, inverted: false, mode: "luminance" },
            },
          },
        ],
        { deferLock: true },
      );
      try {
        const prepared = await this.dependencies.store.prepareSaveCurrent(reservation.project, {
          mediaOriginals: [
            {
              originalId: matte.originalId,
              contentRevision: matte.contentRevision,
              blob: result.blob,
            },
          ],
        });
        assertCurrent();
        reservation.lock();
        this.committing = true;
        await this.dependencies.store.persistPrepared(prepared);
        reservation.commit();
        const committed = this.engine.getSnapshot();
        const updated = committed.project.pages
          .find((page) => page.id === committed.pageId)!
          .layers.find((item) => item.id === layerId)!;
        this.target = {
          projectId: committed.project.id,
          pageId: committed.pageId,
          layer: updated,
          asset,
        };
        if (generation === this.generation)
          this.publish({ ...this.state!, busy: false, completed: true });
      } finally {
        this.committing = false;
        reservation.cancel();
      }
    })().catch((error: unknown) => {
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
    });
    this.running = task;
    const settled = () => {
      if (this.running === task) this.running = null;
    };
    void task.then(settled, settled);
    return task;
  }
  reset = () => {
    this.generation++;
    this.presentation.cancel();
    this.cancellation.abort();
    this.cancellation = new AbortController();
    if (this.running) this.client.cancel();
    this.running = null;
    this.target = null;
    this.publish(null);
  };
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.stop();
    this.reset();
    this.listeners.clear();
  }
}
