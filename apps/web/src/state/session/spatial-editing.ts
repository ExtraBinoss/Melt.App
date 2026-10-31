import { atom } from "jotai";
import type { EnginePort } from "@musart/core";
export type SpatialEditTool = "translate" | "rotate" | "scale";
export interface SpatialEditTarget {
  projectId: string;
  pageId: string;
  layerId: string;
  tool: SpatialEditTool;
}
const sessions = new WeakMap<EnginePort, ReturnType<typeof createSession>>();
const createSession = () => atom<SpatialEditTarget | null>(null);
export function spatialEditingAtom(engine: EnginePort) {
  let value = sessions.get(engine);
  if (!value) {
    value = createSession();
    sessions.set(engine, value);
  }
  return value;
}
export function spatialEditingTarget(engine: EnginePort, layerId: string): SpatialEditTarget {
  const snapshot = engine.getSnapshot();
  return { projectId: snapshot.project.id, pageId: snapshot.pageId, layerId, tool: "translate" };
}
