import { useLayoutEffect } from "react";
import type { Composition, Layer, Point } from "@musart/core";
import type { SceneController } from "../../session/scene-controller";
import { SourceAlphaCache } from "./alpha-cache";
import { prepareVectorHit, primitiveContentHit, vectorContentHit } from "./vector-hit";

type ContentHit = (layer: Layer, point: Point) => boolean;
const sources = new WeakMap<Composition, ContentHit>();
const listeners = new WeakMap<SceneController, Set<() => void>>();
export function subscribePreparedPicking(
  controller: SceneController,
  listener: () => void,
): () => void {
  let set = listeners.get(controller);
  if (!set) listeners.set(controller, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}
/** Register only while its immutable frame is current; disposal cannot erase a newer owner. */
export function registerPreparedContent(page: Composition, hit: ContentHit): () => void {
  sources.set(page, hit);
  return () => {
    if (sources.get(page) === hit) sources.delete(page);
  };
}
export function preparedContentHit(page: Composition, layer: Layer, point: Point): boolean {
  // Deforming effects have their own source geometry: never claim GPU-effect alpha parity.
  if (layer.effects.some((effect) => effect.enabled && effect.type === "morph")) return true;
  return sources.get(page)?.(layer, point) ?? primitiveContentHit(layer, point);
}
/** Scene preparation is independent of pointer input and React presentation renders. */
export function usePreparedPicking(controller: SceneController) {
  useLayoutEffect(() => {
    const notify = () => {
      for (const listener of listeners.get(controller) ?? []) listener();
    };
    const cache = new SourceAlphaCache(notify);
    let preparation: ReturnType<typeof setTimeout> | undefined;
    const canvas = typeof OffscreenCanvas === "undefined" ? null : new OffscreenCanvas(1, 1);
    const context = canvas?.getContext("2d") ?? null;
    let page: Composition | undefined;
    let previousAssets: unknown;
    let release: (() => void) | undefined;
    function prepare() {
      const frame = controller.read();
      if (frame.page === page && previousAssets === frame.assets) return;
      previousAssets = frame.assets;
      release?.();
      page = frame.page;
      const assets = frame.assets;
      // Decode/compile outside the input task. Coalesce rapid preview frames and use
      // only the newest source set; pointer input reads the already retained planes.
      if (preparation === undefined)
        preparation = setTimeout(() => {
          preparation = undefined;
          const current = controller.read();
          const active = current.page.layers.flatMap((layer) => {
            prepareVectorHit(layer);
            const asset =
              layer.kind === "image" && layer.assetId ? current.assets[layer.assetId] : undefined;
            return asset ? [asset] : [];
          });
          cache.update(active);
          notify();
        }, 0);
      release = registerPreparedContent(page, (layer, point) => {
        if (layer.vector && context) return vectorContentHit(context, layer, point);
        if (layer.kind === "image" && layer.assetId) {
          const asset = assets[layer.assetId];
          // Video/source clocks remain renderer-owned: a poster is never valid frame alpha.
          if (asset && (!asset.kind || asset.kind === "image"))
            return cache.hit(asset.dataUrl, point.x / layer.width, point.y / layer.height);
        }
        return primitiveContentHit(layer, point);
      });
    }
    prepare();
    const stop = controller.subscribe(prepare);
    return () => {
      stop();
      release?.();
      clearTimeout(preparation);
      cache.dispose();
      if (canvas) canvas.width = canvas.height = 1;
    };
  }, [controller]);
}
