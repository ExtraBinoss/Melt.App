import { Children, useState, type ReactNode } from "react";
import type { EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { Button } from "../ui/button";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { InfoTooltip } from "../shared/InfoTooltip";
import { ExportProgress } from "./ExportProgress";
import { useExportJob } from "./use-export-job";
import { ExportFileSize } from "./ExportFileSize";
import type { ExportSizeRequest } from "../../services/export/measurements";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";

export function ExportAdvanced({
  children,
  print = false,
}: {
  children: ReactNode;
  print?: boolean;
}) {
  const { t } = useTranslation("exportPanel");
  if (Children.toArray(children).length === 0) return null;
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="options">
        <AccordionTrigger>{t(print ? "print" : "advanced")}</AccordionTrigger>
        <AccordionContent className="export-fields">{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
export function ExportLayout({
  engine,
  controls,
  children,
  preview,
  onSubmit,
  onClose,
  disabled = false,
  submitLabel,
  size,
}: {
  engine: EnginePort;
  controls: ReactNode;
  children: ReactNode;
  preview: ReactNode;
  onSubmit: () => void;
  onClose: () => void;
  disabled?: boolean;
  submitLabel: string;
  size?: ExportSizeRequest;
}) {
  const { t } = useTranslation("exportPanel");
  return (
    <>
      <div className="export-workspace">
        <ScrollShadow className="export-settings-scroll" surface="var(--background)">
          <div className="export-settings-viewport scrollable-panel">
            <div className="export-fields">
              {controls}
              {children}
            </div>
          </div>
        </ScrollShadow>
        <section className="export-preview-pane" aria-label={t("preview")}>
          {preview}
        </section>
      </div>
      <ExportDialogFooter
        engine={engine}
        disabled={disabled}
        onSubmit={onSubmit}
        onClose={onClose}
        submitLabel={submitLabel}
        size={size}
      />
    </>
  );
}
function ExportDialogFooter({
  engine,
  disabled,
  onSubmit,
  onClose,
  submitLabel,
  size,
}: {
  engine: EnginePort;
  disabled: boolean;
  onSubmit: () => void;
  onClose: () => void;
  submitLabel: string;
  size?: ExportSizeRequest;
}) {
  const { t } = useTranslation("exportPanel");
  const { jobs, job } = useExportJob(engine);
  const [initialSequence] = useState(() => (jobs.pending ? jobs.sequence - 1 : jobs.sequence));
  const showProgress = jobs.sequence > initialSequence;
  return (
    <footer className="export-dialog-footer">
      <div className="export-footer-meta">
        <ExportProgress engine={engine} afterSequence={initialSequence} compact />
        {jobs.pending && (
          <InfoTooltip label={t("backgroundInfo")}>{t("backgroundHint")}</InfoTooltip>
        )}
      </div>
      <ExportFileSize request={size} jobs={jobs} job={job} />
      <div className="export-footer-actions">
        <Button variant="outline" onClick={onClose}>
          {t((showProgress && job) || jobs.pending ? "close" : "cancel")}
        </Button>
        <Button className="export-submit" disabled={disabled || jobs.pending} onClick={onSubmit}>
          <Download size={15} />
          {submitLabel}
        </Button>
      </div>
    </footer>
  );
}
