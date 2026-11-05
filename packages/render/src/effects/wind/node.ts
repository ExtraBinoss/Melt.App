import type { Node } from "three/webgpu";
import {
  clamp,
  cos,
  dot,
  float,
  floor,
  fract,
  max,
  mix,
  sin,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { noise2d } from "../shared/noise";

/** Fixed twelve-tap, alpha-weighted directional streaks with seeded gust bands. */
export function windNode({ source, controls }: EffectNodeContext) {
  const u = controls.parameters,
    p = uv(),
    original = sampleEffect(source, controls, p),
    size = controls.logicalResolution,
    origin = vec2(
      controls.contentOrigin.x,
      size.y.sub(controls.contentOrigin.y).sub(controls.contentResolution.y),
    ),
    delta = vec2(p.x, p.y.oneMinus())
      .mul(size)
      .sub(origin)
      .sub(vec2(u.centerX!, u.centerY!).mul(controls.contentResolution)),
    angle = u.angle!.mul(Math.PI / 180),
    direction = vec2(cos(angle), sin(angle)),
    across = dot(delta, vec2(direction.y.negate(), direction.x)),
    along = dot(delta, direction),
    band = floor(across.div(max(1, u.bandSize!))),
    random = noise2d(vec2(band.add(1048576), 17), controls.randomSeedUint),
    clock = fract(controls.time.mul(u.speed!)),
    phase = fract(fract(along.div(512)).sub(clock).add(u.phase!.div(360)).add(random)),
    gust = sin(phase.mul(2 * Math.PI))
      .mul(0.5)
      .add(0.5),
    stretch = mix(1, mix(0.15, 1, random), u.variation!)
      .mul(mix(1, mix(0.2, 1, gust), u.gust!))
      .mul(u.length!),
    offset = vec2(direction.x, direction.y.negate()).mul(stretch).div(size);
  // Unrolled, finite sampling stays portable to both Three WebGPU and WebGL2.
  let total: Node<"float"> = float(0);
  let color: Node<"vec3"> = vec3(0);
  for (let index = 0; index < 12; index += 1) {
    const t = index / 11,
      weight = 1 - t * 0.65,
      sample = sampleEffect(source, controls, clamp(p.sub(offset.mul(t)), 0, 1)),
      coverage = sample.a.mul(weight);
    total = total.add(coverage);
    color = color.add(sample.rgb.mul(coverage));
  }
  const streak = color.div(max(total, 0.000001)),
    treated = mix(streak, original.rgb, u.sourceMix!);
  return vec4(mix(original.rgb, treated, controls.amount), original.a);
}
