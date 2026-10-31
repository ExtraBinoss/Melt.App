import { useState, type FocusEvent, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import "./breakdown.css";
export interface BreakdownSection {
  key: string;
  label: string;
  value: number;
  details?: ReactNode;
}
/** One local highlight links the measured bar and legend, including keyboard and touch help. */
export function ContributionBreakdown({
  sections,
  label,
  formatValue,
  language,
  budget,
}: {
  sections: BreakdownSection[];
  label: string;
  formatValue(this: void, value: number): string;
  language: string;
  budget?: { value: number; label: string };
}) {
  const [active, setActive] = useState<{ key: string; part: "bar" | "row" } | null>(null);
  const total = sections.reduce((sum, section) => sum + section.value, 0);
  const bytes = formatValue;
  const capacity = Math.max(total, budget?.value ?? 0);
  function tip(section: BreakdownSection, part: "bar" | "row", children: ReactNode) {
    const percent = new Intl.NumberFormat(language, {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(total ? section.value / total : 0);
    return (
      <Tooltip
        key={`${part}:${section.key}`}
        open={active?.key === section.key && active.part === part}
        onOpenChange={(open) => {
          if (open) setActive({ key: section.key, part });
          else
            setActive((current) =>
              current?.key === section.key && current.part === part ? null : current,
            );
        }}
      >
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>
          <strong>{section.label}</strong>
          <span className="storage-tooltip-value">
            {bytes(section.value)} · {percent}
          </span>
        </TooltipContent>
      </Tooltip>
    );
  }
  const interaction = (key: string, part: "bar" | "row") => ({
    onPointerEnter: () => setActive({ key, part }),
    onPointerLeave: () =>
      setActive((current) => (current?.key === key && current.part === part ? null : current)),
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (event.target === event.currentTarget) setActive({ key, part });
    },
    onBlur: () => setActive(null),
    onClick: () => setActive({ key, part }),
  });
  return (
    <div className="storage-chart">
      <div
        className="storage-distribution"
        data-budget={budget ? true : undefined}
        role="group"
        aria-label={label}
      >
        {sections.map(
          (section, index) =>
            section.value > 0 && (
              <span
                key={section.key}
                className="storage-segment-slot"
                style={
                  budget
                    ? { flex: `0 0 ${capacity ? (section.value / capacity) * 100 : 0}%` }
                    : { flexGrow: section.value }
                }
              >
                {tip(
                  section,
                  "bar",
                  <button
                    type="button"
                    aria-label={`${section.label}: ${bytes(section.value)}`}
                    className={`storage-segment storage-segment-${index % 4}`}
                    data-section={section.key}
                    data-over-budget={(budget && section.value > budget.value) || undefined}
                    data-dimmed={!!active && active.key !== section.key}
                    {...interaction(section.key, "bar")}
                  />,
                )}
              </span>
            ),
        )}
        {budget && (
          <span
            className="contribution-budget-marker"
            role="img"
            aria-label={budget.label}
            title={budget.label}
            style={{ insetInlineStart: `${capacity ? (budget.value / capacity) * 100 : 100}%` }}
          />
        )}
      </div>
      <dl className="storage-breakdown">
        {sections.map((section, index) =>
          tip(
            section,
            "row",
            <div
              className="storage-row"
              tabIndex={0}
              data-section={section.key}
              data-over-budget={(budget && section.value > budget.value) || undefined}
              data-dimmed={!!active && active.key !== section.key}
              {...interaction(section.key, "row")}
            >
              <dt>
                <span className={`storage-dot storage-segment-${index % 4}`} />
                {section.label}
                {section.details}
              </dt>
              <dd>{bytes(section.value)}</dd>
            </div>,
          ),
        )}
      </dl>
    </div>
  );
}
