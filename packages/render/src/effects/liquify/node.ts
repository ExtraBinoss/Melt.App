import {
  Fn,
  If,
  Loop,
  clamp,
  cos,
  length,
  max,
  min,
  sin,
  smoothstep,
  uv,
  vec2,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
/** Inverse-map the authored brush sequence; no image pixels or displacement maps leave the GPU. */
export function liquifyNode({ source, controls }: EffectNodeContext) {
  const strokes = controls.liquify;
  if (!strokes) throw Error("Missing Liquify uniforms.");
  return Fn(() => {
    const size = controls.contentResolution,
      minimum = min(size.x, size.y);
    const origin = vec2(
      controls.contentOrigin.x,
      controls.logicalResolution.y.sub(controls.contentOrigin.y).sub(size.y),
    );
    const p = vec2(uv().x, uv().y.oneMinus()).mul(controls.logicalResolution).sub(origin).toVar();
    const protection = max(1, 1).toVar();
    Loop({ start: 0, end: strokes.count, type: "int", condition: "<" }, ({ i }) => {
      const index = strokes.count.sub(i).sub(1),
        a = strokes.positions.element(index),
        b = strokes.brushes.element(index);
      const delta = a.zw.mul(size),
        center = a.xy.mul(size),
        r = max(0.001, b.x.mul(minimum));
      const offset = p.sub(center).toVar();
      const weight = smoothstep(b.z, 1, length(offset).div(r))
        .oneMinus()
        .mul(b.y)
        .mul(controls.amount)
        .toVar();
      If(weight.greaterThan(0), () => {
        If(b.w.greaterThan(4.5), () => {
          protection.mulAssign(weight.oneMinus());
        }).Else(() => {
          weight.mulAssign(protection);
          If(b.w.lessThan(0.5), () => {
            p.subAssign(delta.mul(weight));
          }).Else(() => {
            const movement = clamp(length(delta).div(r), 0.1, 1),
              power = weight.mul(movement).mul(0.35);
            If(b.w.lessThan(2.5), () => {
              p.assign(
                center.add(offset.mul(b.w.lessThan(1.5).select(power.add(1), power.oneMinus()))),
              );
            }).Else(() => {
              const angle = power.mul(b.w.lessThan(3.5).select(-1, 1)),
                c = cos(angle),
                s = sin(angle);
              p.assign(
                center.add(
                  vec2(offset.x.mul(c).sub(offset.y.mul(s)), offset.x.mul(s).add(offset.y.mul(c))),
                ),
              );
            });
          });
        });
      });
    });
    const q = p.add(origin).div(controls.logicalResolution),
      sampleUv = vec2(q.x, q.y.oneMinus());
    const inside = q.x
      .greaterThanEqual(0)
      .and(q.y.greaterThanEqual(0))
      .and(q.x.lessThanEqual(1))
      .and(q.y.lessThanEqual(1));
    return inside.select(sampleEffect(source, controls, clamp(sampleUv, 0, 1)), vec4(0));
  })();
}
