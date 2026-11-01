import { compareMotionTime, addMotionTime, motionTimeToSeconds } from "../motion/time";
import { resolveMotionOccurrence } from "../motion/occurrences";
import { animationAddress } from "../motion/animations/targets";
import { readMotionValue } from "../motion/properties/registry";
import { resolveSceneMotionProperty } from "../motion/scene/properties";
import type { MotionPropertyTarget } from "../motion/properties/model";
import type { MotionKeyframe } from "../motion/model";
import type { MotionEasing } from "../motion/easing";
import {
  motionOwner,
  readPath,
  watchFields,
  type HistoryContext,
  type HistoryHandlers,
} from "./collector";
import { historyTarget, visitKeys, type AuthoredTarget } from "./motion-targets";
export { addMotionAnimation, updateMotionAnimation } from "./motion-animations";

export const setCompositionMode: HistoryHandlers["setCompositionMode"] = (context, command) => {
  watchFields(
    context,
    motionOwner(context.page, "composition"),
    ["mode"],
    () => ({ mode: context.page.motion?.mode ?? "static" }),
    { mode: command.mode },
  );
};
export const setMotionDuration: HistoryHandlers["setMotionDuration"] = (context, command) => {
  watchFields(
    context,
    motionOwner(context.page, "composition"),
    ["duration"],
    () => context.page.motion,
    { duration: command.duration },
  );
};
/** A null end follows the composition duration; retain that effective value in notices. */
function trackRange(context: HistoryContext, trackId: string) {
  const motion = context.page.motion;
  const track = motion?.tracks.find((track) => track.id === trackId);
  return track ? { start: track.start, end: track.end ?? motion!.duration } : undefined;
}
export const setMotionTrackRange: HistoryHandlers["setMotionTrackRange"] = (context, command) => {
  const read = () => trackRange(context, command.trackId);
  watchFields(
    context,
    motionOwner(context.page, "occurrence", { trackId: command.trackId }),
    ["start", "end"],
    read,
    command,
  );
};
export const setMotionMedia: HistoryHandlers["setMotionMedia"] = (context, command) => {
  const read = () =>
    context.page.motion?.tracks.find((track) => track.id === command.trackId)?.media;
  watchFields(
    context,
    motionOwner(context.page, "occurrence", { trackId: command.trackId }),
    ["sourceIn", "mute", "volume"],
    read,
    { ...read(), ...command.patch },
  );
};
export const moveMotionTrack: HistoryHandlers["moveMotionTrack"] = (context, command) => {
  const read = () => trackRange(context, command.trackId);
  const old = read();
  if (old)
    watchFields(
      context,
      motionOwner(context.page, "occurrence", { trackId: command.trackId }),
      ["start", "end"],
      read,
      {
        start: addMotionTime(old.start, command.delta),
        end: addMotionTime(old.end ?? context.page.motion!.duration, command.delta),
      },
    );
};
function findAt(
  context: HistoryContext,
  target: AuthoredTarget,
  time: import("../motion/time").MotionTime,
  trackId?: string,
): () => MotionKeyframe | undefined {
  const address = animationAddress(target);
  if ("compositionId" in target)
    return () =>
      context.page.motion?.sceneProperties
        ?.find((property) => animationAddress(property.target) === address)
        ?.keyframes.find((key) => compareMotionTime(key.time, time) === 0);
  const track = resolveMotionOccurrence(context.page, target.layerId, trackId, time);
  return () =>
    context.page.motion?.tracks
      .find((item) => item.id === track.id)
      ?.properties.find((property) => animationAddress(property.target) === address)
      ?.keyframes.find((key) => compareMotionTime(key.time, time) === 0);
}
function easingView(easing: MotionEasing | undefined) {
  return { easing: easing?.type ?? "linear", detail: easing };
}
function captureEasing(
  context: HistoryContext,
  owner: ReturnType<typeof motionOwner>,
  read: () => MotionEasing | undefined,
  desired: MotionEasing,
): void {
  context.history.watch(
    { owner, property: "easing" },
    () => easingView(read()).easing,
    desired.type,
  );
  for (const key of ["x1", "y1", "x2", "y2", "bounce", "response"] as const)
    context.history.watch(
      { owner, property: `easing.${key}` },
      () => readPath(read(), key),
      readPath(desired, key),
    );
}
export const upsertMotionKeyframe: HistoryHandlers["upsertMotionKeyframe"] = (context, command) => {
  const target = historyTarget(context, command.target);
  if (!target) return;
  const read = findAt(context, command.target, command.time, command.trackId);
  const old = read();
  const base =
    "compositionId" in command.target
      ? resolveSceneMotionProperty(context.page, command.target)?.value
      : readMotionValue(context.page, command.target as MotionPropertyTarget);
  context.history.watch(target, () => read()?.value ?? base, command.value, "keyframe", {
    at: motionTimeToSeconds(command.time),
    trackId: command.trackId,
  });
  if (!old && Object.is(base, command.value))
    context.history.action(
      "add",
      motionOwner(context.page, "keyframe", { trackId: command.trackId }),
    );
  if (command.easing)
    captureEasing(
      context,
      motionOwner(context.page, "keyframe", { trackId: command.trackId, keyframeId: old?.id }),
      () => read()?.easing,
      command.easing,
    );
};
function captureKeys(
  context: HistoryContext,
  ids: readonly string[],
  mode: "move" | "delete",
  delta?: import("../motion/time").MotionTime,
  time?: import("../motion/time").MotionTime,
): void {
  visitKeys(context.page, new Set(ids), (reference) => {
    const key = reference.read();
    if (!key) return;
    const owner = motionOwner(context.page, "keyframe", {
      trackId: reference.trackId,
      keyframeId: reference.id,
    });
    if (mode === "delete") {
      context.history.action("delete", owner);
    } else {
      const proposed = time ?? addMotionTime(key.time, delta!);
      context.history.watch({ owner, property: "time" }, () => reference.read()?.time, proposed);
    }
  });
}
export const moveMotionKeyframe: HistoryHandlers["moveMotionKeyframe"] = (context, command) =>
  captureKeys(context, [command.keyframeId], "move", undefined, command.time);
export const moveMotionKeyframes: HistoryHandlers["moveMotionKeyframes"] = (context, command) =>
  captureKeys(context, command.keyframeIds, "move", command.delta);
export const deleteMotionKeyframe: HistoryHandlers["deleteMotionKeyframe"] = (context, command) =>
  captureKeys(context, [command.keyframeId], "delete");
export const deleteMotionKeyframes: HistoryHandlers["deleteMotionKeyframes"] = (context, command) =>
  captureKeys(context, command.keyframeIds, "delete");
