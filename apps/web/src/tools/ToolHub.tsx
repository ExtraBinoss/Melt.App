import { useTranslation } from "react-i18next";
import { useRestoreLocale } from "../state/i18n/use-locale";
import { TOOL_PAGES } from "./catalog";
import { ToolCards } from "./ToolCards";
import "./messages";
import "./tools.css";
export function ToolHub() {
  useRestoreLocale();
  const { t } = useTranslation("tools");
  return (
    <div className="tools-container">
      <header className="tools-heading">
        <h1>{t("hubTitle")}</h1>
        <p>{t("hubIntro")}</p>
      </header>
      <ToolCards tools={TOOL_PAGES} />
    </div>
  );
}
