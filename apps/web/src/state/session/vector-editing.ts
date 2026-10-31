import { atom } from "jotai";
import type { EnginePort } from "@musart/core";
const sessions = new WeakMap<EnginePort, ReturnType<typeof createSession>>();
export interface VectorEditTarget {
  projectId: string;
  pageId: string;
  layerId: string;
}
const createSession = () => atom<VectorEditTarget | null>(null);
export function vectorEditingTarget(engine: EnginePort, layerId: string): VectorEditTarget {
  const snapshot = engine.getSnapshot();
  return { projectId: snapshot.project.id, pageId: snapshot.pageId, layerId };
}
/** A UI-only mode shared by the inspector and the small canvas leaves. */
export function vectorEditingAtom(engine: EnginePort) {
  let state = sessions.get(engine);
  if (!state) {
    state = createSession();
    sessions.set(engine, state);
  }
  return state;
}
