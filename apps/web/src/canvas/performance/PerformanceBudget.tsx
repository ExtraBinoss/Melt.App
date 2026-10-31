import { useTranslation } from "react-i18next";
import { ContributionBreakdown } from "../../components/shared/metrics/ContributionBreakdown";
import { performanceMetricLabel } from "./definitions";
import type { CompositionPerformanceSnapshot } from "../../state/session/composition-performance";

export function PerformanceBudget({
  snapshot,
  budgetMs,
  domain,
}: {
  snapshot: CompositionPerformanceSnapshot;
  budgetMs: number;
  domain: "cpu" | "gpu";
}) {
  const { t, i18n } = useTranslation("compositionPerformance");
  const parts = snapshot.contributions?.[domain] ?? [];
  const value = snapshot[domain].value;
  const ms = (value: number) =>
    t("milliseconds", {
      value: new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(value),
    });
  if (!parts.length || value === null) return null;
  return (
    <div className="performance-budget-breakdown">
      <ContributionBreakdown
        sections={[...parts]
          .sort((a, b) => b.value - a.value)
          .map((part) => ({
            key: part.id,
            label: performanceMetricLabel(part.id, (key, options) => t(key, options)),
            value: part.value,
          }))}
        label={t("contributions")}
        language={i18n.language}
        formatValue={ms}
        budget={{ value: budgetMs, label: `${t("frameBudget")}: ${ms(budgetMs)}` }}
      />
      {value > budgetMs && (
        <p className="performance-budget-overflow">
          {t("overBudget", { value: ms(value - budgetMs) })}
        </p>
      )}
    </div>
  );
}
