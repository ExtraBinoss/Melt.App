import type { EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { InfoTooltip } from "../shared/InfoTooltip";
import { Button } from "../ui/button";
import { useExportJob } from "./use-export-job";
import { formatUiError } from "../../state/i18n/errors/format";

export function ExportProgress({
  engine,
  afterSequence,
  compact = false,
}: {
  engine: EnginePort;
  afterSequence?: number;
  compact?: boolean;
}) {
  const { t } = useTranslation("exportPanel");
  const { jobs, job } = useExportJob(engine);
  if (!job || (afterSequence !== undefined && jobs.sequence <= afterSequence)) return null;
  return (
    <div
      className="export-job"
      data-status={job.status}
      role={job.status === "failed" ? "alert" : undefined}
    >
      <div className="export-job-line" role={job.status === "failed" ? undefined : "status"}>
        <span>{t(`job_${job.status}`, { percent: job.percent })}</span>
        {jobs.pending && (
          <Button
            size="sm"
            variant="ghost"
            disabled={job.status === "cancelling"}
            onClick={jobs.cancel}
          >
            {t("cancel")}
          </Button>
        )}
      </div>
      {(jobs.pending || job.status === "complete") && (
        <progress max={100} value={job.percent} aria-label={t("progress")} />
      )}
      {job.status === "failed" &&
        (compact ? (
          <InfoTooltip label={t("job_failed")}>{formatUiError(job.error)}</InfoTooltip>
        ) : (
          <p className="export-job-error">{formatUiError(job.error)}</p>
        ))}
    </div>
  );
}
