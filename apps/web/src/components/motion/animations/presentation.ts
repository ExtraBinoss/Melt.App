import { useSyncExternalStore } from "react";
import type { EnginePort, Project } from "@musart/core";

interface Presentation {
  details: boolean;
  selected: string | null;
}
const stores = new WeakMap<EnginePort, ReturnType<typeof createStore>>();
function createStore(engine: EnginePort) {
  let state: Presentation = { details: false, selected: null };
  const listeners = new Set<() => void>();
  const editorListeners = new Set<(animationId: string) => void>();
  let pendingEditor: { animationId: string; project: Project; pageId: string } | null = null;
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
    const sceneOwner = snapshot.project.pages
      .find((page) => page.id === snapshot.pageId)
      ?.motion?.sceneAnimations?.some((animation) => animation.id === state.selected);
    if (
      (!owner || !snapshot.selection.includes(owner.layerId)) &&
      (!sceneOwner || snapshot.selection.length > 0)
    ) {
      state = { ...state, selected: null };
      emit();
    }
  }
  return {
    read: () => state,
    requestEditor(animationId: string) {
      const snapshot = engine.getSnapshot();
      if (
        !snapshot.project.pages
          .find((page) => page.id === snapshot.pageId)
          ?.motion?.sceneAnimations?.some((animation) => animation.id === animationId)
      )
        return;
      if (state.selected !== animationId) {
        state = { ...state, selected: animationId };
        emit();
      }
      pendingEditor = { animationId, project: snapshot.project, pageId: snapshot.pageId };
      for (const listener of editorListeners) listener(animationId);
      if (editorListeners.size) pendingEditor = null;
    },
    takeEditorRequest() {
      const requested = pendingEditor;
      pendingEditor = null;
      const snapshot = engine.getSnapshot();
      return requested &&
        snapshot.project === requested.project &&
        snapshot.pageId === requested.pageId &&
        snapshot.project.pages
          .find((page) => page.id === snapshot.pageId)
          ?.motion?.sceneAnimations?.some((animation) => animation.id === requested.animationId)
        ? requested.animationId
        : null;
    },
    subscribeEditor(listener: (animationId: string) => void) {
      editorListeners.add(listener);
      return () => {
        editorListeners.delete(listener);
      };
    },
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
