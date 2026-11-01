import type { Node } from "three/webgpu";
import { Fn, Loop, cos, exp, float, max, sin, uv, vec2, vec4 } from "three/tsl";
import type { EffectNodeContext } from "../shared/context";
import { samplePremultiplied } from "../shared/premultiplied-sample";
import { protectBlur } from "./protection";

/** Convert a weighted premultiplied sum back to the effect pipeline's straight RGBA. */
export function normalizedBlur(total: Node<"vec4">, weight: Node<"float">) {
  return vec4(total.rgb.div(max(total.a, 0.000001)), total.a.div(max(weight, 0.000001)));
}

/** Uniform box support has the same authored standard deviation as the Gaussian. */
export function boxAxis(context: EffectNodeContext, axis: "x" | "y") {
  return Fn(() => {
    const direction = axis === "x" ? vec2(1, 0) : vec2(0, 1);
    const step = direction
      .mul(context.controls.amount.mul(context.controls.scale).mul(Math.sqrt(3)))
      .div(context.controls.logicalResolution);
    const total = vec4(0).toVar();
    Loop({ start: 0, end: 33, type: "int" }, ({ i }) => {
      total.addAssign(samplePremultiplied(context, uv().add(step.mul(float(i).div(16).sub(1)))));
    });
    return normalizedBlur(total, float(33));
  })();
}
export function boxHorizontalNode(context: EffectNodeContext) {
  return boxAxis(context, "x");
}
export function boxVerticalNode(context: EffectNodeContext) {
  return protectBlur(context, boxAxis(context, "y"));
}

/** A spatial line convolution, with an authored angle; this has no temporal history. */
export function directionalNode(context: EffectNodeContext) {
  const radians = context.controls.parameters.angle!.mul(-Math.PI / 180);
  return protectBlur(
    context,
    Fn(() => {
      const step = vec2(cos(radians), sin(radians))
        .mul(context.controls.amount.mul(context.controls.scale).mul(Math.sqrt(3)))
        .div(context.controls.logicalResolution);
      const total = vec4(0).toVar();
      Loop({ start: 0, end: 33, type: "int" }, ({ i }) => {
        total.addAssign(samplePremultiplied(context, uv().add(step.mul(float(i).div(16).sub(1)))));
      });
      return normalizedBlur(total, float(33));
    })(),
  );
}

/** Joint spatial/range weighting in premultiplied linear RGBA preserves color and alpha edges. */
export function bilateralNode(context: EffectNodeContext) {
  return protectBlur(
    context,
    Fn(() => {
      const center = samplePremultiplied(context, uv()).toVar();
      const radius = context.controls.amount.mul(context.controls.scale);
      const sigma = context.controls.parameters.rangeSigma!;
      const total = vec4(0).toVar(),
        weights = float(0).toVar();
      Loop({ start: 0, end: 7, type: "int" }, { start: 0, end: 7, type: "int" }, ({ i, j }) => {
        const offset = vec2(float(i).sub(3), float(j).sub(3));
        const sample = samplePremultiplied(
          context,
          uv().add(offset.mul(radius).div(context.controls.logicalResolution)),
        ).toVar();
        const delta = sample.sub(center);
        const range = delta.dot(delta).div(sigma.mul(sigma).mul(-2));
        const spatial = offset.dot(offset).mul(-0.5);
        const weight = exp(range.add(spatial));
        total.addAssign(sample.mul(weight));
        weights.addAssign(weight);
      });
      return normalizedBlur(total, weights);
    })(),
  );
}
