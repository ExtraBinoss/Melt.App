import { useTranslation } from "react-i18next";
import { Throbber } from "../components/ui/throbber/Throbber";
import "./messages";
import "./loading.css";

/** Full-page startup phases share the canvas throbber, without restarting its reveal delay. */
export function StudioPreparation({ projectName }: { projectName?: string } = {}) {
  const { t } = useTranslation("startup");
  return (
    <div className="studio-loading">
      <Throbber
        size={80}
        variant="shimmer"
        label={projectName ? t("openingProject", { projectName }) : t("opening")}
        delayMs={0}
      />
    </div>
  );
}
