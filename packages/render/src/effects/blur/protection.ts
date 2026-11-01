import type { Node } from "three/webgpu";
import { length, max, mix, smoothstep, uv, vec2, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";

/** Center in the original authored rectangle, independent of the padded transport plane. */
export function blurCenter({ controls }: EffectNodeContext) {
  const u = controls.parameters;
  return controls.contentOrigin.add(
    vec2(u.centerX!, u.centerY!.oneMinus()).mul(controls.contentResolution),
  );
}

/** Restore the pre-effect input after every pass; never blend against an intermediate. */
export function protectBlur(context: EffectNodeContext, blurred: Node<"vec4">) {
  const { controls } = context,
    u = controls.parameters;
  const original = sampleEffect(
    context.backdrop!,
    { ...controls, sourceFlipY: controls.backdropFlipY },
    uv(),
  );
  const distance = length(uv().mul(controls.logicalResolution).sub(blurCenter(context)));
  const feathered = smoothstep(
    u.protectedRadius!,
    u.protectedRadius!.add(max(u.feather!, 0.0001)),
    distance,
  );
  const sharp = distance.lessThanEqual(u.protectedRadius!).select(0, 1);
  const falloff = u.feather!.greaterThan(0).select(feathered, sharp);
  const weight = mix(1, falloff, u.protect!);
  const alpha = mix(original.a, blurred.a, weight);
  const rgb = mix(original.rgb.mul(original.a), blurred.rgb.mul(blurred.a), weight);
  return controls.amount
    .equal(0)
    .or(weight.equal(0))
    .select(original, vec4(rgb.div(max(alpha, 0.000001)), alpha));
}
