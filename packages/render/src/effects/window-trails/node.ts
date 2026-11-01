import {
  Break,
  Fn,
  If,
  Loop,
  abs,
  clamp,
  dot,
  float,
  floor,
  fract,
  max,
  min,
  mod,
  mix,
  pow,
  sin,
  step,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { asciiNode } from "../ascii/node";
import { mixEffectCoverage } from "../shared/compositing/node";

/** Screen-registered source windows, evaluated directly at an authored time: no frame history or readback. */
export function windowTrailsNode(context: EffectNodeContext) {
  const { source, controls, bindImageInput } = context;
  const u = controls.parameters,
    colors = controls.colors;
  const frame = bindImageInput?.("frame");
  const original = sampleEffect(source, controls, uv());
  const atlas = context.bindGlyphAtlas?.();
  const processed = Fn(() => {
    const resolution = controls.logicalResolution.toVar();
    const pixel = vec2(uv().x, uv().y.oneMinus()).mul(resolution).toVar();
    const size = max(vec2(24), vec2(u.width!, u.height!)).toVar();
    const background = original.toVar();
    If(u.asciiBackground!.greaterThan(0.5), () => {
      const ascii = asciiNode(context).toVar();
      const base = colors
        .paper!.mul(float(1).sub(pixel.y.div(resolution.y).mul(u.backgroundShade!)))
        .toVar();
      const ink = clamp(dot(ascii.rgb, vec3(0.333)).mul(2.8), 0, 1).toVar();
      background.assign(vec4(mix(base, colors.ink!, ink), 1));
      if (atlas) {
        If(u.stars!.greaterThan(0), () => {
          const cell = floor(pixel.div(controls.scale)).toVar();
          const seed = fract(sin(dot(cell, vec2(127.1, 311.7))).mul(43758.5453)).toVar();
          If(seed.greaterThan(0.985).and(original.a.lessThan(0.1)), () => {
            const local = fract(pixel.div(controls.scale)).toVar();
            const mark = atlas.texture.sample(
              vec2(
                floor(seed.mul(atlas.count.sub(1)))
                  .add(local.x)
                  .div(atlas.count),
                local.y,
              ),
            ).r;
            background.assign(vec4(mix(base, colors.ink!, mark.mul(u.stars!)), 1));
          });
        });
      }
    });
    const result = mix(vec4(0), background, u.showSource!).toVar();
    const shade = float(1).toVar();
    const layout = controls.windowTrails!;
    const box = layout.bounds;
    If(
      pixel.x
        .greaterThanEqual(box.x)
        .and(pixel.y.greaterThanEqual(box.y))
        .and(pixel.x.lessThan(box.z))
        .and(pixel.y.lessThan(box.w)),
      () => {
        Loop({ start: 0, end: layout.count, type: "int" }, ({ i }) => {
          const rectangle = layout.windows.element(i).toVar();
          const ribbon = mod(rectangle.z, 4).toVar();
          const local = pixel.sub(rectangle.xy).toVar();
          const inside = local.x
            .greaterThanEqual(0)
            .and(local.y.greaterThanEqual(0))
            .and(local.x.lessThan(size.x))
            .and(local.y.lessThan(size.y));
          If(
            rectangle.z
              .greaterThanEqual(4)
              .and(inside.not())
              .and(local.x.greaterThan(12))
              .and(local.y.greaterThan(14))
              .and(local.x.lessThan(size.x.add(12)))
              .and(local.y.lessThan(size.y.add(14))),
            () => {
              shade.mulAssign(float(1).sub(u.shadow!));
            },
          );
          If(inside, () => {
            const title = min(u.titleHeight!, size.y.sub(4)).toVar();
            const bodyUV = vec2(
              local.x.div(size.x),
              local.y.sub(title).div(max(1, size.y.sub(title))),
            ).toVar();
            const coord = mix(uv(), vec2(bodyUV.x, bodyUV.y.oneMinus()), u.sampling!).toVar();
            const sample = sampleEffect(source, controls, coord).toVar();
            const tone = dot(sample.rgb, vec3(0.2126, 0.7152, 0.0722))
              .mul(sample.a)
              .toVar();
            const treatment = mix(
              u.treatment!,
              ribbon.equal(0).select(float(0), ribbon.add(1)),
              u.alternateTreatments!,
            ).toVar();
            const paper = mix(
              colors.paper!,
              ribbon.equal(1).select(vec3(0.96), vec3(0.008)),
              u.alternateTreatments!.mul(float(ribbon.greaterThan(0))),
            ).toVar();
            const ink = mix(
              colors.ink!,
              colors.paper!,
              u.alternateTreatments!.mul(float(ribbon.equal(1))),
            ).toVar();
            const color = mix(paper, sample.rgb, sample.a).toVar();
            If(treatment.greaterThan(2.5), () => {
              const density = pow(clamp(tone, 0, 1), 0.65).toVar();
              color.assign(mix(paper, ink, density));
            })
              .ElseIf(treatment.greaterThan(1.5), () => {
                const dx = vec2(1.5, 0).div(controls.resolution),
                  dy = vec2(0, 1.5).div(controls.resolution);
                const a = sampleEffect(source, controls, coord.add(dx)),
                  b = sampleEffect(source, controls, coord.sub(dx));
                const c = sampleEffect(source, controls, coord.add(dy)),
                  d = sampleEffect(source, controls, coord.sub(dy));
                const edge = clamp(
                  abs(a.a.sub(b.a))
                    .add(abs(c.a.sub(d.a)))
                    .add(abs(dot(a.rgb.sub(b.rgb), vec3(0.333))))
                    .mul(4),
                  0,
                  1,
                );
                const grid = step(0.92, max(fract(pixel.x.div(24)), fract(pixel.y.div(24)))).mul(
                  0.13,
                );
                color.assign(mix(paper, ink, max(edge, grid)));
              })
              .ElseIf(treatment.greaterThan(0.5), () => {
                color.assign(color.oneMinus());
              });
            const rim = min(min(local.x, size.x.sub(local.x)), min(local.y, size.y.sub(local.y)));
            If(local.y.lessThan(title).or(rim.lessThan(u.border!)), () => {
              color.assign(colors.chrome!);
            });
            // A bundled transparent SVG frame can supply titles, controls and crop marks.
            if (frame) {
              const chrome = frame.texture
                .sample(
                  vec2(
                    local.x.div(size.x),
                    local.y.div(size.y).add(mod(ribbon, u.frameRows!)).div(u.frameRows!).oneMinus(),
                  ),
                )
                .toVar();
              color.assign(mix(color, chrome.rgb, chrome.a.mul(frame.enabled)));
            }
            const alpha = rectangle.w;
            result.assign(vec4(color, alpha));
            // Front-to-back lookup: sample the original only for the foremost covering window.
            Break();
          });
        });
      },
    );
    const alpha = float(1).sub(result.a.oneMinus().mul(shade));
    return vec4(result.rgb.mul(result.a).mul(shade).div(max(alpha, 0.000001)), alpha);
  })();
  return mixEffectCoverage(original, processed, controls.amount);
}
