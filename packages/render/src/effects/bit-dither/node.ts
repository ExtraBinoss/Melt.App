import { authoredPixelDown, transportUv } from "../shared/coordinates";
import {
  Fn,
  If,
  clamp,
  dot,
  float,
  floor,
  interleavedGradientNoise,
  max,
  mix,
  pow,
  step,
  uint,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { bayerThreshold } from "./patterns";
import type { Node } from "three/webgpu";

/** Authored-cell thresholding, original coverage, no raster/time-dependent noise. */
export function bitDitherColor(
  { source, controls }: EffectNodeContext,
  overrides: { method?: Node<"float">; sourceColor?: Node<"float"> } = {},
) {
  const u = controls.parameters,
    method = overrides.method ?? u.method!,
    sourceColor = overrides.sourceColor ?? u.sourceColor!,
    position = uv();
  const binary = Fn(() => {
    // Shared operands must be assigned before any algorithm branch: Three's
    // expression cache must not leave sibling branches reading an unset variable.
    const size = max(1, controls.scale).toVar(),
      cell = floor(authoredPixelDown(controls, position).div(size)).toVar(),
      center = cell.add(0.5).mul(size).div(controls.contentResolution).toVar(),
      blocked = sampleEffect(
        source,
        controls,
        transportUv(controls, vec2(center.x, center.y.oneMinus())),
      ).toVar(),
      seed = uint(controls.randomSeedUint),
      foldedSeed = seed.bitXor(seed.shiftRight(uint(20))),
      point = cell
        .add(
          vec2(
            float(foldedSeed.bitAnd(uint(1023))),
            float(foldedSeed.shiftRight(uint(10)).bitAnd(uint(1023))),
          ),
        )
        .toVar(),
      threshold = float(0.5).toVar();
    If(method.greaterThan(3.5), () => {
      threshold.assign(interleavedGradientNoise(point));
    })
      .ElseIf(method.greaterThan(2.5), () => {
        threshold.assign(bayerThreshold(point, 8));
      })
      .ElseIf(method.greaterThan(1.5), () => {
        threshold.assign(bayerThreshold(point, 4));
      })
      .ElseIf(method.greaterThan(0.5), () => {
        threshold.assign(bayerThreshold(point, 2));
      });
    const luminance = dot(blocked.rgb, vec3(0.2126, 0.7152, 0.0722)),
      channel = mix(vec3(luminance), blocked.rgb, sourceColor),
      tone = pow(
        clamp(channel.sub(0.5).mul(u.contrast!).add(0.5), 0, 1),
        float(1).div(max(0.1, u.gamma!)),
      ),
      bit = step(u.threshold!, tone.add(float(0.5).sub(threshold).mul(u.strength!)));
    return mix(bit, bit.oneMinus(), u.invert!);
  })();
  const palette = mix(controls.colors.foreground!, controls.colors.background!, binary),
    color = mix(palette, binary, sourceColor);
  return color;
}

export function bitDitherNode(context: EffectNodeContext) {
  const original = sampleEffect(context.source, context.controls, uv());
  return vec4(mix(original.rgb, bitDitherColor(context), context.controls.amount), original.a);
}
