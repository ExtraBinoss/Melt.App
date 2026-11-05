import { length, max, mix, smoothstep, uv, vec2, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
/** Soft coverage on the GPU; never modifies hidden RGB or reads source pixels into JavaScript. */
export function featherNode({ source, controls }: EffectNodeContext) {
  const point = uv(),
    original = sampleEffect(source, controls, point),
    u = controls.parameters;
  const distance = length(vec2(point.x, point.y.oneMinus()).sub(vec2(u.centerX!, u.centerY!)));
  const feather = smoothstep(max(0, u.radius!.sub(u.softness!)), u.radius!, distance).oneMinus();
  return vec4(original.rgb, original.a.mul(mix(1, feather, controls.amount)));
}
