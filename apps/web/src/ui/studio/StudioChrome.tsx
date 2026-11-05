import { memo, useCallback, type ReactNode } from "react";
import { useSetAtom } from "jotai";
import { Crosshair, Download, ImagePlus, SlidersHorizontal, Type } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import type { TaskRunner } from "../../components/projects/ProjectDialog";
import { toolAtom } from "../../state/session/editor";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { SpatialLibrary } from "../../components/spatial/SpatialLibrary";
import { ShapeToolSlot } from "../../components/assets/ShapeToolSlot";
import { insertSpatialObject } from "../../services/assets/spatial-import";
import { StudioCompositions } from "./panels/StudioCompositions";
import { StudioMaterial } from "./panels/StudioMaterial";
import { StudioEnvironment } from "./panels/StudioEnvironment";
import { StudioAdvanced } from "./panels/StudioAdvanced";
import { StudioObjectBar } from "./panels/StudioObjectBar";
import { createViewportActions } from "../../canvas/session/viewport-actions";
import { StudioGuides } from "./framing/StudioGuides";
import { StudioEffects } from "./effects/StudioEffects";
import { IconButton } from "../../components/shared/IconButton";
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
  const setTool = useSetAtom(toolAtom);
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
          <IconButton
            label={t("text")}
            tooltipSide="bottom"
            onClick={() =>
              run(() => {
                insertSpatialObject(engine, "text", t("newText"));
                setTool("pointer");
              })
            }
          >
            <Type size={17} />
          </IconButton>
          {library ?? (
            <>
              <SpatialLibrary engine={engine} tooltipSide="bottom" />
              <ShapeToolSlot engine={engine} tooltipSide="bottom" />
            </>
          )}
          <IconButton label={t("media")} tooltipSide="bottom" onClick={onImport}>
            <ImagePlus size={17} />
          </IconButton>
        </div>
        <span className="studio-toolbar-divider" aria-hidden />
        <div className="studio-tool-group">
          <StudioEffects engine={engine} run={run} />
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
        <Popover modal={false}>
          <PopoverTrigger asChild>
            <IconButton label={t("advanced")} tooltipSide="bottom" className="studio-surface">
              <SlidersHorizontal size={17} />
            </IconButton>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="end"
            collisionPadding={12}
            className="studio-advanced-popover"
            data-canvas-control
            aria-label={t("advanced")}
            initialFocus="content"
          >
            <StudioAdvanced engine={engine} run={run} />
          </PopoverContent>
        </Popover>
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
      <StudioMaterial engine={engine} run={run} />
      <StudioObjectBar engine={engine} run={run} />
      <StudioEnvironment engine={engine} run={run} />
      {background && (
        <div className="studio-background-dock" data-canvas-control>
          {background}
        </div>
      )}
    </div>
  );
});
