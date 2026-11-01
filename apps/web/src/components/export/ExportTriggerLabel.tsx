import type { EnginePort } from "@musart/core";
import { Download, LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useExportJob } from "./use-export-job";
export function ExportTriggerLabel({ engine }: { engine: EnginePort }) {
  const { t } = useTranslation();
  const { jobs, job } = useExportJob(engine);
  return (
    <>
      {jobs.pending ? (
        <LoaderCircle size={14} className="animate-spin" />
      ) : job?.status === "failed" ? (
        <TriangleAlert size={14} />
      ) : (
        <Download size={14} />
      )}
      <span className="export-trigger-caption" data-pending={Boolean(jobs.pending && job)}>
        <span className="export-trigger-name">{t("export")}</span>
        <span className="export-trigger-percent" aria-hidden={!jobs.pending}>
          {jobs.pending && job ? `${job.percent} %` : "100 %"}
        </span>
      </span>
      {job && (
        <span className="sr-only" role="status">
          {t(`exportPanel:${jobs.pending ? "backgroundHint" : `job_${job.status}`}`)}
        </span>
      )}
      {jobs.pending && job && (
        <span
          className="export-trigger-progress"
          style={{ width: `${job.percent}%` }}
          aria-hidden
        />
      )}
    </>
  );
}
