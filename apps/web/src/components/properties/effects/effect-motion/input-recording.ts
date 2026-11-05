import type { MotionInputEvent } from "@musart/core";

/** Keep native input intent; RAF presentation never appends document events. */
export function appendMotionInput(events: MotionInputEvent[], event: MotionInputEvent): boolean {
  const previous = events.at(-1);
  if (
    previous?.kind === "pointer" &&
    event.kind === "pointer" &&
    previous.dragging === event.dragging &&
    previous.x === event.x &&
    previous.y === event.y
  )
    return true;
  if (events.length >= 512) return false;
  events.push(event);
  // Elide a redundant point on a straight, constant-speed input segment.
  if (events.length >= 3) {
    const a = events.at(-3)!,
      b = events.at(-2)!,
      c = events.at(-1)!;
    if (
      a.kind === "pointer" &&
      b.kind === "pointer" &&
      c.kind === "pointer" &&
      a.dragging === b.dragging &&
      b.dragging === c.dragging
    ) {
      const seconds = (input: MotionInputEvent) => input.at.value / input.at.rate;
      const duration = seconds(c) - seconds(a);
      const progress = duration > 0 ? (seconds(b) - seconds(a)) / duration : 1;
      const forward = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) >= 0;
      const monotone = (b.x - a.x) * (c.x - b.x) >= 0 && (b.y - a.y) * (c.y - b.y) >= 0;
      if (
        forward &&
        monotone &&
        progress > 0 &&
        progress < 1 &&
        Math.hypot(b.x - a.x - (c.x - a.x) * progress, b.y - a.y - (c.y - a.y) * progress) < 0.002
      )
        events.splice(events.length - 2, 1);
    }
  }
  return true;
}
