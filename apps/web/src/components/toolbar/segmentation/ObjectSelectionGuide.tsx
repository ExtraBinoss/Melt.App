import { useTranslation } from "react-i18next";
import { Kbd } from "../../ui/kbd";

export function ObjectSelectionGuide({ mode }: { mode: "points" | "box" }) {
  const { t } = useTranslation("pixelSelection");
  return (
    <ol className="object-selection-guide" role="list">
      <li>
        <span className="object-selection-step" aria-hidden="true">
          1
        </span>
        <div>
          <strong>{t(mode === "points" ? "objectMarkTitle" : "objectBoxTitle")}</strong>
          {mode === "points" ? (
            <dl className="object-selection-inputs">
              <div>
                <dt>
                  <Kbd>{t("objectLeftClick")}</Kbd>
                </dt>
                <dd>{t("objectIncludeHelp")}</dd>
              </div>
              <div>
                <dt>
                  <Kbd>{t("objectRightClick")}</Kbd>
                </dt>
                <dd>{t("objectExcludeHelp")}</dd>
              </div>
            </dl>
          ) : (
            <p>{t("objectBoxHelp")}</p>
          )}
        </div>
      </li>
      <li>
        <span className="object-selection-step" aria-hidden="true">
          2
        </span>
        <div>
          <strong>{t("objectRefineTitle")}</strong>
          <p>{t(mode === "points" ? "objectRefineHelp" : "objectRefineBoxHelp")}</p>
        </div>
      </li>
      <li>
        <span className="object-selection-step" aria-hidden="true">
          3
        </span>
        <div>
          <strong>{t("objectFinishTitle")}</strong>
          <dl className="object-selection-inputs">
            <div>
              <dt>
                <Kbd>{t("keep")}</Kbd>
              </dt>
              <dd>{t("objectKeepHelp")}</dd>
            </div>
            <div>
              <dt>
                <Kbd>{t("erase")}</Kbd>
              </dt>
              <dd>{t("objectEraseHelp")}</dd>
            </div>
          </dl>
          <p>{t("objectOriginalHelp")}</p>
        </div>
      </li>
    </ol>
  );
}
