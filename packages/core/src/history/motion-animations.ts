import type { MotionAnimation } from "../motion/animations/model";
import type { SceneMotionAnimation } from "../motion/scene/animations/model";
import { motionOwner, watchFields, type HistoryContext, type HistoryHandlers } from "./collector";
function find(
  context: HistoryContext,
  animationId: string,
): MotionAnimation | SceneMotionAnimation | undefined {
  return (
    context.page.motion?.sceneAnimations?.find((item) => item.id === animationId) ??
    context.page.motion?.tracks
      .flatMap((track) => track.animations ?? [])
      .find((item) => item.id === animationId)
  );
}
export function captureAnimation(
  context: HistoryContext,
  animationId: string,
  patch: Extract<import("../document/model").Command, { type: "updateMotionAnimation" }>["patch"],
): void {
  const read = () => find(context, animationId);
  const old = read();
  if (!old) return;
  const owner = motionOwner(context.page, "animation", { animationId });
  watchFields(context, owner, ["start", "duration", "strength", "enabled"], read, {
    ...old,
    ...patch,
  });
  if (patch.preset) {
    watchFields(context, owner, ["preset"], () => ({ preset: read()?.preset.name }), {
      preset: patch.preset.name,
    });
    context.history.action("animationChannels", owner);
  }
}
export const updateMotionAnimation: HistoryHandlers["updateMotionAnimation"] = (context, command) =>
  captureAnimation(context, command.animationId, command.patch);
export const addMotionAnimation: HistoryHandlers["addMotionAnimation"] =
  (context, command) => () => {
    const animation =
      "owner" in command
        ? context.page.motion?.sceneAnimations?.at(-1)
        : context.page.motion?.tracks
            .find((track) => track.id === command.trackId)
            ?.animations?.at(-1);
    context.history.action(
      "add",
      motionOwner(context.page, "animation", {
        animationId: animation?.id,
        ...("trackId" in command ? { trackId: command.trackId } : {}),
      }),
    );
  };
