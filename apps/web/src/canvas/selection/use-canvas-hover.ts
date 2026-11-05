import { useEffect, type RefObject } from "react";
import type { EnginePort } from "@musart/core";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import { installCanvasHover } from "./canvas-hover";

export function useCanvasHover(
  viewport: RefObject<HTMLDivElement | null>,
  engine: EnginePort,
  controller: SceneController,
  view: ViewSource,
  enabled: boolean,
  gesture: RefObject<unknown>,
  studio = false,
) {
  useEffect(() => {
    const node = viewport.current;
    if (!node || !enabled) return;
    return installCanvasHover(
      node,
      engine,
      controller,
      view,
      () => !!gesture.current,
      undefined,
      studio,
    );
  }, [viewport, engine, controller, view, enabled, gesture, studio]);
}
