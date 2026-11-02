import type { RefObject } from "react";
import type { EnginePort } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import { PixelSelectionOverlay } from "./PixelSelectionOverlay";
import { ObjectSelectionSurface } from "./ObjectSelectionSurface";
export function SelectionTools({
  engine,
  services,
  tool,
  controller,
  viewSource,
  viewport,
  onError,
}: {
  engine: EnginePort;
  services?: Pick<EditorServices, "pixelSelection" | "objectSelection">;
  tool: string;
  controller: SceneController;
  viewSource: ViewSource;
  viewport: RefObject<HTMLDivElement | null>;
  onError?: (message: string) => void;
}) {
  return (
    <>
      <PixelSelectionOverlay
        port={services?.pixelSelection}
        controller={controller}
        viewSource={viewSource}
        viewport={viewport}
      />
      <ObjectSelectionSurface
        port={services?.objectSelection}
        engine={engine}
        controller={controller}
        viewSource={viewSource}
        viewport={viewport}
        enabled={tool === "segment"}
        onError={onError}
      />
    </>
  );
}

export { PixelSelectionToolbar } from "./PixelSelectionOverlay";
