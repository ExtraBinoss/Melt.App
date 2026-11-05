import type { Node } from "three/webgpu";
import {
  clamp,
  cos,
  dot,
  float,
  floor,
  fract,
  length,
  max,
  mix,
  sin,
  smoothstep,
  sqrt,
  uint,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { noise2d } from "../shared/noise";

/** Three bounded ink passes over paper; source alpha is kept independently of ink coverage. */
export function risographNode({ source, controls }: EffectNodeContext) {
  const u = controls.parameters,
    position = uv(),
    original = sampleEffect(source, controls, position),
    dimensions = controls.logicalResolution,
    pixel = vec2(position.x, position.y.oneMinus()).mul(dimensions),
    origin = vec2(
      controls.contentOrigin.x,
      dimensions.y.sub(controls.contentOrigin.y).sub(controls.contentResolution.y),
    ),
    relative = pixel.sub(origin).sub(vec2(u.centerX!, u.centerY!).mul(controls.contentResolution)),
    angle = u.angle!.mul(Math.PI / 180),
    seed = controls.randomSeedUint;
  const rotate = (p: Node<"vec2">, a: Node<"float">) =>
    vec2(cos(a).mul(p.x).sub(sin(a).mul(p.y)), sin(a).mul(p.x).add(cos(a).mul(p.y)));
  const ink = (index: number) => {
    // Integer offsets retain the complete portable seed, including adjacent large seeds.
    const inkSeed = seed.add(uint(index * 1013)),
      offset = rotate(
        vec2(noise2d(vec2(index, 17), inkSeed), noise2d(vec2(index, 89), inkSeed))
          .mul(2)
          .sub(1),
        angle,
      )
        .mul(u.misregistration!)
        .mul(Math.SQRT1_2),
      coord = position.add(vec2(offset.x, offset.y.negate()).div(dimensions)),
      shifted = sampleEffect(source, controls, clamp(coord, 0, 1)),
      // Transparent samples cannot contribute hidden RGB at silhouette boundaries.
      color = mix(original.rgb, shifted.rgb, shifted.a),
      darkness = dot(color, vec3(0.2126, 0.7152, 0.0722)).oneMinus(),
      warm = clamp(color.r.sub(color.b), -1, 1),
      duo =
        index === 0
          ? darkness.mul(0.85).sub(warm.mul(0.65))
          : darkness.mul(0.8).add(warm.mul(0.65)),
      tri =
        index === 0 ? color.r.oneMinus() : index === 1 ? color.g.oneMinus() : color.b.oneMinus(),
      separation = mix(duo, tri, u.palette!),
      coverage = clamp(separation.sub(0.5).mul(u.contrast!).add(0.5).mul(u.inkDensity!), 0, 1),
      screen = rotate(relative.sub(offset), angle.add((index * Math.PI) / 3)).div(u.dotSize!),
      // Keep integer-hash inputs nonnegative on WGSL and GLSL alike.
      paperPosition = relative.sub(offset).add(dimensions).add(64),
      grain = noise2d(floor(paperPosition), inkSeed),
      mottling = noise2d(floor(paperPosition.div(u.dotSize!)), inkSeed)
        .sub(0.5)
        .mul(u.grain!)
        .mul(0.4),
      density = clamp(coverage.add(mottling), 0, 1),
      radius = sqrt(density.div(Math.PI)),
      // Authored one-pixel edge smoothing stays independent of raster/editor density.
      feather = float(0.5).div(u.dotSize!),
      dots = smoothstep(
        radius.sub(feather),
        radius.add(feather),
        length(fract(screen).sub(0.5)),
      ).oneMinus(),
      // Fill the corners continuously at full ink density, retaining exact paper at zero.
      screened = mix(dots, density, smoothstep(0.7, 1, density)),
      deposit = clamp(screened.sub(grain.mul(u.grain!).mul(0.35)), 0, 1).mul(
        smoothstep(0, 0.02, coverage),
      );
    return index === 2 ? deposit.mul(u.palette!) : deposit;
  };
  const fiber = noise2d(
      floor(relative.add(dimensions).add(64).div(vec2(1, 7))),
      seed.add(uint(7919)),
    ).sub(0.5),
    paper = clamp(controls.colors.paperColor!.add(vec3(fiber.mul(u.paperTexture!))), 0, 1),
    printed = paper
      .mul(mix(vec3(1), controls.colors.inkA!, ink(0)))
      .mul(mix(vec3(1), controls.colors.inkB!, ink(1)))
      .mul(mix(vec3(1), controls.colors.inkC!, ink(2)));
  return vec4(mix(original.rgb, max(printed, 0), controls.amount), original.a);
}
