import type { Composition, Effect } from "@musart/core";
import type { RenderTarget } from "three/webgpu";
import type { EffectAuxiliaryInputs } from "../effects/shared/context";
import type { GpuResourceCache } from "../cache/GpuResourceCache";
import { hasEffectTreatment } from "../effects/shared/active";
import type { EffectResources } from "./effect-resources";
import type { GpuPasses } from "./passes";
import type { FrameTexture } from "./types";
import { resolveTrailMode } from "@musart/core";

/** Prepare every authored stack through the same bounded operator, including future enabled keys. */
export async function prepareEffectStacks(
  page: Composition,
  effects: EffectResources,
  cache: GpuResourceCache,
  target: RenderTarget,
  canContinue: () => boolean,
): Promise<void> {
  for (const owner of [page, ...page.layers]) {
    const stack = owner.effects ?? [];
    if (!stack.length) continue;
    const prepared = stack.map((effect) =>
      effect.enabled ? effect : { ...effect, enabled: true },
    );
    cache.ensureCapacity("shared-effects", effects.projectedBytes(1, 1, prepared));
    try {
      await effects.prepare(stack, target, owner.width, owner.height, canContinue);
    } finally {
      cache.synchronize("shared-effects");
    }
  }
}

/** The artboard is a final isolated surface: effects see all blended paint and clip to its gate. */
export function finishCompositionEffects(
  page: Composition,
  input: FrameTexture,
  context: {
    passes: GpuPasses;
    effects: EffectResources;
    cache: GpuResourceCache;
    depth?: EffectAuxiliaryInputs["depth"];
    depthForEffect?: EffectAuxiliaryInputs["depthForEffect"];
    history?: EffectAuxiliaryInputs["history"];
    target(role: string, width: number, height: number): RenderTarget;
  },
): FrameTexture {
  const stack: Effect[] = (page.effects ?? [])
    .filter(hasEffectTreatment)
    .map((effect) => resolveTrailMode(effect, page));
  if (!stack.length) return input;
  const { width, height } = input;
  const straight = context.target("composition-straight", width, height);
  context.passes.copyTo(input, straight, input.premultiplied);
  const output = context.target("composition-effects", width, height);
  context.cache.ensureCapacity(
    "shared-effects",
    context.effects.projectedBytes(width, height, stack),
  );
  let texture;
  try {
    const viewport = input.bounds;
    texture = context.effects.apply(
      straight.texture,
      width,
      height,
      stack,
      output,
      {
        width: viewport?.width ?? page.width,
        height: viewport?.height ?? page.height,
        ...(viewport
          ? { content: { x: -viewport.x, y: -viewport.y, width: page.width, height: page.height } }
          : {}),
      },
      {
        scope: "composition",
        depth: context.depth,
        depthForEffect: context.depthForEffect,
        history: context.history,
      },
    );
  } finally {
    context.cache.synchronize("shared-effects");
  }
  const final = context.target("composition-premultiplied", width, height);
  context.passes.copyTo({ texture, width, height, premultiplied: false }, final, false, true);
  return { texture: final.texture, width, height, premultiplied: true };
}
