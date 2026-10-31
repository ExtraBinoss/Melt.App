import { useTranslation } from "react-i18next";
import { useRestoreLocale } from "../state/i18n/use-locale";
import { ChevronRight } from "lucide-react";
import { Faq } from "../components/site/Faq";
import { TOOL_PAGES, publicHref, type ToolDefinition } from "./catalog";
import { ToolCards } from "./ToolCards";
import { Converter } from "./converter/Converter";
import "./messages";
import "./tools.css";
export function ToolPage({ tool }: { tool: ToolDefinition }) {
  useRestoreLocale();
  const { t } = useTranslation("tools");
  const name = t(`styles.${tool.style}.name`);
  const title = t("title", { style: name });
  const questions = [
    { question: t(`styles.${tool.style}.question`), answer: t(`styles.${tool.style}.answer`) },
    { question: t("privacyQ"), answer: t("privacyA") },
    { question: t("outputQ"), answer: `${t("outputImageA")} ${t("outputVideoA")}` },
    { question: t("controlsQ"), answer: t("controlsA") },
  ];
  return (
    <div className="tools-container">
      <nav className="tool-breadcrumbs" aria-label={t("breadcrumbs")}>
        <a href={publicHref("/")}>{t("home")}</a>
        <ChevronRight size={12} />
        <a href={publicHref("/tools")}>{t("hub")}</a>
        <ChevronRight size={12} />
        <span>{name}</span>
      </nav>
      <header className="tools-heading tool-page-heading">
        <h1>{title}</h1>
        <p>{t(`styles.${tool.style}.summary`)}</p>
      </header>
      <Converter key={tool.slug} tool={tool} />
      <section className="tool-guide">
        <div>
          <h2>{t("how", { media: t("file").toLocaleLowerCase() })}</h2>
          <ol>
            {(t("steps", { returnObjects: true }) as string[]).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <div>
          <h2>{t("about", { style: name })}</h2>
          <p>{t(`styles.${tool.style}.about`)}</p>
          <p>{t("imageIntro")}</p>
          <p>{t("videoIntro")}</p>
        </div>
      </section>
      <section className="tool-tips">
        <h2>{t("tips")}</h2>
        <ul>
          {(t(`styles.${tool.style}.tips`, { returnObjects: true }) as string[]).map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>
      <Faq items={questions} title={t("faq")} />
      <section className="tool-related">
        <h2>{t("moreTools")}</h2>
        <ToolCards tools={TOOL_PAGES.filter((item) => item.style !== tool.style).slice(0, 3)} />
      </section>
    </div>
  );
}
