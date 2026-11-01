import { useTranslation } from "react-i18next";
import { Throbber } from "../../ui/throbber/Throbber";
import { Button } from "../../ui/button";
import "../../../bootstrap/messages";
import "../templates/messages";
import "./opening.css";

export function OpeningSurface({ cancel }: { cancel?: () => void }) {
  const { t } = useTranslation("startup");
  return (
    <div className="project-opening-content">
      <Throbber size={80} variant="shimmer" label={t("opening")} delayMs={0} />
      {cancel && (
        <Button variant="ghost" onClick={cancel}>
          {t("templates:cancel")}
        </Button>
      )}
    </div>
  );
}
