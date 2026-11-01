import { preservePlayerTimeEdit } from "../shared/player/PlayerTimeField";
import { lazy, Suspense, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Throbber } from "../ui/throbber/Throbber";
const ExportWorkspace = lazy(() =>
  import("./ExportWorkspace").then((module) => ({ default: module.ExportWorkspace })),
);
import { ExportTriggerLabel } from "./ExportTriggerLabel";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { ExportSettings } from "./ExportSettings";
import { CompositionExportSettings } from "./CompositionExportSettings";
import type { ExportPopoverProps } from "./model";
import "./messages";
import "./export.css";

export function ExportPopover(props: ExportPopoverProps) {
  const { t } = useTranslation();
  const surface = useRef<HTMLDivElement>(null);
  if (!props.engine) return <LegacyExportPopover {...props} />;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger asChild>
        <Button className="export-trigger" size="sm" aria-label={t("export")}>
          <ExportTriggerLabel engine={props.engine} />
        </Button>
      </DialogTrigger>
      <DialogContent
        ref={surface}
        onEscapeKeyDown={preservePlayerTimeEdit}
        className="export-dialog"
        aria-describedby={undefined}
        data-canvas-control
        data-keybinding-capture
      >
        <DialogHeader className="export-dialog-header">
          <DialogTitle>{t("exportTitle")}</DialogTitle>
        </DialogHeader>
        <Suspense
          fallback={
            <div className="export-workspace-loading">
              <Throbber size={40} label={t("brand:preparing")} />
            </div>
          }
        >
          <ExportWorkspace
            entrance={surface}
            engine={props.engine}
            services={props.services}
            initialCompositionId={props.initialCompositionId}
            onClose={() => props.onOpenChange(false)}
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}
function LegacyExportPopover(props: ExportPopoverProps) {
  const { t } = useTranslation();
  const pendingRef = useRef(false);
  function show(open: boolean) {
    if (!pendingRef.current) props.onOpenChange(open);
  }
  return (
    <Popover open={props.open} onOpenChange={show}>
      <PopoverTrigger asChild>
        <Button className="export-trigger" size="sm">
          <Download size={14} />
          {t("export")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="floating-panel export-popover"
        aria-label={t("exportTitle")}
        data-canvas-control
        onEscapeKeyDown={(event) => {
          if (pendingRef.current) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (pendingRef.current) event.preventDefault();
        }}
      >
        {props.engine ? (
          <CompositionExportSettings
            key={props.initialCompositionId ?? "active"}
            {...props}
            engine={props.engine}
            pendingRef={pendingRef}
          />
        ) : (
          <ExportSettings {...props} pendingRef={pendingRef} />
        )}
      </PopoverContent>
    </Popover>
  );
}
