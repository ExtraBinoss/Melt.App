import {
  clamp,
  dot,
  floor,
  fract,
  max,
  min,
  mix,
  smoothstep,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { Node } from "three/webgpu";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { noise2d } from "../shared/noise";
import { mixEffectCoverage } from "../shared/compositing/node";
export function tornEdgesNode({ source, controls }: EffectNodeContext) {
  const p = uv(),
    u = controls.parameters,
    size = controls.contentResolution;
  const point = vec2(p.x, p.y.oneMinus()).mul(controls.logicalResolution);
  const origin = vec2(
      controls.contentOrigin.x,
      controls.logicalResolution.y.sub(controls.contentOrigin.y).sub(size.y),
    ),
    local = point.sub(origin);
  const noise = (q: Node<"vec2">) => {
    const grid = floor(q).add(16384),
      t = fract(q),
      f = t.mul(t).mul(vec2(3).sub(t.mul(2)));
    return mix(
      mix(
        noise2d(grid, controls.randomSeedUint),
        noise2d(grid.add(vec2(1, 0)), controls.randomSeedUint),
        f.x,
      ),
      mix(
        noise2d(grid.add(vec2(0, 1)), controls.randomSeedUint),
        noise2d(grid.add(1), controls.randomSeedUint),
        f.x,
      ),
      f.y,
    );
  };
  const q = local.div(u.textureScale!),
    coarse = noise(q),
    fine = noise(q.mul(4.13).add(17));
  const fibre = noise(q.mul(vec2(2, 20)).add(91));
  const texture = mix(coarse, mix(fine, fibre, 0.35), u.detail!);
  const original = sampleEffect(source, controls, p),
    step = u.smoothing!.div(controls.logicalResolution);
  const mean = original.rgb
    .mul(0.4)
    .add(sampleEffect(source, controls, clamp(p.add(vec2(step.x, 0)), 0, 1)).rgb.mul(0.15))
    .add(sampleEffect(source, controls, clamp(p.sub(vec2(step.x, 0)), 0, 1)).rgb.mul(0.15))
    .add(sampleEffect(source, controls, clamp(p.add(vec2(0, step.y)), 0, 1)).rgb.mul(0.15))
    .add(sampleEffect(source, controls, clamp(p.sub(vec2(0, step.y)), 0, 1)).rgb.mul(0.15));
  const tone = dot(mean, vec3(0.2126, 0.7152, 0.0722))
    .sub(0.5)
    .mul(u.contrast!)
    .add(0.5);
  const graphic = smoothstep(
    u.balance!.sub(0.025),
    u.balance!.add(0.025),
    tone.add(texture.sub(0.5).mul(u.roughness!)),
  );
  const edgeDistance = min(
    min(
      u.tearLeft!.greaterThan(0.5).select(local.x, 1e6),
      u.tearRight!.greaterThan(0.5).select(size.x.sub(local.x), 1e6),
    ),
    min(
      u.tearTop!.greaterThan(0.5).select(local.y, 1e6),
      u.tearBottom!.greaterThan(0.5).select(size.y.sub(local.y), 1e6),
    ),
  );
  const cut = u.tearWidth!.mul(texture.mul(u.roughness!).add(u.roughness!.oneMinus().mul(0.25)));
  const keep = smoothstep(cut, cut.add(u.feather!), edgeDistance);
  const edge = smoothstep(
    cut.add(u.edgeWidth!),
    cut.add(u.edgeWidth!).add(u.feather!),
    edgeDistance,
  );
  const graphicAlpha = mix(u.backgroundOpacity!, 1, graphic.oneMinus()).mul(original.a);
  const graphicRGB = mix(
    controls.colors.ink!,
    controls.colors.paper!.mul(u.backgroundOpacity!),
    graphic,
  )
    .mul(original.a)
    .div(max(graphicAlpha, 0.000001));
  const paperRGB = mix(
    controls.colors.edgeColor!,
    mix(controls.colors.paper!, original.rgb, u.sourceColor!),
    edge,
  );
  return mixEffectCoverage(
    original,
    u
      .technique!.greaterThan(0.5)
      .select(vec4(paperRGB, original.a.mul(keep)), vec4(graphicRGB, graphicAlpha)),
    controls.amount,
  );
}
