import { useLayoutEffect, type RefObject } from "react";
import { motionTimeToSeconds, type MotionKeyframe } from "@musart/core";
import type { TimelineGestures } from "../gestures";

/** Block bounds are another view of the existing key gesture, never a second drag controller. */
export function useBlockPreview(
  ref: RefObject<HTMLButtonElement | null>,
  keys: readonly MotionKeyframe[],
  gestures: TimelineGestures,
  scale: number,
) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !keys.length) return;
    const first = keys[0]!,
      last = keys[keys.length - 1]!;
    const start = motionTimeToSeconds(first.time),
      end = motionTimeToSeconds(last.time);
    const paint = () => {
      const preview = gestures.readPreview();
      const delta = preview?.action === "keys" ? motionTimeToSeconds(preview.delta) : 0;
      const from = start + (preview?.keyIds.has(first.id) ? delta : 0);
      const to = end + (preview?.keyIds.has(last.id) ? delta : 0);
      node.style.left = `${from * scale}px`;
      node.style.width = `${Math.max(5, (to - from) * scale)}px`;
    };
    paint();
    return gestures.subscribePreview(paint);
  }, [ref, keys, gestures, scale]);
}
