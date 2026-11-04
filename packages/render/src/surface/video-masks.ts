import {
  addMotionTime,
  subtractMotionTime,
  isVideoAsset,
  type Asset,
  type Layer,
} from "@musart/core";
import type { RenderOptions } from "../compositing/types";

/** Source-local video mattes follow their owner's source clock, including trims and occurrences. */
export function prepareVideoMasks(
  layers: readonly Layer[],
  assets: Record<string, Asset>,
  options: RenderOptions,
) {
  const ids = new Map<string, string>();
  const masks: Layer[] = [];
  const requests = [...(options.motionFrame?.mediaRequests ?? [])];
  for (const layer of layers) {
    const mask = layer.mask?.enabled && layer.mask.assetId ? assets[layer.mask.assetId] : undefined;
    if (!mask || !isVideoAsset(mask)) continue;
    const owner = layer.assetId ? assets[layer.assetId] : undefined;
    if (layer.kind !== "video" || !owner || !isVideoAsset(owner))
      throw Error("A source-clock video mask requires a video owner.");
    const id = JSON.stringify(["video-mask", layer.id]);
    if (layers.some((item) => item.id === id)) throw Error("Video mask source identity collision.");
    ids.set(layer.id, id);
    masks.push({ ...layer, id, assetId: mask.id, effects: [], mask: null, opacity: 1 });
    const request = options.motionFrame?.mediaRequests.find((item) => item.layerId === layer.id);
    if (request)
      requests.push({
        ...request,
        layerId: id,
        assetId: mask.id,
        sourceTime: addMotionTime(
          mask.firstTimestamp,
          subtractMotionTime(request.sourceTime, owner.firstTimestamp),
        ),
        mute: true,
        volume: 0,
      });
  }
  return {
    ids,
    layers: [...layers, ...masks],
    options: options.motionFrame
      ? { ...options, motionFrame: { ...options.motionFrame, mediaRequests: requests } }
      : options,
  };
}
