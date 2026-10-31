import type { Composition } from "../../document/model";
import { ensure } from "../../errors";
import { addMotionTime, compareMotionTime, type MotionTime } from "../time";
import type { SceneMotionPropertyTrack } from "./model";
/** Shared by batched commands and imperative keyframe previews, preserving destination easing. */
export function captureSceneMotionKeyMove(page: Composition, ids: ReadonlySet<string>) {
  const entries = (page.motion?.sceneProperties ?? []).filter((property) =>
    property.keyframes.some((key) => ids.has(key.id)),
  );
  const found = new Set(
    entries.flatMap((property) =>
      property.keyframes.filter((key) => ids.has(key.id)).map((key) => key.id),
    ),
  );
  const sample = (delta: MotionTime): Map<string, SceneMotionPropertyTrack> =>
    new Map(
      entries.map((property) => {
        const keyframes = property.keyframes
          .map((key) => (ids.has(key.id) ? { ...key, time: addMotionTime(key.time, delta) } : key))
          .sort((a, b) => compareMotionTime(a.time, b.time));
        ensure(
          keyframes.every(
            (key, index) =>
              (page.motion!.version === 2 || key.time.value >= 0) &&
              (index === 0 || compareMotionTime(keyframes[index - 1]!.time, key.time) < 0),
          ),
          "INVALID_COMMAND",
          "Invalid or occupied scene keyframe time",
        );
        return [property.id, { ...property, keyframes }];
      }),
    );
  return { entries, found, sample };
}
