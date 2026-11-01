import {
  Fn,
  If,
  clamp,
  dot,
  floor,
  fract,
  max,
  mix,
  sin,
  smoothstep,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { Node } from "three/webgpu";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { mixEffectCoverage } from "../shared/compositing/node";
/** Static paper absorption: bounded pigment dilation, with seeded spatial fibres. */
export function inkBleedNode({ source, controls }: EffectNodeContext) {
  return Fn(() => {
    const u = controls.parameters,
      p = uv(),
      original = sampleEffect(source, controls, p).toVar();
    const read = (q: Node<"vec2">) => {
      const inside = q.x
        .greaterThanEqual(0)
        .and(q.y.greaterThanEqual(0))
        .and(q.x.lessThanEqual(1))
        .and(q.y.lessThanEqual(1));
      return sampleEffect(source, controls, clamp(q, 0, 1)).mul(inside.select(1, 0));
    };
    const pigment = (s: Node<"vec4">) =>
      smoothstep(
        u.threshold!,
        u.threshold!.add(u.softness!),
        mix(
          dot(s.rgb, vec3(0.2126, 0.7152, 0.0722))
            .oneMinus()
            .mul(s.a),
          s.a,
          u.source!,
        ),
      );
    const hash = (q: Node<"vec2">) =>
      fract(sin(dot(q, vec2(127.1, 311.7)).add(controls.randomSeed)).mul(43758.5453));
    const paper = p.mul(controls.logicalResolution).sub(controls.contentOrigin).div(u.paperScale!);
    const grid = floor(paper),
      part = fract(paper),
      blend = part.mul(part).mul(part.mul(-2).add(3));
    const noise = mix(
      mix(hash(grid), hash(grid.add(vec2(1, 0))), blend.x),
      mix(hash(grid.add(vec2(0, 1))), hash(grid.add(vec2(1))), blend.x),
      blend.y,
    );
    const radius = u.radius!.mul(mix(1, noise.mul(0.8).add(0.2), u.roughness!));
    const strongest = pigment(original).toVar(),
      color = original.rgb.toVar();
    for (const ring of [0.5, 1])
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 + ring;
        const q = p.add(
          vec2(Math.cos(angle), Math.sin(angle))
            .mul(radius)
            .mul(ring)
            .div(controls.logicalResolution),
        );
        const candidate = read(q).toVar(),
          coverage = pigment(candidate).mul(1 - ring * 0.35);
        If(coverage.greaterThan(strongest), () => {
          strongest.assign(coverage);
          color.assign(candidate.rgb);
        });
      }
    const ink = clamp(strongest.mul(u.density!), 0, 1);
    const inkColor = mix(color, controls.colors.inkColor!, u.colorize!);
    const added = ink.mul(original.a.oneMinus()),
      alpha = original.a.add(added);
    const rgb = mix(original.rgb, inkColor, ink)
      .mul(original.a)
      .add(inkColor.mul(added))
      .div(max(alpha, 0.000001));
    return mixEffectCoverage(original, vec4(rgb, alpha), controls.amount);
  })();
}
