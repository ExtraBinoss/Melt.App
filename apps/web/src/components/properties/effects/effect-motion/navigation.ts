import { useMemo, useEffect, useEffectEvent } from "react";
import { atom, createStore } from "jotai";
import type { EnginePort, Project } from "@musart/core";
export interface EffectMotionRequest {
  readonly project: Project;
  layersOnly?: boolean;
  effectId: string;
  pageId: string;
  animationId?: string;
  action?: "automatic" | "interactive";
}
const stores = new WeakMap<EnginePort, ReturnType<typeof makeStore>>();
function makeStore(engine: EnginePort) {
  const store = createStore(),
    request = atom<EffectMotionRequest | null>(null);
  return {
    store,
    request,
    open: (value: Omit<EffectMotionRequest, "project">) =>
      store.set(request, { ...value, project: engine.getSnapshot().project }),
    clear: () => store.set(request, null),
  };
}
export function effectMotionNavigation(engine: EnginePort) {
  let state = stores.get(engine);
  if (!state) {
    state = makeStore(engine);
    stores.set(engine, state);
  }
  return state;
}
export function useEffectMotionRequest(
  engine: EnginePort,
  effectId: string,
  onRequest: (request: EffectMotionRequest) => void,
) {
  const state = effectMotionNavigation(engine);
  const ownRequest = useMemo(
    () =>
      atom((get) => {
        const value = get(state.request);
        return value?.effectId === effectId ? value : null;
      }),
    [state, effectId],
  );
  const reveal = useEffectEvent(onRequest);
  useEffect(() => {
    const notify = () => {
      const value = state.store.get(ownRequest);
      if (value && value.project === engine.getSnapshot().project) reveal(value);
      else if (value) state.clear();
    };
    const stop = state.store.sub(ownRequest, notify);
    notify();
    return stop;
  }, [state, ownRequest, engine]);
}
