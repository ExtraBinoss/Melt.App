import {
  clamp,
  cos,
  dot,
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
import type { Node } from "three/webgpu";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { mixEffectCoverage } from "../shared/compositing/node";
export function circularHalftone({
  source,
  controls,
}: Pick<EffectNodeContext, "source" | "controls">) {
  const p = uv(),
    u = controls.parameters,
    size = controls.logicalResolution,
    spacing = max(1, controls.scale);
  const angle = u.rotation!.mul(Math.PI / 180),
    c = cos(angle),
    s = sin(angle);
  const offset = vec2(u.offsetX!, u.offsetY!),
    point = vec2(p.x, p.y.oneMinus()).mul(size).sub(offset);
  const grid = vec2(point.x.mul(c).add(point.y.mul(s)), point.y.mul(c).sub(point.x.mul(s)));
  const cell = floor(grid.div(spacing)).add(0.5).mul(spacing);
  const center = vec2(cell.x.mul(c).sub(cell.y.mul(s)), cell.x.mul(s).add(cell.y.mul(c)))
    .add(offset)
    .div(size);
  const color = sampleEffect(source, controls, clamp(vec2(center.x, center.y.oneMinus()), 0, 1));
  const tone = pow(clamp(dot(color.rgb, vec3(0.2126, 0.7152, 0.0722)).oneMinus(), 0, 1), u.gamma!);
  const mosaic = u.pattern!.greaterThan(1.5);
  const radius = mosaic.select(1, sqrt(tone)).mul(spacing).mul(0.5).mul(u.dotSize!);
  const feather = max(0.001, min(spacing.mul(0.1), u.softness!.mul(0.5)));
  const ink = radius
    .greaterThan(0)
    .select(
      smoothstep(radius.sub(feather), radius.add(feather), length(grid.sub(cell))).oneMinus(),
      0,
    );
  const original = sampleEffect(source, controls, p),
    alpha = mix(u.backgroundOpacity!, 1, ink).mul(original.a);
  const rgb = mix(
    controls.colors.paper!.mul(u.backgroundOpacity!),
    mosaic.select(
      color.rgb,
      controls.color.greaterThan(0.5).select(color.rgb, controls.colors.ink!),
    ),
    ink,
  )
    .mul(original.a)
    .div(max(alpha, 0.000001));
  const channel = (index: "r" | "g" | "b", degrees: Node<"float">) => {
    const theta = degrees.add(u.rotation!).mul(Math.PI / 180),
      cosine = cos(theta),
      sine = sin(theta);
    const grid = vec2(
      point.x.mul(cosine).add(point.y.mul(sine)),
      point.y.mul(cosine).sub(point.x.mul(sine)),
    );
    const middle = floor(grid.div(spacing)).add(0.5).mul(spacing);
    const q = vec2(
      middle.x.mul(cosine).sub(middle.y.mul(sine)),
      middle.x.mul(sine).add(middle.y.mul(cosine)),
    )
      .add(offset)
      .div(size);
    const color = sampleEffect(source, controls, clamp(vec2(q.x, q.y.oneMinus()), 0, 1));
    const r = sqrt(pow(clamp(color[index].oneMinus(), 0, 1), u.gamma!))
      .mul(spacing)
      .mul(Math.SQRT1_2)
      .mul(u.dotSize!);
    return r
      .greaterThan(0)
      .select(smoothstep(r.sub(feather), r.add(feather), length(grid.sub(middle))), 1);
  };
  const screened = vec3(
    channel("r", u.cyanAngle!),
    channel("g", u.magentaAngle!),
    channel("b", u.yellowAngle!),
  );
  return mixEffectCoverage(
    original,
    u.pattern!.greaterThan(2.5).select(vec4(screened, original.a), vec4(rgb, alpha)),
    controls.amount,
  );
}
