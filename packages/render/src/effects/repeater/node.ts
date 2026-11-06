import { Fn, If, cos, float, floor, max, mix, mod, pow, sin, uv, vec2, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { authoredPixelDown, transportUv } from "../shared/coordinates";
import { samplePremultiplied } from "../shared/premultiplied-sample";
import { mixEffectCoverage } from "../shared/compositing/node";

const MAX_COPIES = 16;
/** Copies upstream GPU paint, without cloning or mutating the editable source layer. */
export function repeaterNode(context: EffectNodeContext) {
  const { controls, source } = context,
    u = controls.parameters,
    p = uv(),
    original = sampleEffect(source, controls, p),
    center = controls.contentResolution.mul(0.5),
    pixel = authoredPixelDown(controls, p),
    direction = u.angle!.mul(Math.PI / 180);
  const processed = Fn(() => {
    const result = vec4(original.rgb.mul(original.a), original.a).toVar();
    for (let i = 1; i < MAX_COPIES; i += 1) {
      If(u.count!.greaterThan(i), () => {
        const index = float(i),
          grid = vec2(
            mod(index, max(1, u.columns!)).mul(u.spacingX!),
            floor(index.div(max(1, u.columns!))).mul(u.spacingY!),
          ),
          offset = mix(vec2(index.mul(u.spacingX!), 0), grid, float(u.layout!.equal(1))),
          rotated = vec2(
            offset.x.mul(cos(direction)).sub(offset.y.mul(sin(direction))),
            offset.x.mul(sin(direction)).add(offset.y.mul(cos(direction))),
          ),
          ringAngle = index
            .sub(1)
            .div(max(1, u.count!.sub(1)))
            .mul(2 * Math.PI)
            .add(direction),
          translation = mix(
            rotated,
            vec2(cos(ringAngle), sin(ringAngle)).mul(u.radius!),
            float(u.layout!.equal(2)),
          ),
          local = pixel.sub(center).sub(translation),
          angle = u.rotationStep!.mul((i * Math.PI) / 180),
          scale = max(0.05, u.scaleStep!.mul(i).add(1)),
          // Inverse of the authored Y-down copy transform.
          at = vec2(
            local.x.mul(cos(angle)).add(local.y.mul(sin(angle))),
            local.y.mul(cos(angle)).sub(local.x.mul(sin(angle))),
          )
            .div(scale)
            .add(center),
          ownerUv = at.div(controls.contentResolution),
          coord = transportUv(controls, vec2(ownerUv.x, ownerUv.y.oneMinus())),
          sample = samplePremultiplied(context, coord).mul(pow(u.copyOpacity!, i)).toVar();
        result.assign(sample.add(result.mul(sample.a.oneMinus())));
      });
    }
    return vec4(result.rgb.div(max(result.a, 0.000001)), result.a);
  })();
  return mixEffectCoverage(original, processed, controls.amount);
}
