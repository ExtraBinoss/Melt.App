import type { RefObject } from "react";
import type { EnginePort } from "@musart/core";
import type { SceneController } from "../session/scene-controller";
import type { ViewMotion } from "../viewport/motion";
import type { WorkspaceSource } from "./workspace";
import { ArtboardHeadings } from "./ArtboardHeadings";
import { ArtboardModeFooter } from "./ArtboardModeFooter";
import { AddArtboardOverlay } from "./AddArtboardOverlay";

export function ArtboardControls({
  engine,
  controller,
  workspace,
  view,
  viewport,
  onError,
}: {
  engine: EnginePort;
  controller: SceneController;
  workspace: WorkspaceSource;
  view: ViewMotion;
  viewport: RefObject<HTMLDivElement | null>;
  onError?: (message: string) => void;
}) {
  const layout = workspace.read(),
    shown = view.read();
  return (
    <>
      <ArtboardHeadings
        engine={engine}
        workspace={layout}
        activeId={engine.getSnapshot().pageId}
        view={shown}
        onError={onError}
      />
      <ArtboardModeFooter engine={engine} workspace={layout} view={shown} />
      <AddArtboardOverlay
        engine={engine}
        controller={controller}
        workspace={workspace}
        viewport={viewport}
        viewSource={view}
        onError={onError}
      />
    </>
  );
}
