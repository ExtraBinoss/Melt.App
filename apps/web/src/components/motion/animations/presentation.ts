import { useSyncExternalStore } from "react";
import type { EnginePort } from "@musart/core";

interface Presentation {
  details: boolean;
  selected: string | null;
}
const stores = new WeakMap<EnginePort, ReturnType<typeof createStore>>();
function createStore(engine: EnginePort) {
  let state: Presentation = { details: false, selected: null };
  const listeners = new Set<() => void>();
  let stop: (() => void) | undefined;
  const emit = () => {
    for (const listener of listeners) listener();
  };
  function syncSelection() {
    if (!state.selected) return;
    const snapshot = engine.getSnapshot();
    const owner = snapshot.project.pages
      .find((page) => page.id === snapshot.pageId)
      ?.motion?.tracks.find((track) =>
        track.animations?.some((animation) => animation.id === state.selected),
      );
    if (!owner || !snapshot.selection.includes(owner.layerId)) {
      state = { ...state, selected: null };
      emit();
    }
  }
  return {
    read: () => state,
    subscribe(this: void, listener: () => void) {
      listeners.add(listener);
      if (!stop) stop = engine.subscribe(syncSelection);
      syncSelection();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stop?.();
          stop = undefined;
        }
      };
    },
    set(patch: Partial<Presentation>) {
      const next = { ...state, ...patch };
      if (next.details === state.details && next.selected === state.selected) return;
      state = next;
      emit();
    },
  };
}
export function animationPresentation(engine: EnginePort) {
  let store = stores.get(engine);
  if (!store) {
    store = createStore(engine);
    stores.set(engine, store);
  }
  return store;
}
export function useAnimationPresentation(engine: EnginePort) {
  const store = animationPresentation(engine);
  return useSyncExternalStore(store.subscribe, store.read, store.read);
}
