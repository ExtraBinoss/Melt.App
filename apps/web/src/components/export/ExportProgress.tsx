import type { EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { ExportFailure } from "./ExportFailure";
import { Button } from "../ui/button";
import { useExportJob } from "./use-export-job";

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
    <div className="export-job" data-status={job.status} data-compact={compact || undefined}>
      {job.status !== "failed" && (
        <div className="export-job-line" role="status">
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
      )}
      {(jobs.pending || job.status === "complete") && (
        <progress max={100} value={job.percent} aria-label={t("progress")} />
      )}
      {job.status === "failed" && (
        <ExportFailure
          error={job.error}
          message={t("job_failed")}
          context={`${job.kind} export · ${job.name} · ${job.projectId}`}
        />
      )}
    </div>
  );
}
