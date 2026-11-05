import type { Node } from "three/webgpu";
import {
  Fn,
  If,
  atan,
  clamp,
  cos,
  dot,
  float,
  max,
  mix,
  sin,
  smoothstep,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";

/** Four overlapping nine-tap regions share one rotated 5×5 stencil: 25 source reads total. */
export function oilPaintNode({ source, controls }: EffectNodeContext) {
  const u = controls.parameters,
    position = uv(),
    original = sampleEffect(source, controls, position);
  const painter = Fn(() => {
    const dimensions = controls.logicalResolution,
      origin = vec2(
        controls.contentOrigin.x,
        dimensions.y.sub(controls.contentOrigin.y).sub(controls.contentResolution.y),
      ),
      relative = vec2(position.x, position.y.oneMinus())
        .mul(dimensions)
        .sub(origin)
        .sub(vec2(u.centerX!, u.centerY!).mul(controls.contentResolution)),
      direction = u
        .angle!.mul(Math.PI / 180)
        .add(atan(relative.y, relative.x.add(0.000001)).mul(u.directionality!))
        .toVar(),
      axisX = vec2(cos(direction), sin(direction)).mul(u.brushScale!).mul(u.elongation!),
      axisY = vec2(sin(direction).negate(), cos(direction)).mul(u.brushScale!),
      samples: Node<"vec4">[] = [];
    for (let y = -2; y <= 2; y++)
      for (let x = -2; x <= 2; x++) {
        const offset = axisX.mul(x / 2).add(axisY.mul(y / 2)),
          coord = position.add(vec2(offset.x, offset.y.negate()).div(dimensions)),
          sample =
            x === 0 && y === 0 ? original : sampleEffect(source, controls, clamp(coord, 0, 1));
        samples.push(vec4(sample.rgb.mul(sample.a), sample.a).toVar());
      }
    const bestVariance = float(1e6).toVar(),
      bestColor = original.rgb.toVar();
    for (const top of [0, 2])
      for (const left of [0, 2]) {
        const total = vec4(0).toVar(),
          moments = vec2(0).toVar();
        for (let y = 0; y < 3; y++)
          for (let x = 0; x < 3; x++) {
            const sample = samples[(top + y) * 5 + left + x]!,
              luminance = dot(sample.rgb, vec3(0.2126, 0.7152, 0.0722)).div(
                max(sample.a, 0.000001),
              );
            total.addAssign(sample);
            moments.addAssign(vec2(luminance, luminance.mul(luminance)).mul(sample.a));
          }
        const weight = max(total.a, 0.000001),
          mean = moments.x.div(weight),
          variance = max(moments.y.div(weight).sub(mean.mul(mean)), 0);
        If(total.a.greaterThan(0.000001).and(variance.lessThan(bestVariance)), () => {
          bestVariance.assign(variance);
          bestColor.assign(total.rgb.div(weight));
        });
      }
    const difference = dot(bestColor.sub(original.rgb).abs(), vec3(0.2126, 0.7152, 0.0722)),
      preserve = smoothstep(0.025, 0.2, difference).mul(u.edgePreservation!),
      restoration = float(1).sub(float(1).sub(u.detail!).mul(preserve.oneMinus()));
    return mix(bestColor, original.rgb, restoration);
  })();
  return vec4(mix(original.rgb, painter, controls.amount), original.a);
}
