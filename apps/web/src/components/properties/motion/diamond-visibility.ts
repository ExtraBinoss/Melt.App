import type { EnginePort } from "@musart/core";
import { animationPresentation } from "../../motion/animations/presentation";

const stores = new WeakMap<EnginePort, ReturnType<typeof createVisibility>>();

/** One mode/details subscription for every mounted field; playhead changes do no hidden work. */
export function motionDiamondVisibility(engine: EnginePort) {
  let store = stores.get(engine);
  if (!store) {
    store = createVisibility(engine);
    stores.set(engine, store);
  }
  return store;
}

function createVisibility(engine: EnginePort) {
  const presentation = animationPresentation(engine);
  const readCurrent = () => {
    if (!presentation.read().details) return false;
    const snapshot = engine.getSnapshot();
    return (
      snapshot.project.pages.find((page) => page.id === snapshot.pageId)?.motion?.mode === "motion"
    );
  };
  let visible = readCurrent();
  const listeners = new Set<() => void>();
  let stops: (() => void)[] = [];
  const update = () => {
    const next = readCurrent();
    if (next === visible) return;
    visible = next;
    for (const listener of listeners) listener();
  };
  return {
    read: () => (listeners.size ? visible : readCurrent()),
    subscribe(this: void, listener: () => void) {
      if (!listeners.size) {
        visible = readCurrent();
        stops = [engine.subscribe(update), presentation.subscribe(update)];
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
