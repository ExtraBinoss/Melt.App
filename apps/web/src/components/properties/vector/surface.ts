import type { RefObject } from "react";
import type { EnginePort } from "@musart/core";
import type { ViewSource } from "../../../canvas/viewport/motion";
import type { SceneController } from "../../../canvas/session/scene-controller";
export interface VectorSurface {
  engine: EnginePort;
  controller: SceneController;
  view: ViewSource;
  viewport: RefObject<HTMLDivElement | null>;
  layerId: string;
}
