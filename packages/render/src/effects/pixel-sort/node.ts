import { authoredUv, transportUv } from "../shared/coordinates";
import {
  Fn,
  If,
  dot,
  exp2,
  float,
  floor,
  log2,
  max,
  min,
  mix,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { Node } from "three/webgpu";
import { sampleEffect, type EffectNodeContext, type EffectNodeBuilder } from "../shared/context";
import { mixEffectCoverage } from "../shared/compositing/node";
/** One exact compare/exchange step of a bounded bitonic network. Carries RGBA together. */
export function pixelSortStep(size: number, span: number, stride: number): EffectNodeBuilder {
  return ({ source, controls }) =>
    Fn(() => {
      const u = controls.parameters,
        p = authoredUv(controls),
        vertical = u.axis!;
      const footprint = mix(controls.pixelFootprint.x, controls.pixelFootprint.y, vertical);
      const count = exp2(
        floor(
          log2(max(1, min(size, float(size).mul(u.cellSize!).div(max(u.cellSize!, footprint))))),
        ),
      );
      // Lower-density previews use fewer cells while retaining the authored segment width.
      const cell = float(size).mul(u.cellSize!).div(count);
      const dimensions = controls.contentResolution.div(cell);
      const axisSize = floor(mix(dimensions.x, dimensions.y, vertical));
      const index = floor(mix(p.x.mul(dimensions.x), p.y.mul(dimensions.y), vertical));
      const offset = floor(u.offset!.mul(count.sub(1)));
      const local = index.sub(offset).mod(count).add(count).mod(count);
      const start = index.sub(local);
      const bit = floor(local.div(stride)).mod(2);
      const partner = index.add(bit.mul(-2).add(1).mul(stride));
      const coord = (i: Node<"float">) =>
        vec2(
          mix(i.add(0.5).div(dimensions.x), p.x, vertical),
          mix(p.y, i.add(0.5).div(dimensions.y), vertical),
        );
      const a = sampleEffect(source, controls, transportUv(controls, coord(index))).toVar();
      const b = sampleEffect(source, controls, transportUv(controls, coord(partner))).toVar();
      const key = (s: Node<"vec4">) => {
        const value = dot(s.rgb, vec3(0.2126, 0.7152, 0.0722)).toVar();
        for (const [i, channel] of [s.r, s.g, s.b].entries())
          If(u.metric!.equal(i + 1), () => {
            value.assign(channel);
          });
        return value.mul(mix(1, -1, u.order!));
      };
      const ascending = floor(local.div(span)).mod(2).equal(0);
      const minimum = ascending.and(bit.equal(0)).or(ascending.not().and(bit.equal(1)));
      const keyA = key(a).toVar(),
        keyB = key(b).toVar();
      const chooseB = minimum
        .and(keyB.lessThan(keyA))
        .or(minimum.not().and(keyB.greaterThan(keyA)));
      const valid = start
        .greaterThanEqual(0)
        .and(start.add(count).lessThanEqual(axisSize))
        .and(count.greaterThanEqual(span));
      const result = vec4(a).toVar();
      If(valid.and(chooseB), () => {
        result.assign(b);
      });
      If(valid.not(), () => {
        result.assign(sampleEffect(source, controls, transportUv(controls, p)));
      });
      return result;
    })();
}
export function pixelSortFinishNode({ source, backdrop, controls }: EffectNodeContext) {
  const original = sampleEffect(
    backdrop!,
    { ...controls, sourceFlipY: controls.backdropFlipY },
    uv(),
  );
  return mixEffectCoverage(original, sampleEffect(source, controls, uv()), controls.amount);
}
