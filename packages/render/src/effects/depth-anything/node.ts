import { clamp, cos, float, mix, sin, uv, vec2, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
/** Bounded inverse warp. Native camera depth and AI relative depth remain separate capabilities. */
export function depthAnythingNode({ source, controls, bindImageInput }: EffectNodeContext) {
  const map = bindImageInput?.("depth"),
    p = uv(),
    u = controls.parameters;
  const original = sampleEffect(source, controls, p);
  if (!map) return original;
  const content = p
    .mul(controls.logicalResolution)
    .sub(controls.contentOrigin)
    .div(controls.contentResolution);
  const angle = u.angle!.mul(Math.PI / 180);
  const direction = vec2(cos(angle), sin(angle)).mul(u.strength!).div(controls.logicalResolution);
  const base = p.sub(0.5).div(u.zoom!).add(0.5);
  let at = base;
  // Four fixed-point steps reduce foreground stretching while keeping a fixed GPU cost.
  for (let step = 0; step < 4; step++) {
    const q = at
      .mul(controls.logicalResolution)
      .sub(controls.contentOrigin)
      .div(controls.contentResolution);
    const depth = map.texture.sample(
      vec2(
        clamp(q.x, 0.001, 0.999),
        mix(clamp(q.y, 0.001, 0.999), clamp(q.y, 0.001, 0.999).oneMinus(), map.flipY ?? float(0)),
      ),
    ).r;
    at = base.add(direction.mul(depth.sub(u.focus!)));
  }
  const shifted = sampleEffect(source, controls, clamp(at, 0.001, 0.999));
  const depth = map.texture.sample(
    vec2(
      clamp(content.x, 0.001, 0.999),
      mix(
        clamp(content.y, 0.001, 0.999),
        clamp(content.y, 0.001, 0.999).oneMinus(),
        map.flipY ?? float(0),
      ),
    ),
  ).r;
  const treated = mix(shifted, vec4(depth, depth, depth, original.a), float(u.view!.equal(1)));
  return mix(original, treated, controls.amount.mul(map.enabled));
}
