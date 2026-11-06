import {
  addMotionTime,
  subtractMotionTime,
  isVideoAsset,
  type Asset,
  type Layer,
} from "@musart/core";
import type { RenderOptions } from "../compositing/types";
import { hasEffectTreatment } from "../effects/shared/active";
/** Prepared AI depth clips borrow the owner's source clock, including trims/reverse/export seeks. */
export function prepareVideoEffectInputs(
  layers: readonly Layer[],
  assets: Record<string, Asset>,
  options: RenderOptions,
) {
  const ids = new Map<string, string>(),
    extra: Layer[] = [];
  const requests = [...(options.motionFrame?.mediaRequests ?? [])];
  for (const layer of layers)
    for (const effect of layer.effects.filter(hasEffectTreatment)) {
      for (const assetId of Object.values(effect.inputs ?? {})) {
        const asset = assets[assetId];
        if (!asset || !isVideoAsset(asset)) continue;
        const owner = layer.assetId ? assets[layer.assetId] : undefined;
        if (layer.kind !== "video" || !owner || !isVideoAsset(owner))
          throw Error("Video effect inputs require a video owner.");
        const id = JSON.stringify(["effect-video", layer.id, effect.id, assetId]);
        if (layers.some((item) => item.id === id)) throw Error("Video effect identity collision.");
        ids.set(JSON.stringify([effect.id, assetId]), id);
        extra.push({ ...layer, id, assetId, effects: [], mask: null, opacity: 1 });
        const request = options.motionFrame?.mediaRequests.find(
          (item) => item.layerId === layer.id,
        );
        if (request)
          requests.push({
            ...request,
            layerId: id,
            assetId,
            sourceTime: addMotionTime(
              asset.firstTimestamp,
              subtractMotionTime(request.sourceTime, owner.firstTimestamp),
            ),
            mute: true,
            volume: 0,
          });
      }
    }
  return {
    ids,
    layers: [...layers, ...extra],
    options: options.motionFrame
      ? { ...options, motionFrame: { ...options.motionFrame, mediaRequests: requests } }
      : options,
  };
}
