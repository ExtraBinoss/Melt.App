import { PerformanceBudget } from "./PerformanceBudget";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import type {
  CompositionPerformanceSnapshot,
  CompositionPerformanceValue,
} from "../../state/session/composition-performance";
import {
  budgetFraction,
  performanceDomainIds,
  performanceDomains,
  performanceMetricLabel,
} from "./definitions";

export function PerformanceMeasurements({
  snapshot,
  budgetMs,
}: {
  snapshot: CompositionPerformanceSnapshot;
  budgetMs: number;
}) {
  const { t, i18n } = useTranslation("compositionPerformance");
  const reduced = useReducedMotion();
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(value);
  function valueLabel(value: CompositionPerformanceValue, unit = "ms") {
    if (value.availability !== "measured" || value.value === null)
      return t(`availability.${value.availability}`);
    if (unit === "bytes")
      return new Intl.NumberFormat(i18n.language, {
        style: "unit",
        unit: "byte",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value.value);
    if (unit === "percent")
      return new Intl.NumberFormat(i18n.language, {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value.value / 100);
    return unit === "ms" ? t("milliseconds", { value: number(value.value) }) : number(value.value);
  }
  const visible = snapshot.metrics.filter(
    (metric) => metric.availability === "measured" && metric.value !== null && metric.value > 0,
  );
  return (
    <>
      <div className="composition-performance-timings">
        {(["cpu", "gpu"] as const).map((id) => {
          const value = snapshot[id],
            measured = value.availability === "measured";
          if (!measured || value.value === null || value.value <= 0) return null;
          const parts = !!snapshot.contributions?.[id].length;
          return (
            <div key={id} className="composition-performance-timing" data-timing={id}>
              <div className="composition-performance-row">
                <span>{t(`timings.${id}`)}</span>
                <strong
                  role={parts ? "meter" : undefined}
                  aria-label={parts ? t(`timings.${id}`) : undefined}
                  aria-valuemin={parts ? 0 : undefined}
                  aria-valuemax={parts ? budgetMs : undefined}
                  aria-valuenow={parts ? Math.min(value.value, budgetMs) : undefined}
                  aria-valuetext={parts ? valueLabel(value) : undefined}
                >
                  {valueLabel(value)}
                </strong>
              </div>
              {parts ? (
                <PerformanceBudget snapshot={snapshot} budgetMs={budgetMs} domain={id} />
              ) : (
                <div
                  className="composition-performance-track"
                  role={measured ? "meter" : undefined}
                  aria-label={t(`timings.${id}`)}
                  aria-valuemin={measured ? 0 : undefined}
                  aria-valuemax={measured ? budgetMs : undefined}
                  aria-valuenow={measured ? Math.min(value.value ?? 0, budgetMs) : undefined}
                  aria-valuetext={measured ? valueLabel(value) : undefined}
                  data-available={measured}
                  data-over-budget={measured && (value.value ?? 0) > budgetMs}
                >
                  {measured && (
                    <motion.span
                      initial={reduced ? false : { scaleX: 0 }}
                      animate={{ scaleX: budgetFraction(value.value, budgetMs) }}
                      transition={{ duration: reduced ? 0 : 0.24, ease: "easeOut" }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {snapshot.frame.value !== null && snapshot.frame.value > 0 && (
        <div className="composition-performance-row composition-performance-cadence">
          <span>{t("timings.frame")}</span>
          <strong>{valueLabel(snapshot.frame)}</strong>
        </div>
      )}
      <Accordion type="multiple" className="composition-performance-domains">
        {performanceDomainIds(visible)
          .filter((domain) => visible.some((metric) => metric.domain === domain))
          .map((domain) => {
            const metrics = visible.filter((metric) => metric.domain === domain);
            const known = performanceDomains.some((id) => id === domain);
            return (
              <AccordionItem key={domain} value={domain}>
                <AccordionTrigger className="composition-performance-domain-trigger">
                  <span>
                    {known ? t(`domains.${domain}`) : t("additionalDomain", { id: domain })}
                  </span>
                  <span className="composition-performance-domain-summary">
                    {metrics.length
                      ? t("metricCount", { count: metrics.length })
                      : t("availability.not-measured")}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="composition-performance-domain-content">
                  {metrics.length ? (
                    <dl>
                      {metrics.map((metric) => (
                        <div key={metric.id} className="composition-performance-row">
                          <dt>
                            {performanceMetricLabel(metric.id, (key, options) => t(key, options))}
                            <small>{t(`kinds.${metric.kind}`)}</small>
                          </dt>
                          <dd>{valueLabel(metric, metric.unit)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="composition-performance-note">{t("domainNotMeasured")}</p>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
      </Accordion>
    </>
  );
}
