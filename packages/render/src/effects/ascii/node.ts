import {
  clamp,
  dot,
  exp2,
  float,
  floor,
  fract,
  max,
  mix,
  pow,
  step,
  texture,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { Node } from "three/webgpu";
import { sampleEffect, type EffectNodeContext } from "../shared/context";

/** Tone, glyph selection and palette remain GPU operations over authored cells. */
export function asciiNode({ source, controls, getGlyphAtlas, bindGlyphAtlas }: EffectNodeContext) {
  const u = controls.parameters,
    modern = !!u.contrast;
  const position = uv(),
    sample = sampleEffect(source, controls, position);
  const pixel = position.mul(controls.logicalResolution);
  const size = vec2(controls.scale.mul(modern ? u.cellAspect! : 0.65), controls.scale);
  const cell = floor(pixel.div(size));
  const blocked = sampleEffect(
    source,
    controls,
    cell.add(0.5).mul(size).div(controls.logicalResolution),
  );
  const adjusted = modern
    ? pow(
        clamp(blocked.rgb.sub(0.5).mul(u.contrast!).add(0.5).add(u.brightness!), 0, 1),
        vec3(float(1).div(max(0.1, u.gamma!))),
      )
    : blocked.rgb;
  const brightness = clamp(dot(adjusted, vec3(0.2126, 0.7152, 0.0722)), 0, 0.9999);
  const tone = modern
    ? clamp(mix(brightness, brightness.oneMinus(), u.invert!), 0, 0.9999)
    : brightness;
  const binding = bindGlyphAtlas?.(),
    atlas = binding ? null : getGlyphAtlas();
  const count = binding?.count ?? float(16),
    shades = modern ? u.shades! : count;
  const glyph = modern
    ? floor(floor(tone.mul(shades)).mul(count.sub(1)).div(shades.sub(1)).add(0.0001))
    : floor(tone.mul(count));
  const local = modern
    ? fract(pixel.div(size)).sub(0.5).div(u.glyphScale!).add(0.5)
    : fract(pixel.div(size));
  const footprint = controls.pixelFootprint
    .div(size)
    .mul(0.25)
    .div(modern ? u.glyphScale! : 1);
  const inkAt = (offset: Node<"vec2">) => {
    const point = clamp(local.add(offset), vec2(0.5 / 16), vec2(1 - 0.5 / 16));
    const coordinate = vec2(glyph.add(point.x).div(count), point.y);
    return (binding ? binding.texture.sample(coordinate) : texture(atlas!, coordinate)).r;
  };
  const coverage = inkAt(footprint)
    .add(inkAt(footprint.negate()))
    .add(inkAt(vec2(footprint.x, footprint.y.negate())))
    .add(inkAt(vec2(footprint.x.negate(), footprint.y)))
    .mul(0.25);
  const ink = modern ? pow(coverage, exp2(float(0.5).sub(u.weight!).mul(3))) : coverage;
  const originalInk = mix(vec3(brightness), adjusted, controls.color);
  const color = modern
    ? mix(
        mix(
          originalInk.mul(controls.colors.foreground!),
          controls.colors.foreground!.mul(brightness),
          step(0.5, u.palette!),
        ),
        controls.colors.foreground!,
        step(1.5, u.palette!),
      )
    : originalInk;
  const treated = modern ? mix(controls.colors.background!, color, ink) : color.mul(ink);
  return vec4(mix(sample.rgb, treated, controls.amount), sample.a);
}
