import { ensure } from "../errors";
import type { ReplaySpec } from "./model";

const timelines = new WeakMap<ReplaySpec, ReplaySpec>();

/** Present every retained transaction in order; idle time and simultaneous bursts get equal slots. */
export function createTimelapseReplay(spec: ReplaySpec): ReplaySpec {
  const existing = timelines.get(spec);
  if (existing) return existing;
  ensure(
    Number.isFinite(spec.duration) && spec.duration >= 0,
    "INVALID_DOCUMENT",
    "Invalid replay duration",
  );
  let previous = 0;
  const duration = Math.max(1, spec.duration),
    slots = spec.events.length + 1;
  const events = spec.events.map((event, index) => {
    ensure(
      Number.isFinite(event.at) && event.at >= previous && event.at <= spec.duration,
      "INVALID_DOCUMENT",
      "Invalid replay event time",
    );
    previous = event.at;
    return { ...event, at: duration * ((index + 1) / slots) };
  });
  // The last slot holds the final stored state, including discrete text/colour/structure edits.
  const result = { ...spec, events, duration };
  timelines.set(spec, result);
  return result;
}
