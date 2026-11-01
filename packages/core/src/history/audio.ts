import { watchFields, type HistoryContext, type HistoryHandlers } from "./collector";
import type { MotionAudioTrack } from "../motion/audio/model";
import { addMotionTime, subtractMotionTime, compareMotionTime } from "../motion/time";
import { DEFAULT_AUDIO_PROCESSING } from "../motion/audio/processing";
const fields = [
  "name",
  "mute",
  "volume",
  "start",
  "end",
  "sourceIn",
  "fadeIn",
  "fadeOut",
  "reverb.mix",
  "reverb.decay",
];
function view(track: MotionAudioTrack | undefined) {
  return (
    track && {
      ...track,
      fadeIn: (track.processing ?? DEFAULT_AUDIO_PROCESSING).fadeIn,
      fadeOut: (track.processing ?? DEFAULT_AUDIO_PROCESSING).fadeOut,
      reverb: (track.processing ?? DEFAULT_AUDIO_PROCESSING).reverb,
    }
  );
}
function watchTrack(
  context: HistoryContext,
  trackId: string,
  expected: MotionAudioTrack | undefined,
): void {
  const read = () => context.page.motion?.audioTracks?.find((track) => track.id === trackId);
  watchFields(
    context,
    { kind: "audio", compositionId: context.page.id, trackId },
    fields,
    () => view(read()),
    view(expected),
  );
}
export const updateMotionAudioTrack: HistoryHandlers["updateMotionAudioTrack"] = (
  context,
  command,
) => {
  const old = context.page.motion?.audioTracks?.find((track) => track.id === command.trackId);
  watchTrack(context, command.trackId, old ? { ...old, ...command.patch } : undefined);
};
export const moveMotionAudioTrack: HistoryHandlers["moveMotionAudioTrack"] = (context, command) => {
  const old = context.page.motion?.audioTracks?.find((track) => track.id === command.trackId);
  watchTrack(
    context,
    command.trackId,
    old
      ? {
          ...old,
          start: addMotionTime(old.start, command.delta),
          end: addMotionTime(old.end, command.delta),
        }
      : undefined,
  );
};
export const setMotionAudioTrackRange: HistoryHandlers["setMotionAudioTrackRange"] = (
  context,
  command,
) => {
  const old = context.page.motion?.audioTracks?.find((track) => track.id === command.trackId);
  if (!old) return;
  const duration = subtractMotionTime(command.end, command.start);
  const processing = old.processing && {
    ...old.processing,
    fadeIn:
      compareMotionTime(old.processing.fadeIn, duration) > 0 ? duration : old.processing.fadeIn,
    fadeOut:
      compareMotionTime(old.processing.fadeOut, duration) > 0 ? duration : old.processing.fadeOut,
  };
  watchTrack(context, command.trackId, {
    ...old,
    start: command.start,
    end: command.end,
    sourceIn: addMotionTime(old.sourceIn, subtractMotionTime(command.start, old.start)),
    ...(processing ? { processing } : {}),
  });
};
