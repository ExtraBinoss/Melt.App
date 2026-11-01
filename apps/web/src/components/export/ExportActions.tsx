import { memo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import { ExportPopover } from "./ExportPopover";
import type { ExportPopoverProps } from "./model";
import "../animation/timelapse/messages";
import "./export.css";
import { createMotionTransport } from "../../services/motion/transport";
import { subscribeCompositionExport } from "./composition-request";

export const ExportActions = memo(
  function ExportActions({
    engine,
    timelapseOpen,
    onTimelapseOpenChange,
    ...props
  }: ExportPopoverProps & {
    engine: EnginePort;
    timelapseOpen: boolean;
    onTimelapseOpenChange: (open: boolean) => void;
  }) {
    const { t } = useTranslation("timelapse");
    const { onOpenChange } = props;
    const [requested, setRequested] = useState<string | undefined>();
    const changeOpen = useCallback(
      (open: boolean) => {
        if (open) createMotionTransport(engine).pause();
        else {
          setRequested(undefined);
          onTimelapseOpenChange(false);
        }
        onOpenChange(open);
      },
      [engine, onOpenChange, onTimelapseOpenChange],
    );
    useEffect(
      () =>
        subscribeCompositionExport(engine, (target) => {
          if (target.projectId !== engine.getSnapshot().project.id) return;
          setRequested(target.compositionId);
          changeOpen(true);
        }),
      [engine, changeOpen],
    );
    return (
      <div className="export-actions" role="group" aria-label={t("exportActions")}>
        <ExportPopover
          {...props}
          engine={engine}
          open={props.open || timelapseOpen}
          initialKind={timelapseOpen ? "timelapse" : props.initialKind}
          initialCompositionId={requested}
          onOpenChange={changeOpen}
        />
      </div>
    );
  },
  (before, after) =>
    // The engine-backed workspace captures its canonical document when opened.
    // Legacy page/revision props are not inputs to this toolbar or its dialog.
    before.engine === after.engine &&
    before.services === after.services &&
    before.open === after.open &&
    before.onOpenChange === after.onOpenChange &&
    before.timelapseOpen === after.timelapseOpen &&
    before.onTimelapseOpenChange === after.onTimelapseOpenChange &&
    before.initialCompositionId === after.initialCompositionId &&
    before.initialKind === after.initialKind &&
    before.onPendingChange === after.onPendingChange &&
    before.onTask === after.onTask,
);
