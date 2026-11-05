import { PanelBottomOpen, PanelBottomClose, Minus, Plus } from "lucide-react";
import { useMemo } from "react";
import type { EnginePort } from "@musart/core";
import { useAtom, useAtomValue } from "jotai";
import { zoomControlsAtom } from "../../state/viewport/preferences";
import { HistoryNotice } from "../../components/notifications/history/HistoryNotice";
import { timelineOpenAtom } from "../../state/motion/timeline-state";
import "../../components/motion/messages";
import { useTranslation } from "react-i18next";
import { IconButton } from "../../components/shared/IconButton";
import { useKeybindings } from "../../state/keybindings/use-keybindings";
import { bindingLabel } from "../../components/search/shortcuts";
import { CompositionMode } from "../../components/motion/CompositionMode";
import { ModeIcon } from "../../components/motion/ModeIcon";
import { useEngineValue } from "../../state/session/editor";
import { useWorkspaceMode } from "../../ui/studio/workspace-mode";
import { createArtboardModeProjection } from "../artboards/mode-projection";
import type { View } from "./view";
import type { createViewportActions } from "../session/viewport-actions";

export function ViewportControls({
  view,
  actions,
  motionEnabled = false,
  engine,
}: {
  view: View;
  actions: ReturnType<typeof createViewportActions>;
  motionEnabled?: boolean;
  engine?: EnginePort;
}) {
  const { t } = useTranslation();
  const showZoom = useAtomValue(zoomControlsAtom);
  const [timelineOpen, setTimelineOpen] = useAtom(timelineOpenAtom);
  const bindings = useKeybindings();
  return (
    <>
      {engine && <HistoryNotice engine={engine} />}
      {showZoom && (
        <div className="canvas-controls floating-panel" data-canvas-control>
          <IconButton
            size="icon"
            tooltipSide="bottom"
            label={t("zoomOut")}
            shortcut={bindingLabel("action:zoomOut", bindings)}
            onClick={() => actions.run("zoomOut")}
          >
            <Minus size={14} />
          </IconButton>
          <IconButton
            className="canvas-zoom"
            tooltipSide="bottom"
            label={t("resetView")}
            shortcut={bindingLabel("action:reset", bindings)}
            onClick={() => actions.run("reset")}
          >
            {Math.round(view.zoom * 100)}%
          </IconButton>
          <IconButton
            size="icon"
            tooltipSide="bottom"
            label={t("zoomIn")}
            shortcut={bindingLabel("action:zoomIn", bindings)}
            onClick={() => actions.run("zoomIn")}
          >
            <Plus size={14} />
          </IconButton>
        </div>
      )}
      {engine ? (
        <EngineTimelineToggle engine={engine} />
      ) : motionEnabled ? (
        <IconButton
          className="canvas-timeline-toggle floating-panel"
          label={t("motion:timeline")}
          active={timelineOpen}
          data-canvas-control
          onClick={() => setTimelineOpen((open) => !open)}
        >
          {timelineOpen ? <PanelBottomClose size={17} /> : <PanelBottomOpen size={17} />}
        </IconButton>
      ) : null}
    </>
  );
}

function EngineTimelineToggle({ engine }: { engine: EnginePort }) {
  const { t } = useTranslation();
  const studio = useWorkspaceMode() === "studio";
  const select = useMemo(createArtboardModeProjection, []);
  const modes = useEngineValue(engine, select);
  const page = modes.pages.find((item) => item.id === modes.pageId)!;
  const [timelineOpen, setTimelineOpen] = useAtom(timelineOpenAtom);
  if (!studio && page.mode !== "motion") return null;
  return (
    <CompositionMode
      engine={engine}
      state={{
        projectId: modes.projectId,
        pageId: modes.pageId,
        mode: page.mode,
        initialized: page.initialized,
      }}
      onMotionEnabled={() => setTimelineOpen((open) => (page.mode === "motion" ? !open : true))}
      renderMotionButton={(activate) => (
        <IconButton
          className="canvas-timeline-toggle floating-panel"
          label={t(studio ? "motion:motion" : "motion:timeline")}
          active={page.mode === "motion" && timelineOpen}
          data-canvas-control
          onClick={activate}
        >
          {studio ? (
            <>
              <ModeIcon mode="motion" size={17} />
              <span>{t("motion:motion")}</span>
            </>
          ) : timelineOpen ? (
            <PanelBottomClose size={17} />
          ) : (
            <PanelBottomOpen size={17} />
          )}
        </IconButton>
      )}
    />
  );
}
