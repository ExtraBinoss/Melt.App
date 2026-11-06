import {
  Fn,
  abs,
  clamp,
  cos,
  dot,
  float,
  floor,
  length,
  max,
  min,
  mix,
  pow,
  sin,
  smoothstep,
  sqrt,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { authoredPixelDown, transportUv } from "../shared/coordinates";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { samplePremultiplied } from "../shared/premultiplied-sample";
import { mixEffectCoverage } from "../shared/compositing/node";

/** Five alpha-weighted taps reconstruct each rotated owner-space cell; no atlas or raster cache. */
export function shapeGridNode(context: EffectNodeContext) {
  const { source, controls } = context;
  return Fn(() => {
    const u = controls.parameters,
      p = uv(),
      original = sampleEffect(source, controls, p).toVar(),
      spacing = max(3, u.cellSize!),
      theta = u.rotation!.mul(Math.PI / 180),
      c = cos(theta),
      s = sin(theta),
      point = authoredPixelDown(controls, p),
      grid = vec2(point.x.mul(c).add(point.y.mul(s)), point.y.mul(c).sub(point.x.mul(s))),
      center = floor(grid.div(spacing)).add(0.5).mul(spacing),
      sum = vec4(0).toVar();

    for (const [x, y] of [
      [0, 0],
      [-0.22, 0],
      [0.22, 0],
      [0, -0.22],
      [0, 0.22],
    ] as const) {
      const q = center.add(vec2(x, y).mul(spacing)),
        owner = vec2(q.x.mul(c).sub(q.y.mul(s)), q.x.mul(s).add(q.y.mul(c))).div(
          controls.contentResolution,
        ),
        inside = owner.x
          .greaterThanEqual(0)
          .and(owner.y.greaterThanEqual(0))
          .and(owner.x.lessThanEqual(1))
          .and(owner.y.lessThanEqual(1)),
        color = samplePremultiplied(
          context,
          transportUv(controls, vec2(owner.x, owner.y.oneMinus())),
        ).toVar(),
        weight = color.a.mul(inside.select(1, 0));
      sum.addAssign(vec4(color.rgb.mul(inside.select(1, 0)), weight));
    }

    const color = sum.rgb.div(max(sum.a, 0.000001)),
      light = clamp(dot(color, vec3(0.2126, 0.7152, 0.0722)), 0, 1),
      tone = pow(light.oneMinus(), u.contrast!),
      radius = sqrt(tone).mul(spacing).mul(0.47),
      local = abs(grid.sub(center)),
      selected = u.shape!.lessThan(0.5).select(min(floor(tone.mul(5)), 4), u.shape!.sub(1)),
      circle = length(local).sub(radius),
      diamond = local.x.add(local.y).mul(Math.SQRT1_2).sub(radius.mul(0.86)),
      square = max(local.x, local.y).sub(radius.mul(0.86)),
      cross = min(
        max(local.x.sub(radius.mul(0.32)), local.y.sub(radius)),
        max(local.x.sub(radius), local.y.sub(radius.mul(0.32))),
      ),
      distance = selected
        .lessThan(2.5)
        .select(
          selected.lessThan(1.5).select(circle, diamond),
          selected.lessThan(3.5).select(square, cross),
        ),
      // Stroke is contained inside the glyph, so it never expands source coverage.
      aa = max(controls.pixelFootprint.x, controls.pixelFootprint.y).mul(0.6),
      outer = smoothstep(aa.negate(), aa, distance).oneMinus(),
      inner = smoothstep(aa.negate(), aa, distance.add(u.stroke!)).oneMinus(),
      fill = selected.greaterThan(0.5).and(selected.lessThan(1.5)).select(0, u.fill!),
      glyph = outer
        .sub(inner.mul(float(1).sub(fill)))
        .mul(smoothstep(0, 0.02, tone))
        .mul(sum.a.greaterThan(0.000001).select(1, 0)),
      palette = mix(
        mix(controls.colors.shadowColor!, controls.colors.midtoneColor!, clamp(light.mul(2), 0, 1)),
        controls.colors.highlightColor!,
        clamp(light.mul(2).sub(1), 0, 1),
      ),
      ink = u.colorMode!.greaterThan(0.5).select(palette, color),
      background = u.backgroundOpacity!,
      coverage = glyph.add(background.mul(glyph.oneMinus())),
      rgb = ink
        .mul(glyph)
        .add(controls.colors.backgroundColor!.mul(background).mul(glyph.oneMinus()))
        .div(max(coverage, 0.000001));
    return mixEffectCoverage(original, vec4(rgb, original.a.mul(coverage)), controls.amount);
  })();
}
