import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";
import { TransitionLink } from "../ui/navigation/TransitionLink";
import { useRestoreLocale } from "../state/i18n/use-locale";
import { TOOL_PAGES, publicHref } from "./catalog";
import { ToolCards } from "./ToolCards";
import "./messages";
import "./tools.css";
export function ToolHub() {
  useRestoreLocale();
  const { t } = useTranslation("tools");
  return (
    <div className="tools-container" data-tool-route="hub">
      <Button className="tool-back" variant="ghost" size="sm" asChild>
        <TransitionLink
          href={publicHref("/")}
          revealTarget=".landing-page"
          aria-label={t("backHome")}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {t("back")}
        </TransitionLink>
      </Button>
      <header className="tools-heading">
        <h1>{t("hubTitle")}</h1>
        <p>{t("hubIntro")}</p>
      </header>
      <ToolCards tools={TOOL_PAGES} />
    </div>
  );
}
