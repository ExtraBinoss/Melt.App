import { memo, useCallback, type ReactNode } from "react";
import { useSetAtom } from "jotai";
import { Crosshair, ImagePlus, Scan, SlidersHorizontal, Type, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import type { TaskRunner } from "../../components/projects/ProjectDialog";
import { toolAtom } from "../../state/session/editor";
import { Button } from "../../components/ui/button";
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
        <span className="studio-quick-label">{t("add")}</span>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("text")}
          onClick={() =>
            run(() => {
              insertSpatialObject(engine, "text", t("newText"));
              setTool("pointer");
            })
          }
        >
          <Type size={17} />
          <span>{t("text")}</span>
        </Button>
        {library ?? (
          <>
            <SpatialLibrary engine={engine} />
            <ShapeToolSlot engine={engine} />
          </>
        )}
        <Button variant="ghost" size="sm" aria-label={t("media")} onClick={onImport}>
          <ImagePlus size={17} />
          <span>{t("media")}</span>
        </Button>
        <div className="studio-view-shortcuts">
          <IconButton label={common("fitView")} onClick={() => viewport.run("fit")}>
            <Scan size={15} />
          </IconButton>
          <Button
            variant="ghost"
            size="sm"
            aria-label={common("resetView")}
            onClick={() => viewport.run("reset")}
          >
            100%
          </Button>
          <IconButton label={common("recenterView")} onClick={() => viewport.run("recenter")}>
            <Crosshair size={15} />
          </IconButton>
        </div>
        {commandControl}
      </nav>
      <div className="studio-actions" data-canvas-control>
        <Popover modal={false}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="studio-surface"
              aria-label={t("advanced")}
            >
              <SlidersHorizontal size={17} />
            </Button>
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
          <Button className="studio-export" onClick={onExport}>
            <Upload size={15} />
            <span>{t("export")}</span>
          </Button>
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
