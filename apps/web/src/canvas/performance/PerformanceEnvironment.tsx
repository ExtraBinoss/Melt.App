import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import type { PerformanceEnvironment as Environment } from "../../state/session/performance-environment";

export function PerformanceEnvironment({ environment }: { environment: Environment }) {
  const { t } = useTranslation("compositionPerformance");
  return (
    <Accordion type="single" collapsible className="composition-performance-environment">
      <AccordionItem value="environment">
        <AccordionTrigger className="composition-performance-domain-trigger">
          {t("environment.title")}
        </AccordionTrigger>
        <AccordionContent className="composition-performance-domain-content">
          <dl>
            {Object.entries(environment).map(([id, value]) => (
              <div className="composition-performance-row" key={id}>
                <dt>{t(`environment.labels.${id}`, { defaultValue: id })}</dt>
                <dd>
                  {typeof value === "boolean"
                    ? t(value ? "environment.yes" : "environment.no")
                    : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
