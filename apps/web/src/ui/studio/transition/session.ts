import type { EnginePort } from "@musart/core";
import type { WorkspaceMode } from "../../../services/projects/preferences/model";
import { WorkspaceTransition } from "./controller";
import { createWorkspaceChromeMotion, createWorkspaceReadiness } from "./presentation";

/** Deferred presentation ports never inspect React refs during render. */
export function createWorkspaceSession(engine: EnginePort, initial: WorkspaceMode | null) {
  let element: HTMLElement | null = null;
  let reduced = false;
  let canvasActive = true;
  const readiness = createWorkspaceReadiness(engine, () => element);
  const motion = createWorkspaceChromeMotion(
    () => element,
    () => reduced,
  );
  const transition = new WorkspaceTransition(
    initial ?? "classic",
    {
      ...motion,
      ready: (signal) => (canvasActive ? readiness.ready(signal) : Promise.resolve()),
    },
    initial === null,
  );
  return {
    transition,
    pending: readiness.pending,
    attach: (node: HTMLDivElement | null) => {
      element = node;
    },
    configure: (reduceMotion: boolean, active: boolean) => {
      reduced = reduceMotion;
      canvasActive = active;
    },
  };
}
