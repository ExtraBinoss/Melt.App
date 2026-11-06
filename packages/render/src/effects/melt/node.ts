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
import { mixEffectCoverage } from "../shared/compositing/node";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { authoredPixelDown } from "../shared/coordinates";
import { noise2d } from "../shared/noise";
import { samplePremultiplied } from "../shared/premultiplied-sample";

/** Smooth seeded lanes stretch source paint, including transparent silhouettes, downwind. */
export function meltNode(context: EffectNodeContext) {
  const { controls, source } = context,
    u = controls.parameters,
    p = uv(),
    original = sampleEffect(source, controls, p),
    pixel = authoredPixelDown(controls, p),
    angle = u.angle!.mul(Math.PI / 180),
    direction = vec2(cos(angle), sin(angle)),
    phase = fract(u.phase!.div(360)).mul(Math.PI * 2),
    across = dot(pixel, vec2(direction.y.negate(), direction.x)).div(u.dripScale!),
    along = dot(pixel, direction).div(u.dripScale!.mul(8)),
    lane = across.add(sin(phase).mul(0.65)),
    cell = floor(lane).add(1048576),
    t = fract(lane),
    smooth = t.mul(t).mul(float(3).sub(t.mul(2))),
    random = mix(
      noise2d(vec2(cell, 71), controls.randomSeedUint),
      noise2d(vec2(cell.add(1), 71), controls.randomSeedUint),
      smooth,
    ),
    // Low-frequency length variation forms swollen tips instead of rigid wind bands.
    bulb = sin(
      fract(along)
        .mul(Math.PI * 2)
        .add(cos(phase)),
    )
      .mul(0.15)
      .add(0.85),
    lanes = mix(0.2, 1, random.mul(random)).mul(bulb),
    stretch = mix(0.3, lanes, u.liquidity!).mul(u.distance!),
    axis = vec2(direction.x, direction.y.negate()).div(controls.logicalResolution),
    probe = samplePremultiplied(context, p.sub(axis.mul(stretch))),
    luminance = clamp(
      dot(probe.rgb.div(max(probe.a, 0.000001)), vec3(0.2126, 0.7152, 0.0722)),
      0,
      1,
    ),
    selected = mix(luminance, luminance.oneMinus(), u.tone!.equal(1).select(1, 0)),
    // Transparent probes carry no hidden tone. Intermediate probes keep short drips continuous.
    tone = mix(0.5, selected, clamp(probe.a.mul(8), 0, 1)),
    travel = stretch.mul(mix(1, mix(0.2, 1, tone), u.toneInfluence!));

  let sum: Node<"vec4"> = vec4(0);
  let total = 0;
  // A short backward gather softens the pull into viscous tails, rather than a broad wind blur.
  for (let index = 0; index < 4; index += 1) {
    const t = index / 3,
      position = travel.mul(float(1).sub(u.liquidity!.mul(0.28 * t))),
      sample = samplePremultiplied(context, p.sub(axis.mul(position))),
      weight = 1 - t * 0.5;
    sum = sum.add(sample.mul(weight));
    total += weight;
  }
  const paint = sum.div(total),
    processed = vec4(paint.rgb.div(max(paint.a, 0.000001)), paint.a);
  return mixEffectCoverage(
    original,
    processed,
    controls.amount.mul(u.distance!.greaterThan(0).select(1, 0)),
  );
}
