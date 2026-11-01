import type { Composition } from "@musart/core";
import type { RenderTarget } from "three/webgpu";
import type { GpuResourceCache } from "../cache/GpuResourceCache";
import type { EffectResources } from "./effect-resources";
/** Preparation and hard-budget admission stay shared between normal and temporal source renders. */
export async function prepareLayerEffects(
  page: Composition,
  effects: EffectResources,
  cache: GpuResourceCache,
  target: RenderTarget,
  canPrepare: () => boolean,
) {
  for (const layer of page.layers) {
    if (!layer.effects.length) continue;
    const prepared = layer.effects.map((effect) =>
      effect.enabled ? effect : { ...effect, enabled: true },
    );
    cache.ensureCapacity("shared-effects", effects.projectedBytes(1, 1, prepared));
    try {
      await effects.prepare(layer.effects, target, layer.width, layer.height, canPrepare);
    } finally {
      cache.synchronize("shared-effects");
    }
  }
}
