import "./storage.css";
import { useTranslation } from "react-i18next";
import {
  ContributionBreakdown,
  type BreakdownSection,
} from "../../shared/metrics/ContributionBreakdown";
import { formatBytes } from "./format-bytes";
export type StorageSection = BreakdownSection;

/** Storage adapts the shared linked chart/legend to local byte accounting. */
export function StorageBreakdown({
  sections,
  label,
}: {
  sections: StorageSection[];
  label: string;
}) {
  const { i18n } = useTranslation();
  return (
    <ContributionBreakdown
      sections={sections}
      label={label}
      language={i18n.language}
      formatValue={(value) => formatBytes(value, i18n.language)}
    />
  );
}
