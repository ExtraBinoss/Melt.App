import type { Node } from "three/webgpu";
import {
  Fn,
  abs,
  clamp,
  cos,
  dot,
  float,
  length,
  max,
  min,
  pow,
  sin,
  uv,
  vec2,
  vec4,
} from "three/tsl";
import type { Effect } from "@musart/core";
import type { EffectNodeContext } from "../shared/context";
import type { EffectStage } from "../shared/stages";
import { samplePremultiplied } from "../shared/premultiplied-sample";
import { normalizedBlur } from "./kernels";
import { blurCenter, protectBlur } from "./protection";

/** Radius field in authored coordinates, shared by each progressively filtered axis. */
function progression(context: EffectNodeContext) {
  const { controls } = context,
    p = controls.parameters;
  const delta = uv().mul(controls.logicalResolution).sub(blurCenter(context));
  const angle = p.angle!.mul(-Math.PI / 180);
  const projection = dot(delta, vec2(cos(angle), sin(angle))).div(
    max(controls.contentResolution.x, controls.contentResolution.y),
  );
  const distance = p
    .gradientShape!.equal(1)
    .select(
      length(delta).div(
        max(min(controls.contentResolution.x, controls.contentResolution.y).mul(0.5), 0.0001),
      ),
      p.gradientShape!.equal(2).select(abs(projection).mul(2), projection.add(0.5)),
    );
  const span = p.gradientEnd!.sub(p.gradientStart!);
  const denominator = span.abs().lessThan(0.0001).select(float(0.0001), span);
  const ramp = pow(clamp(distance.sub(p.gradientStart!).div(denominator), 0, 1), p.gradientPower!);
  return p.gradientInvert!.greaterThan(0).select(ramp.oneMinus(), ramp);
}

const PARTITIONS = [
  { start: 0, capacity: 4 },
  { start: 4, capacity: 12 },
  { start: 16, capacity: 48 },
  { start: 64, capacity: 192 },
  { start: 256, capacity: 153.6 },
] as const;
const weights = Array.from({ length: 9 }, (_, i) => Math.exp(-0.5 * ((i - 4) / 1.6) ** 2));
const weightSum = weights.reduce((a, b) => a + b, 0);

/** Dense fine prefilters precede wider taps. Their support sums to the admitted 3.2×scale,
 * preventing regular source replicas at large radii without a readback or mipmap owner. */
function progressiveAxis(context: EffectNodeContext, axis: "x" | "y", partition: number) {
  return Fn(() => {
    const field = progression(context).mul(context.controls.amount);
    const { start, capacity } = PARTITIONS[partition]!;
    const radius = clamp(context.controls.scale.mul(3.2).sub(start), 0, capacity).mul(field);
    const direction = axis === "x" ? vec2(1, 0) : vec2(0, 1);
    const total = vec4(0).toVar();
    for (let i = 0; i < 9; i++) {
      const offset = direction
        .mul(radius)
        .mul((i - 4) / 4)
        .div(context.controls.logicalResolution);
      total.addAssign(samplePremultiplied(context, uv().add(offset)).mul(weights[i]!));
    }
    return normalizedBlur(total, float(weightSum));
  })();
}

function partitionCount(scale: number) {
  const support = scale * 3.2;
  return support <= 4 ? 1 : support <= 16 ? 2 : support <= 64 ? 3 : support <= 256 ? 4 : 5;
}
const stages = PARTITIONS.map((_, index): readonly EffectStage[] => {
  const count = index + 1;
  return Object.freeze(
    Array.from({ length: count }, (_, partition) => [
      {
        key: `blur:progressive:${count}:${partition}:x`,
        builder: (context: EffectNodeContext) => progressiveAxis(context, "x", partition),
        final: false,
      },
      {
        key: `blur:progressive:${count}:${partition}:y`,
        builder: (context: EffectNodeContext): Node<"vec4"> =>
          partition === count - 1
            ? protectBlur(context, progressiveAxis(context, "y", partition))
            : progressiveAxis(context, "y", partition),
        final: partition === count - 1,
      },
    ]).flat(),
  );
});
export function progressiveStages(effect: Effect): readonly EffectStage[] {
  return stages[partitionCount(effect.scale) - 1]!;
}
