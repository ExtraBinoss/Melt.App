import { clamp, cos, length, max, mix, pow, sin, uv, vec2, vec3, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";

/** Lens-like radial separation or a directional RGB registration offset. */
export function chromaticAberrationNode({ source, controls }: EffectNodeContext) {
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
    distance = length(delta),
    angle = u.angle!.mul(Math.PI / 180),
    c = cos(angle),
    s = sin(angle),
    radial = delta.div(max(distance, 0.0001)),
    rotated = vec2(radial.x.mul(c).sub(radial.y.mul(s)), radial.x.mul(s).add(radial.y.mul(c))),
    direction = mix(rotated, vec2(c, s), u.mode!),
    falloff = pow(clamp(distance.div(max(1, u.radius!)), 0.00001, 1), u.falloff!),
    shift = direction.mul(u.separation!).mul(falloff).div(size),
    offset = vec2(shift.x, shift.y.negate()),
    red = sampleEffect(source, controls, clamp(p.add(offset), 0, 1)),
    blue = sampleEffect(source, controls, clamp(p.sub(offset), 0, 1));
  // Transparent displaced samples cannot leak hidden RGB or introduce black fringes.
  const color = vec3(mix(original.r, red.r, red.a), original.g, mix(original.b, blue.b, blue.a));
  return vec4(mix(original.rgb, color, controls.amount), original.a);
}
