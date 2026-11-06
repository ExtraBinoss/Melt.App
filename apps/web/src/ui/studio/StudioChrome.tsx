import { memo, useCallback, type ReactNode } from "react";
import { Crosshair, Download, ImagePlus, PanelRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import type { TaskRunner } from "../../components/projects/ProjectDialog";
import { TextTool } from "../../components/text/TextTool";
import { StudioPropertyPopover } from "./controls/StudioPropertyPopover";
import { ObjectLibrary } from "../../components/spatial/objects/ObjectLibrary";
import { StudioCompositions } from "./panels/StudioCompositions";
import { MaterialControl } from "../../components/spatial/MaterialControl";
import { EnvironmentControl } from "../../components/spatial/EnvironmentControl";
import { StudioAdvanced } from "./panels/StudioAdvanced";
import { useSceneAnimationNavigation } from "./panels/use-scene-animation-navigation";
import { StudioObjectBar } from "./panels/StudioObjectBar";
import { createViewportActions } from "../../canvas/session/viewport-actions";
import { StudioGuides } from "./framing/StudioGuides";
import { StudioEffects } from "./effects/StudioEffects";
import { IconButton } from "../../components/shared/IconButton";
import { ToolSettings } from "../../components/toolbar/ToolSettings";
import "./messages";
import "./studio-chrome.css";

export interface StudioChromeProps {
  engine: EnginePort;
  services: EditorServices;
  onTask: TaskRunner;
  onImport: () => void;
  onExport: () => void;
  exportControl?: ReactNode;
  commandControl?: ReactNode;
  background?: ReactNode;
  library?: ReactNode;
}

/** Overlay controls for the existing workspace. It owns no canvas or renderer. */
export const StudioChrome = memo(function StudioChrome({
  engine,
  services,
  onTask,
  onImport,
  onExport,
  exportControl,
  commandControl,
  background,
  library,
}: StudioChromeProps) {
  const { t } = useTranslation("studioChrome");
  const { t: common } = useTranslation();
  const viewport = createViewportActions(engine);
  const advancedRequest = useSceneAnimationNavigation(engine);
  const run = useCallback(
    (task: () => void) => {
      void onTask(task);
    },
    [onTask],
  );
  return (
    <div className="studio-chrome" data-studio-chrome>
      <nav className="studio-quick-add studio-surface" aria-label={t("add")} data-canvas-control>
        <div className="studio-tool-group">
          <TextTool defaultMode="3d" tooltipSide="bottom" />
          {library ?? <ObjectLibrary engine={engine} onTask={onTask} tooltipSide="bottom" />}
          <IconButton label={t("media")} tooltipSide="bottom" onClick={onImport}>
            <ImagePlus size={17} />
          </IconButton>
        </div>
        <span className="studio-toolbar-divider" aria-hidden />
        <div className="studio-tool-group studio-view-shortcuts">
          <IconButton
            label={common("recenterView")}
            tooltipSide="bottom"
            onClick={() => viewport.run("recenter")}
          >
            <Crosshair size={15} />
          </IconButton>
          <StudioGuides engine={engine} />
          {commandControl}
        </div>
      </nav>
      <div className="studio-actions" data-canvas-control>
        <StudioEffects engine={engine} services={services} run={run} />
        <StudioPropertyPopover
          openRequest={advancedRequest}
          trigger={
            <IconButton label={t("advanced")} tooltipSide="bottom" className="studio-surface">
              <PanelRight size={17} />
            </IconButton>
          }
          side="bottom"
          align="end"
          collisionPadding={12}
          className="studio-advanced-popover"
          data-canvas-control
          aria-label={t("advanced")}
          initialFocus="content"
        >
          <StudioAdvanced engine={engine} run={run} />
        </StudioPropertyPopover>
        {exportControl ?? (
          <IconButton
            label={t("export")}
            tooltipSide="bottom"
            variant="default"
            className="studio-export"
            onClick={onExport}
          >
            <Download size={17} />
          </IconButton>
        )}
      </div>
      <StudioCompositions engine={engine} services={services} run={run} />
      <ToolSettings engine={engine} services={services} onTask={onTask} />
      <MaterialControl engine={engine} run={run} />
      <StudioObjectBar engine={engine} run={run} />
      <EnvironmentControl engine={engine} run={run} />
      {background && (
        <div className="studio-background-dock" data-canvas-control>
          {background}
        </div>
      )}
    </div>
  );
});
