import { traceRenderFrame } from "@musart/render";
import type { MotionFramePlan } from "@musart/core";

export function traceCanvasFrame(plan: MotionFramePlan | undefined, textureId: string): void {
  if (!import.meta.env.DEV || !plan) return;
  traceRenderFrame(true, "display", {
    compositionId: plan.compositionId,
    time: plan.time,
    textureId,
  });
}
