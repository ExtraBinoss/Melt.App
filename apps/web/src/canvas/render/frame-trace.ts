import "../../services/performance/video-playback";
import { traceRenderFrame } from "@musart/render";
import type { MotionFramePlan } from "@musart/core";

export function traceCanvasFrame(
  request: {
    motionFrame?: MotionFramePlan;
    playback: boolean;
    origin?: { projectId: string };
  },
  textureId: string,
): void {
  const plan = request.motionFrame;
  if (!import.meta.env.DEV || !plan) return;
  traceRenderFrame(true, "display", {
    compositionId: plan.compositionId,
    time: plan.time,
    textureId,
    playing: request.playback,
    projectId: request.origin?.projectId,
  });
}
