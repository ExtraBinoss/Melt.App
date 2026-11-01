import { float, clamp, cos, dot, fract, mix, sin, uv, vec2, vec3, vec4 } from "three/tsl";
import { max } from "three/tsl";
import { mixEffectCoverage } from "../shared/compositing/node";
import { samplePremultiplied } from "../shared/premultiplied-sample";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
/** Secondary image inputs share the same GPU source/cache ownership as ordinary layer images. */
export function displaceNode(context: EffectNodeContext) {
  const { source, controls, bindImageInput } = context;
  const u = controls.parameters,
    p = uv(),
    original = sampleEffect(source, controls, p);
  const map = bindImageInput?.("map");
  const a = u.rotation!.mul(Math.PI / 180),
    q = p
      .mul(controls.logicalResolution)
      .sub(controls.contentOrigin)
      .div(controls.contentResolution)
      .sub(0.5)
      .mul(u.mapScale!);
  let at = vec2(q.x.mul(cos(a)).sub(q.y.mul(sin(a))), q.x.mul(sin(a)).add(q.y.mul(cos(a))))
    .add(0.5)
    .add(vec2(u.offsetX!, u.offsetY!))
    .add(controls.time.mul(u.speed!));
  const raw = at;
  at = mix(fract(at), fract(at.mul(0.5)).mul(2).sub(1).abs().oneMinus(), float(u.wrap!.equal(1)));
  at = mix(at, clamp(raw, 0.0001, 0.9999), float(u.wrap!.equal(2)));
  // The procedural fallback is neutral at zero strength and remains seek-deterministic.
  const noise = vec4(
    sin(at.x.mul(18).add(sin(at.y.mul(12))))
      .mul(0.5)
      .add(0.5),
    cos(at.y.mul(19).add(sin(at.x.mul(10))))
      .mul(0.5)
      .add(0.5),
    0.5,
    1,
  );
  const field = map ? mix(noise, map.texture.sample(at), map.enabled) : noise;
  const channel = (id: typeof u.channelX) =>
    mix(
      mix(field.r, field.g, float(id!.equal(1))),
      mix(field.b, dot(field.rgb, vec3(0.299, 0.587, 0.114)), float(id!.equal(3))),
      float(id!.greaterThanEqual(2)),
    );
  const displacement = vec2(channel(u.channelX), channel(u.channelY))
    .sub(u.midpoint!)
    .mul(u.contrast!)
    .mul(vec2(u.strengthX!, u.strengthY!))
    .div(controls.logicalResolution);
  const atSource = p.add(vec2(displacement.x, displacement.y.negate()));
  const shifted = samplePremultiplied(context, atSource),
    split = displacement.mul(u.dispersion!).mul(0.2);
  const red = samplePremultiplied(context, atSource.add(split)),
    blue = samplePremultiplied(context, atSource.sub(split));
  const coverage = max(shifted.a, max(red.a, blue.a));
  const color = vec3(red.r, shifted.g, blue.b).div(max(coverage, 0.000001));
  const alpha = mix(coverage, original.a, u.preserveAlpha!);
  return mixEffectCoverage(original, vec4(color, alpha), controls.amount);
}
