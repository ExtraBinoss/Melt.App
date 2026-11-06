import {
  Fn,
  clamp,
  dot,
  exp,
  float,
  floor,
  max,
  mix,
  pow,
  smoothstep,
  sqrt,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { authoredPixelDown } from "../shared/coordinates";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { samplePremultiplied } from "../shared/premultiplied-sample";
import { paperNoise } from "./noise";

/** Bounded pigment treatment: edge-aware wash, optical-density pooling and seeded paper.
 * The fixed 25-tap stencil is independent of radius. This is an artistic filter, not fluid simulation. */
export function watercolorNode(context: EffectNodeContext) {
  const { source, controls } = context;
  const p = uv(),
    original = sampleEffect(source, controls, p);
  const painted = Fn(() => {
    const u = controls.parameters,
      owner = authoredPixelDown(controls, p),
      seed = controls.randomSeed,
      broad = paperNoise(owner.div(23), seed),
      broadY = paperNoise(owner.div(23).add(vec2(43.7, 19.1)), seed),
      warp = vec2(broad.sub(0.5), broadY.sub(0.5)).mul(u.diffusion!).mul(u.washScale!),
      total = vec4(0).toVar(),
      moments = vec2(0).toVar(),
      range = u.edgePreservation!.mul(40).add(2);

    for (let y = -2; y <= 2; y++)
      for (let x = -2; x <= 2; x++) {
        const offset = vec2(x, y).mul(u.washScale!.mul(0.5)).add(warp),
          filtered = samplePremultiplied(
            context,
            clamp(p.add(vec2(offset.x, offset.y.negate()).div(controls.logicalResolution)), 0, 1),
          ).toVar(),
          sample = vec4(filtered.rgb.div(max(filtered.a, 0.000001)), filtered.a),
          difference = sample.rgb.sub(original.rgb),
          spatial = Math.exp(-(x * x + y * y) / 3),
          weight = exp(dot(difference, difference).mul(range).negate()).mul(spatial).mul(sample.a),
          light = dot(sample.rgb, vec3(0.2126, 0.7152, 0.0722));
        total.addAssign(vec4(sample.rgb.mul(weight), weight));
        moments.addAssign(vec2(light, light.mul(light)).mul(weight));
      }

    const weight = max(total.a, 0.000001),
      wash = total.rgb.div(weight),
      mean = moments.x.div(weight),
      variance = max(moments.y.div(weight).sub(mean.mul(mean)), 0),
      edge = smoothstep(0.015, 0.22, sqrt(variance)),
      levels = mix(32, 9, u.simplification!),
      regions = mix(
        wash,
        floor(wash.mul(levels).add(0.5)).div(levels),
        u.simplification!.mul(0.28),
      ),
      softened = mix(original.rgb, regions, u.simplification!.mul(0.85).add(0.15)),
      tooth = paperNoise(owner.div(u.paperScale!), seed),
      fibres = paperNoise(owner.div(u.paperScale!).mul(vec2(0.43, 2.7)), seed),
      granule = tooth.mul(0.65).add(fibres.mul(0.35)).sub(0.5),
      // Pigment settles at local chromatic boundaries and in the paper's valleys.
      density = float(1)
        .add(u.pigment!.mul(0.3))
        .add(edge.mul(u.edgeDarkening!).mul(1.6))
        .add(granule.mul(u.granulation!).mul(0.7))
        .add(broad.sub(0.5).mul(u.diffusion!).mul(0.18)),
      pigment = pow(clamp(softened, 0.0001, 1), vec3(density)),
      paper = controls.colors.paperColor!.mul(
        float(1).sub(tooth.oneMinus().mul(u.paperGrain!).mul(0.16)),
      ),
      washed = mix(pigment, paper, u.paperOpacity!.mul(0.65)),
      texture = float(1).add(granule.mul(u.paperGrain!).mul(0.1));
    return clamp(washed.mul(texture), 0, 1);
  })();
  return vec4(mix(original.rgb, painted, controls.amount), original.a);
}
