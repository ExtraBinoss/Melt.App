import type { EnginePort } from "@musart/core";
import { getCanonicalPresentation } from "../../state/session/canonical-presentation";
import { effectPreviewActivity } from "../../state/session/effect-preview";
import { createMotionTransport } from "../motion/transport";

const activities = new WeakMap<EnginePort, ReturnType<typeof makeRenderActivity>>();
/** One engine-scoped admission signal; optional GPU work yields to the visible canvas. */
export function createRenderActivity(engine: EnginePort) {
  let activity = activities.get(engine);
  if (!activity) {
    activity = makeRenderActivity(engine);
    activities.set(engine, activity);
  }
  return activity;
}
function makeRenderActivity(engine: EnginePort) {
  const effects = effectPreviewActivity(engine);
  const motion = createMotionTransport(engine);
  const presentation = getCanonicalPresentation(engine);
  let opening: { token: symbol; sequence: number } | null = null;
  const listeners = new Set<() => void>();
  let stops: (() => void)[] = [];
  const busy = () => {
    const snapshot = engine.getSnapshot();
    const origin = { projectId: snapshot.project.id, revision: snapshot.revision };
    const state = presentation.read();
    const ready = presentation.ready(origin);
    if (opening && ready && (state.presented?.sequence ?? 0) > opening.sequence) opening = null;
    return (
      Boolean(opening) || effects.busy() || motion.read().playing || (state.available && !ready)
    );
  };
  let previous = busy();
  const notify = () => {
    const next = busy();
    if (next === previous) return;
    previous = next;
    for (const listener of listeners) listener();
  };
  return {
    busy,
    /** Cancellation belongs to a failed open/unmount; success releases on a real presentation. */
    holdUntilPresented() {
      const token = Symbol("opening-canvas");
      opening = { token, sequence: presentation.read().presented?.sequence ?? 0 };
      notify();
      return () => {
        if (opening?.token !== token) return;
        opening = null;
        notify();
      };
    },
    subscribe(listener: () => void): () => void {
      if (!listeners.size) {
        previous = busy();
        stops = [
          effects.subscribe(notify),
          motion.subscribe(notify),
          presentation.subscribe(notify),
          engine.subscribe(notify),
        ];
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          for (const stop of stops) stop();
          stops = [];
        }
      };
    },
  };
}
