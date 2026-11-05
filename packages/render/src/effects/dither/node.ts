import { authoredPixel, transportUv } from "../shared/coordinates";
import { Fn, If, clamp, dot, float, floor, max, mix, pow, uv, vec3, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { bayer4 } from "./bayer";
import { bitDitherColor } from "../bit-dither/node";

export function ditherNode(context: EffectNodeContext) {
  const { source, controls } = context;
  const u = controls.parameters;
  const position = uv();
  const sample = sampleEffect(source, controls, position);
  const color = Fn(() => {
    const result = vec3(0).toVar();
    If(u.method!.lessThan(0.5), () => {
      const cell = floor(authoredPixel(controls, position).div(controls.scale));
      const blocked = sampleEffect(
        source,
        controls,
        transportUv(controls, cell.add(0.5).mul(controls.scale).div(controls.contentResolution)),
      );
      const luma = vec3(dot(blocked.rgb, vec3(0.2126, 0.7152, 0.0722)));
      const channel = pow(
        clamp(mix(luma, blocked.rgb, controls.color).sub(0.5).mul(u.contrast!).add(0.5), 0, 1),
        float(1).div(max(0.1, u.gamma!)),
      );
      const threshold = bayer4(cell.add(controls.seed)).sub(0.5).mul(u.strength!);
      const quantized = clamp(
        floor(
          channel.mul(controls.levels).add(0.5).add(threshold).add(float(0.5).sub(u.threshold!)),
        ).div(controls.levels),
        0,
        1,
      );
      const inverted = mix(quantized, quantized.oneMinus(), u.invert!);
      result.assign(
        mix(
          mix(controls.colors.foreground!, controls.colors.background!, inverted),
          inverted,
          controls.color,
        ),
      );
    }).Else(() => {
      result.assign(
        bitDitherColor(context, { method: u.method!.sub(1), sourceColor: controls.color }),
      );
    });
    return result;
  })();
  return vec4(mix(sample.rgb, color, controls.amount), sample.a);
}
