import { compareMotionTime, motionTimeToSeconds, type MotionTime } from "@musart/core";

/** Interactive surfaces sample the same continuous phase; only offline encoding quantizes frames. */
export function samplePlaybackPhase(
  elapsed: number,
  duration: MotionTime,
  mode: "once" | "loop" | "pingPong" = "loop",
): { time: MotionTime; playing: boolean } {
  const end = motionTimeToSeconds(duration);
  if (!Number.isFinite(elapsed) || elapsed < 0 || !Number.isFinite(end) || end <= 0)
    throw new RangeError("Invalid playback phase.");
  const playing = mode !== "once" || elapsed < end;
  let seconds = elapsed;
  if (mode === "once") seconds = Math.min(elapsed, end);
  else if (mode === "loop") seconds = elapsed % end;
  else {
    const phase = elapsed % (end * 2);
    seconds = phase > end ? end * 2 - phase : phase;
  }
  let time: MotionTime = { value: Math.round(seconds * 1_000_000), rate: 1_000_000 };
  if (compareMotionTime(time, duration) >= 0)
    time =
      mode === "loop"
        ? { value: Math.max(0, Math.ceil(end * 1_000_000) - 1), rate: 1_000_000 }
        : duration;
  return { time: Object.freeze(time), playing };
}
