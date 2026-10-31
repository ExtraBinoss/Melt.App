import { useState, type ReactNode } from "react";
import type { EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { Button } from "../ui/button";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { InfoTooltip } from "../shared/InfoTooltip";
import { ExportProgress } from "./ExportProgress";
import { useExportJob } from "./use-export-job";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";

export function ExportAdvanced({
  children,
  print = false,
}: {
  children: ReactNode;
  print?: boolean;
}) {
  const { t } = useTranslation("exportPanel");
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
  estimatedBytes,
}: {
  engine: EnginePort;
  controls: ReactNode;
  children: ReactNode;
  preview: ReactNode;
  onSubmit: () => void;
  onClose: () => void;
  disabled?: boolean;
  submitLabel: string;
  estimatedBytes?: number | null;
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
        estimatedBytes={estimatedBytes}
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
  estimatedBytes,
}: {
  engine: EnginePort;
  disabled: boolean;
  onSubmit: () => void;
  onClose: () => void;
  submitLabel: string;
  estimatedBytes?: number | null;
}) {
  const { t, i18n } = useTranslation("exportPanel");
  const { jobs, job } = useExportJob(engine);
  const [initialSequence] = useState(() => (jobs.pending ? jobs.sequence - 1 : jobs.sequence));
  const showProgress = jobs.sequence > initialSequence;
  return (
    <footer className="export-dialog-footer">
      <div className="export-footer-meta">
        <InfoTooltip label={t("backgroundInfo")}>
          {t("backgroundHint")}
          {estimatedBytes != null ? ` ${t("estimateHint")}` : ""}
        </InfoTooltip>
        {estimatedBytes != null && (
          <span className="export-size-estimate" aria-label={t("estimatedSize")}>
            ≈{" "}
            {new Intl.NumberFormat(i18n.resolvedLanguage ?? "en", {
              maximumFractionDigits: 1,
            }).format(estimatedBytes / 1_000_000)}{" "}
            MB
          </span>
        )}
        <ExportProgress engine={engine} afterSequence={initialSequence} compact />
      </div>
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
