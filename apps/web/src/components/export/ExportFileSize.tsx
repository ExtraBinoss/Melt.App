import { useTranslation } from "react-i18next";
import { InfoTooltip } from "../shared/InfoTooltip";
import { sameExportSizeKey, type ExportSizeRequest } from "../../services/export/measurements";
import type { ExportJob, ExportJobs } from "../../services/export/jobs";
import { formatBytes } from "../../ui/format/bytes";

export function ExportFileSize({
  request,
  jobs,
  job,
}: {
  request?: ExportSizeRequest;
  jobs: ExportJobs;
  job: ExportJob | null;
}) {
  const { t, i18n } = useTranslation("exportPanel");
  if (!request) return null;
  const measured = jobs.measurements.read(request.key);
  const projected =
    jobs.pending && sameExportSizeKey(job?.sizeKey, request.key) ? job?.estimatedBytes : undefined;
  const bytes = projected ?? measured ?? request.targetBytes;
  if (bytes == null) return null;
  const kind = projected != null ? "projected" : measured != null ? "measured" : "target";
  const label = t(
    kind === "measured" ? "fileSize" : kind === "target" ? "targetSize" : "estimatedSize",
  );
  const formatted = formatBytes(bytes, i18n.resolvedLanguage ?? "en");
  return (
    <div className="export-file-size" data-size-kind={kind} data-size-bytes={bytes}>
      <span className="export-size-estimate" aria-label={`${label}: ${formatted}`}>
        {kind === "target" ? `${t("targetSize")} · ` : ""}
        {kind !== "measured" ? "≈ " : ""}
        {formatted}
      </span>
      <InfoTooltip label={label}>
        {t(
          kind === "measured"
            ? "measuredSizeHint"
            : kind === "target"
              ? "targetSizeHint"
              : "estimateHint",
        )}
      </InfoTooltip>
    </div>
  );
}
