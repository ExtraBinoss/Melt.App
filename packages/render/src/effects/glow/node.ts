import type { Node } from "three/webgpu";
import { Fn, clamp, dot, float, max, mix, smoothstep, uv, vec2, vec3, vec4 } from "three/tsl";
import type { EffectNodeContext } from "../shared/context";
import { samplePremultiplied } from "../shared/premultiplied-sample";
import { GLOW_PARTITIONS, GLOW_PREFILTER_TAPS, GLOW_TAPS } from "./kernel";

export function straightColor(value: Node<"vec4">) {
  return vec4(value.rgb.div(max(value.a, 0.000001)), value.a);
}

/** Thresholding uses visible RGB, so transparent hidden colors never seed bloom. */
export function glowBrightPass(context: EffectNodeContext, position: Node<"vec2">) {
  const u = context.controls.parameters,
    premultiplied = samplePremultiplied(context, position),
    source = straightColor(premultiplied),
    brightness = max(dot(source.rgb, vec3(0.2126, 0.7152, 0.0722)), 0),
    knee = max(u.knee!, 0.00001),
    soft = clamp(brightness.sub(u.threshold!).add(knee), 0, knee.mul(2)),
    shoulder = soft.mul(soft).div(knee.mul(4)),
    contribution = clamp(
      max(brightness.sub(u.threshold!), shoulder).div(max(brightness, 0.00001)),
      0,
      1,
    );
  // Coverage follows emitted light: opaque black must never make a black halo.
  const emission = premultiplied.rgb.mul(contribution);
  return vec4(emission, clamp(max(max(emission.r, emission.g), emission.b), 0, 1));
}

/** Intermediate targets hold straight RGBA; all filtering accumulates premultiplied values. */
export function glowPartitionRadius(context: EffectNodeContext, partition: number) {
  const definition = GLOW_PARTITIONS[partition]!;
  return clamp(context.controls.parameters.radius!.sub(definition.start), 0, definition.capacity);
}

export function glowPartitionMixture(context: EffectNodeContext, partition: number) {
  const definition = GLOW_PARTITIONS[partition]!,
    end = definition.start + definition.capacity;
  // Crossfade a completed core to a prefilter as the next halo grows: radius edits stay continuous.
  return smoothstep(
    end,
    end + definition.capacity * 0.5,
    context.controls.parameters.radius!,
  ).oneMinus();
}

export function glowFinalRadius(context: EffectNodeContext) {
  const radius = context.controls.parameters.radius!;
  return radius
    .lessThanEqual(4)
    .select(
      radius,
      radius
        .lessThanEqual(16)
        .select(radius.sub(4), radius.lessThanEqual(64).select(radius.sub(16), radius.sub(64))),
    );
}

export function glowAxis(
  context: EffectNodeContext,
  axis: "x" | "y",
  brightPass: boolean,
  radius = glowFinalRadius(context),
  multiscale: Node<"float"> = float(1),
) {
  return Fn(() => {
    const direction = axis === "x" ? vec2(1, 0) : vec2(0, 1),
      step = direction.mul(radius).div(context.controls.logicalResolution),
      total = vec4(0).toVar();
    for (const [index, tap] of GLOW_TAPS.entries()) {
      const position = uv().add(step.mul(tap.offset));
      const sample = brightPass
        ? glowBrightPass(context, position)
        : samplePremultiplied(context, position);
      total.addAssign(sample.mul(mix(GLOW_PREFILTER_TAPS[index]!.weight, tap.weight, multiscale)));
    }
    return straightColor(total);
  })();
}

export function originalContext(context: EffectNodeContext): EffectNodeContext {
  if (!context.backdrop) throw new Error("Glow requires its preserved original input.");
  return {
    ...context,
    source: context.backdrop,
    controls: { ...context.controls, sourceFlipY: context.controls.backdropFlipY },
  };
}

/** Additive light with coverage union, then amount interpolation in premultiplied space. */
export function finishGlow(context: EffectNodeContext, soft: Node<"vec4">, base: Node<"vec4">) {
  const u = context.controls.parameters,
    original = samplePremultiplied(originalContext(context), uv()),
    emission = soft.rgb.mul(soft.a).mul(context.controls.colors.tint!).mul(u.intensity!),
    coverage = clamp(max(max(emission.r, emission.g), emission.b), 0, 1),
    baseAlpha = base.a.mul(u.glowOnly!.oneMinus()),
    alpha = baseAlpha.add(coverage.mul(baseAlpha.oneMinus())),
    radiance = base.rgb.mul(baseAlpha).add(emission),
    combined = mix(original, vec4(radiance, alpha), context.controls.amount);
  return straightColor(combined);
}

export function glowNode(context: EffectNodeContext) {
  const original = straightColor(samplePremultiplied(originalContext(context), uv()));
  return finishGlow(context, glowAxis(context, "y", false), original);
}
