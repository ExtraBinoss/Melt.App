import {
  clamp,
  cos,
  dot,
  floor,
  fract,
  length,
  max,
  min,
  normalize,
  pow,
  sin,
  smoothstep,
  sqrt,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { Node } from "three/webgpu";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { mixEffectCoverage } from "../shared/compositing/node";
import { noise2d } from "../shared/noise";

/** Five bounded source taps per 2×1 brick, two raised studs, analytic plastic lighting. */
export function blocksNode({ source, controls }: EffectNodeContext) {
  const u = controls.parameters,
    p = uv(),
    original = sampleEffect(source, controls, p),
    size = controls.logicalResolution,
    pitch = max(2, controls.scale),
    contentOrigin = vec2(
      controls.contentOrigin.x,
      size.y.sub(controls.contentOrigin.y).sub(controls.contentResolution.y),
    ),
    origin = contentOrigin.add(vec2(u.centerX!, u.centerY!).mul(controls.contentResolution)),
    radians = u.angle!.mul(Math.PI / 180),
    c = cos(radians),
    s = sin(radians);
  const rotate = (q: Node<"vec2">) => vec2(q.x.mul(c).add(q.y.mul(s)), q.y.mul(c).sub(q.x.mul(s)));
  const unrotate = (q: Node<"vec2">) =>
    vec2(q.x.mul(c).sub(q.y.mul(s)), q.y.mul(c).add(q.x.mul(s)));
  const grid = rotate(vec2(p.x, p.y.oneMinus()).mul(size).sub(origin)).div(pitch),
    row = floor(grid.y),
    stagger = fract(row.mul(0.5)).mul(u.stagger!).mul(2),
    brick = vec2(floor(grid.x.sub(stagger).div(2)), row),
    local = vec2(fract(grid.x.sub(stagger).div(2)).mul(2), fract(grid.y)),
    middle = vec2(brick.x.mul(2).add(stagger).add(1), row.add(0.5));
  const read = (offset: Node<"vec2">) => {
    const coord = unrotate(middle.add(offset).mul(pitch)).add(origin).div(size);
    return sampleEffect(source, controls, clamp(vec2(coord.x, coord.y.oneMinus()), 0, 1));
  };
  const samples = [
      read(vec2(0)),
      ...[-0.55, 0.55].flatMap((x) => [-0.22, 0.22].map((y) => read(vec2(x, y)))),
    ],
    alpha = samples.map((sample) => sample.a).reduce((sum, a) => sum.add(a)),
    rgb = samples
      .map((sample) => sample.rgb.mul(sample.a))
      .reduce((sum, color) => sum.add(color))
      .div(max(alpha, 0.000001));
  const variation = noise2d(brick.add(1048576), controls.randomSeedUint)
    .sub(0.5)
    .mul(u.variation!)
    .add(1);
  const light = vec2(cos(u.lightAngle!.mul(Math.PI / 180)), sin(u.lightAngle!.mul(Math.PI / 180))),
    normalLight = normalize(vec3(light, 1.5)),
    aa = clamp(
      max(controls.pixelFootprint.x, controls.pixelFootprint.y).div(pitch).mul(0.65),
      0.002,
      0.15,
    ),
    halfGap = min(u.gap!.div(pitch).mul(0.5), 0.22),
    edges = min(local.x, local.x.negate().add(2)).min(min(local.y, local.y.oneMinus())),
    tile = u.gap!.greaterThan(0).select(smoothstep(halfGap.sub(aa), halfGap.add(aa), edges), 1),
    bevelWidth = 0.065,
    bevel = smoothstep(halfGap, halfGap.add(bevelWidth), edges).oneMinus(),
    edgeNormal = normalize(vec3(local.x.sub(1).mul(0.5), local.y.sub(0.5), 0.2)),
    bevelLight = dot(edgeNormal, normalLight).sub(0.5).mul(bevel).mul(0.45);
  // Each physical 2×1 tile has a pair of round top studs, rather than a pixelated swatch.
  const stud = vec2(fract(local.x).sub(0.5), local.y.sub(0.5)),
    radius = length(stud),
    studRadius = u.studRadius!,
    outerRadius = studRadius.add(0.055),
    raised = u.studHeight!.mul(u.relief!),
    top = smoothstep(studRadius.sub(aa), studRadius.add(aa), radius).oneMinus(),
    rim = smoothstep(studRadius, outerRadius, radius).oneMinus().sub(top),
    domeNormal = normalize(
      vec3(
        stud.div(studRadius.add(0.025)).mul(u.studHeight!),
        sqrt(max(0.05, radius.div(outerRadius).pow(2).oneMinus())),
      ),
    ),
    diffuse = max(0, dot(domeNormal, normalLight)).sub(0.65).mul(top).mul(0.38),
    specular = pow(max(0, dot(domeNormal, normalize(normalLight.add(vec3(0, 0, 1))))), 36)
      .mul(top)
      .mul(0.42),
    cast = smoothstep(
      studRadius.add(0.005),
      studRadius.add(0.095),
      length(stud.add(light.mul(0.09).mul(u.studHeight!))),
    )
      .oneMinus()
      .mul(top.oneMinus()),
    shade = bevelLight
      .mul(u.relief!)
      .add(diffuse.sub(rim.mul(0.22)).sub(cast.mul(0.25)).mul(raised)),
    levels = max(1, u.paletteLevels!.sub(1)),
    palette = u
      .paletteLevels!.greaterThan(1)
      .select(floor(rgb.mul(levels).add(0.5)).div(levels), rgb);
  const color = clamp(palette.mul(variation).mul(shade.add(1)).add(specular.mul(raised)), 0, 1);
  return mixEffectCoverage(original, vec4(color, original.a.mul(tile)), controls.amount);
}
