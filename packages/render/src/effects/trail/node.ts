import type { Node } from "three/webgpu";
import { clamp, cos, float, max, mix, pow, sin, step, uv, vec2, vec3, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { mixEffectCoverage } from "../shared/compositing/node";

/** Eight upstream historical inputs; source always represents the present upstream stack. */
export function trailNode(context: EffectNodeContext) {
  const { source, controls } = context,
    u = controls.parameters,
    p = uv(),
    original = sampleEffect(source, controls, p),
    temporal = u.mode!.lessThan(0.5),
    center = controls.contentOrigin
      .add(vec2(u.centerX!, u.centerY!.oneMinus()).mul(controls.contentResolution))
      .div(controls.logicalResolution),
    angle = u.angle!.mul(Math.PI / 180),
    c = cos(angle),
    s = sin(angle),
    direction = vec2(
      u.offsetX!.mul(c).sub(u.offsetY!.mul(s)),
      u.offsetX!.mul(s).add(u.offsetY!.mul(c)).negate(),
    ).div(controls.logicalResolution);
  let alpha: Node<"float"> = float(0);
  let premultiplied: Node<"vec3"> = vec3(0);
  let temporalColor = original.rgb.mul(original.a),
    temporalAlpha = original.a,
    temporalWeight: Node<"float"> = float(1);
  // Older echoes are behind newer echoes; the present source is over the completed stack.
  for (let slot = 7; slot >= 0; slot -= 1) {
    const age = slot + 1,
      scale = pow(u.spread!.add(1), age),
      coord = p.sub(center).sub(direction.mul(age)).div(scale).add(center),
      inside = step(0, coord.x).mul(step(coord.x, 1)).mul(step(0, coord.y)).mul(step(coord.y, 1)),
      staticSample = sampleEffect(source, controls, clamp(coord, 0, 1)),
      binding = context.bindHistoryInput?.(slot),
      history = binding
        ? binding.texture.sample(
            vec2(
              clamp(coord.x, 0, 1),
              mix(clamp(coord.y, 0, 1), clamp(coord.y, 0, 1).oneMinus(), binding.flipY),
            ),
          )
        : staticSample,
      available = binding?.available ?? float(0),
      sampleAlpha = temporal.select(history.a.mul(available), staticSample.a),
      sampleColor = temporal.select(history.rgb, staticSample.rgb),
      weight = float(slot).lessThan(u.echoCount!).select(pow(u.fade!, age), 0).mul(inside),
      coverage = sampleAlpha.mul(weight);
    temporalColor = temporalColor.add(history.rgb.mul(history.a).mul(weight).mul(available));
    temporalAlpha = temporalAlpha.add(history.a.mul(weight).mul(available));
    temporalWeight = temporalWeight.add(weight.mul(available));
    premultiplied = sampleColor.mul(coverage).add(premultiplied.mul(coverage.oneMinus()));
    alpha = coverage.add(alpha.mul(coverage.oneMinus()));
  }
  const coverage = original.a.add(alpha.mul(original.a.oneMinus())),
    rgb = original.rgb.mul(original.a).add(premultiplied.mul(original.a.oneMinus()));
  const echoed = vec4(rgb.div(max(coverage, 0.000001)), coverage);
  const accumulated = vec4(
    temporalColor.div(max(temporalAlpha, 0.000001)),
    temporalAlpha.div(temporalWeight),
  );
  return mixEffectCoverage(original, temporal.select(accumulated, echoed), controls.amount);
}
