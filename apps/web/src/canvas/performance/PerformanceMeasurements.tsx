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
  performanceMetrics,
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
  return (
    <>
      <div className="composition-performance-timings">
        {(["cpu", "gpu"] as const).map((id) => {
          const value = snapshot[id],
            measured = value.availability === "measured";
          return (
            <div key={id} className="composition-performance-timing" data-timing={id}>
              <div className="composition-performance-row">
                <span>{t(`timings.${id}`)}</span>
                <strong>{valueLabel(value)}</strong>
              </div>
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
            </div>
          );
        })}
      </div>
      <div className="composition-performance-row composition-performance-cadence">
        <span>{t("timings.frame")}</span>
        <strong>{valueLabel(snapshot.frame)}</strong>
      </div>
      <p className="composition-performance-note">{t("timingNote")}</p>
      <p className="composition-performance-note">{t("warmthNote")}</p>
      <p className="composition-performance-note">{t("sharedNote")}</p>
      <Accordion type="multiple" className="composition-performance-domains">
        {performanceDomainIds(snapshot.metrics).map((domain) => {
          const metrics = snapshot.metrics.filter((metric) => metric.domain === domain);
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
                          {performanceMetrics.has(metric.id)
                            ? t(`metrics.${metric.id}`)
                            : t("additionalMetric", { id: metric.id })}
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
