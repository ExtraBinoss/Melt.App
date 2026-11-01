import type { EffectNodeContext } from "../shared/context";
import { gaussianAxis } from "./gaussian";
import { protectBlur } from "./protection";
export function blurNode(context: EffectNodeContext) {
  return gaussianAxis(context, "x", context.controls.amount.mul(context.controls.scale));
}
export function blurVerticalNode(context: EffectNodeContext) {
  return protectBlur(
    context,
    gaussianAxis(context, "y", context.controls.amount.mul(context.controls.scale)),
  );
}
