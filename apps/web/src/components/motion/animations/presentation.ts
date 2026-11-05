import { atom, createStore as createAtomStore, useAtomValue } from "jotai";
import type { EnginePort, Project, SceneAnimationOwner } from "@musart/core";

export interface AnimationEditorRequest {
  readonly token: number;
  readonly animationId: string;
  readonly project: Project;
  readonly pageId: string;
  readonly owner: SceneAnimationOwner;
}

interface Presentation {
  details: boolean;
  selected: string | null;
}
const stores = new WeakMap<EnginePort, ReturnType<typeof createStore>>();
function createStore(engine: EnginePort) {
  const store = createAtomStore();
  const stateAtom = atom<Presentation>({ details: false, selected: null });
  const detailsAtom = atom((get) => get(stateAtom).details);
  stateAtom.onMount = () => {
    const stop = engine.subscribe(syncSelection);
    syncSelection();
    return stop;
  };
  const editorListeners = new Set<(animationId: string) => void>();
  let pendingEditor: AnimationEditorRequest | null = null;
  let editorSequence = 0;
  let stopEditorWatch: (() => void) | undefined;
  function syncSelection() {
    const state = store.get(stateAtom);
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
      store.set(stateAtom, { ...state, selected: null });
    }
  }
  function clearEditorRequest() {
    pendingEditor = null;
    stopEditorWatch?.();
    stopEditorWatch = undefined;
  }
  function readEditorRequest() {
    const snapshot = engine.getSnapshot();
    if (
      pendingEditor &&
      (snapshot.project !== pendingEditor.project ||
        snapshot.pageId !== pendingEditor.pageId ||
        !snapshot.project.pages
          .find((page) => page.id === snapshot.pageId)
          ?.motion?.sceneAnimations?.some(
            (animation) => animation.id === pendingEditor!.animationId,
          ))
    )
      clearEditorRequest();
    return pendingEditor;
  }
  return {
    store,
    stateAtom,
    detailsAtom,
    read: () => store.get(stateAtom),
    readEditorRequest,
    consumeEditorRequest(request: AnimationEditorRequest) {
      if (readEditorRequest() !== request) return false;
      clearEditorRequest();
      return true;
    },
    requestEditor(animationId: string) {
      const state = store.get(stateAtom);
      const snapshot = engine.getSnapshot();
      if (
        !snapshot.project.pages
          .find((page) => page.id === snapshot.pageId)
          ?.motion?.sceneAnimations?.some((animation) => animation.id === animationId)
      )
        return;
      if (state.selected !== animationId) {
        store.set(stateAtom, { ...state, selected: animationId });
      }
      const animation = snapshot.project.pages
        .find((page) => page.id === snapshot.pageId)!
        .motion!.sceneAnimations!.find((item) => item.id === animationId)!;
      clearEditorRequest();
      pendingEditor = {
        token: ++editorSequence,
        animationId,
        project: snapshot.project,
        pageId: snapshot.pageId,
        owner: animation.owner,
      };
      stopEditorWatch = engine.subscribe(() => {
        readEditorRequest();
      });
      for (const listener of editorListeners) listener(animationId);
    },
    takeEditorRequest() {
      const request = readEditorRequest();
      clearEditorRequest();
      return request?.animationId ?? null;
    },
    subscribeEditor(listener: (animationId: string) => void) {
      editorListeners.add(listener);
      return () => {
        editorListeners.delete(listener);
      };
    },
    subscribe(this: void, listener: () => void) {
      return store.sub(stateAtom, listener);
    },
    set(patch: Partial<Presentation>) {
      const state = store.get(stateAtom);
      const next = { ...state, ...patch };
      if (next.details === state.details && next.selected === state.selected) return;
      store.set(stateAtom, next);
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
  return useAtomValue(store.stateAtom, { store: store.store });
}

/** Selection changes never rebuild the dock or timeline controls. */
export function useAnimationDetails(engine: EnginePort) {
  const state = animationPresentation(engine);
  return useAtomValue(state.detailsAtom, { store: state.store });
}
