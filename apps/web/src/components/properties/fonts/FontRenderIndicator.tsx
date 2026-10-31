import { CircleAlert, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FontRenderState } from "../../../state/session/font-presentation";
import styles from "./FontPicker.module.css";
import "./messages";

export function FontRenderIndicator({ state }: { state?: FontRenderState & { label: string } }) {
  const { t } = useTranslation("fonts");
  if (!state || state.status === "idle" || state.status === "ready") return null;
  return state.status === "pending" ? (
    <LoaderCircle
      size={13}
      className="animate-spin"
      aria-label={t("rendering", { font: state.label })}
    />
  ) : (
    <CircleAlert
      size={13}
      className={styles.warning}
      aria-label={t("renderUnavailable", { font: state.label })}
    />
  );
}
