import {
  createLayerGeometryIndex,
  isImageAsset,
  isVideoAsset,
  motionTimeToSeconds,
  type Asset,
  type EnginePort,
  type Effect,
  type ImageAsset,
  type VideoAsset,
} from "@musart/core";
import type { ProjectStore } from "../projects/storage";
import { readDataUrl } from "../assets/imports";
import type { DepthClient } from "./client";
interface Dependencies {
  store: Pick<ProjectStore, "loadMediaOriginal" | "prepareSaveCurrent" | "persistPrepared">;
  flush?: () => Promise<void>;
}
const dependencies = new WeakMap<EnginePort, Dependencies>();
export function registerDepthPreparation(engine: EnginePort, value: Dependencies) {
  dependencies.set(engine, value);
}
export async function depthVideoOriginal(
  engine: EnginePort,
  asset: VideoAsset,
  signal: AbortSignal,
) {
  const value = dependencies.get(engine);
  if (!value) throw Error("Video original storage is unavailable.");
  return value.store.loadMediaOriginal(engine.getSnapshot().project.id, asset, { signal });
}
export function canPrepareDepth(engine: EnginePort, layerId: string) {
  const snapshot = engine.getSnapshot(),
    page = snapshot.project.pages.find((page) => page.id === snapshot.pageId);
  if (!page) return false;
  const geometry = createLayerGeometryIndex(page),
    layer = geometry.byId.get(layerId);
  const asset = layer?.assetId ? snapshot.project.assets[layer.assetId] : undefined;
  return (
    !!layer &&
    !layer.spatial?.enabled &&
    geometry.isVisible(layerId) &&
    !geometry.isLocked(layerId) &&
    !!asset &&
    ((layer.kind === "image" && isImageAsset(asset)) ||
      (layer.kind === "video" && isVideoAsset(asset) && dependencies.has(engine)))
  );
}
/** Stale jobs cannot overwrite a changed layer. Asset admission/reference persist and undo together. */
export async function generateEffectDepth(
  engine: EnginePort,
  layerId: string,
  effect: Effect,
  client: DepthClient,
  signal: AbortSignal,
  progress: (value: number) => void,
  preparedOriginal?: Blob,
) {
  const before = engine.getSnapshot(),
    page = before.project.pages.find((page) => page.id === before.pageId)!;
  const layer = page.layers.find((layer) => layer.id === layerId);
  const source = layer?.assetId ? before.project.assets[layer.assetId] : undefined;
  if (!layer || !source || !canPrepareDepth(engine, layerId) || !layer.effects.includes(effect))
    throw Error("Select an unlocked image or video.");
  const current = () => {
    signal.throwIfAborted();
    const now = engine.getSnapshot();
    if (
      now.project.id !== before.project.id ||
      now.pageId !== before.pageId ||
      now.project.assets[source.id] !== source ||
      now.project.pages
        .find((page) => page.id === before.pageId)
        ?.layers.find((item) => item.id === layerId) !== layer ||
      !canPrepareDepth(engine, layerId)
    )
      throw new DOMException("Depth target changed.", "AbortError");
  };
  const stop = engine.subscribe(() => {
    try {
      current();
    } catch {
      client.cancel();
    }
  });
  const abort = () => client.cancel();
  signal.addEventListener("abort", abort, { once: true });
  let committing = false;
  try {
    const dep = dependencies.get(engine);
    const original =
      preparedOriginal ??
      (isVideoAsset(source)
        ? await dep!.store.loadMediaOriginal(before.project.id, source, { signal })
        : await fetch((source as ImageAsset).dataUrl, { signal }).then((response) => {
            if (!response.ok) throw Error("Cannot load source image.");
            return response.blob();
          }));
    current();
    if (!original) throw Error("The immutable source original is missing.");
    const result = await client.generate(
      original,
      isVideoAsset(source) ? source : undefined,
      progress,
    );
    current();
    let asset: Asset;
    if (isVideoAsset(source)) {
      const { probeVideoOriginal } = await import("@musart/render");
      const metadata = await probeVideoOriginal(result.blob, { signal });
      if (
        metadata.width !== result.width ||
        metadata.height !== result.height ||
        Math.abs(motionTimeToSeconds(metadata.duration) - motionTimeToSeconds(source.duration)) >
          0.1
      )
        throw Error("Depth video does not match its source.");
      asset = {
        ...metadata,
        kind: "video",
        id: crypto.randomUUID(),
        originalId: crypto.randomUUID(),
        contentRevision: crypto.randomUUID(),
        byteLength: result.blob.size,
        mime: result.blob.type,
        name: "Depth Anything V3",
      } satisfies VideoAsset;
    } else
      asset = {
        id: crypto.randomUUID(),
        name: "Depth Anything V3",
        mime: "image/png",
        width: result.width,
        height: result.height,
        dataUrl: await readDataUrl(result.blob),
      };
    await dep?.flush?.();
    current();
    const effects = layer.effects.map((item) =>
      item.id === effect.id ? { ...item, inputs: { ...item.inputs, depth: asset.id } } : item,
    );
    const commands = [
      { type: "addAssets" as const, assets: [asset] },
      { type: "updateLayers" as const, ids: [layerId], patch: { effects } },
    ];
    if (isVideoAsset(asset)) {
      if (!dep || !engine.reserveTransaction)
        throw Error("Atomic depth video persistence is unavailable.");
      const reservation = engine.reserveTransaction(commands, { deferLock: true });
      try {
        const prepared = await dep.store.prepareSaveCurrent(reservation.project, {
          mediaOriginals: [
            {
              originalId: asset.originalId,
              contentRevision: asset.contentRevision,
              blob: result.blob,
            },
          ],
        });
        current();
        reservation.lock();
        stop();
        committing = true;
        await dep.store.persistPrepared(prepared);
        reservation.commit();
      } finally {
        reservation.cancel();
      }
    } else {
      stop();
      committing = true;
      engine.transaction(commands);
    }
  } finally {
    stop();
    signal.removeEventListener("abort", abort);
    if (!committing) client.cancel();
  }
}
