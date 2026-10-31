import { useId } from "react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { marqueeContainAtom } from "../../../state/selection/preferences";
import { Switch } from "../../ui/switch";
import "./marquee-preference.css";

export function MarqueePreference() {
  const { t } = useTranslation("preferences");
  const [contain, setContain] = useAtom(marqueeContainAtom);
  const description = useId();
  return (
    <div className="preferences-card">
      <label className="preferences-setting-row">
        <span>
          <strong>{t("marqueeContain")}</strong>
          <small id={description} className="preferences-setting-description">
            {t("marqueeContainDescription")}
          </small>
        </span>
        <Switch
          checked={contain}
          onCheckedChange={setContain}
          aria-label={t("marqueeContain")}
          aria-describedby={description}
        />
      </label>
      <div className="marquee-examples" role="group" aria-label={t("marqueeExample")}>
        {[false, true].map((enclose) => (
          <figure key={String(enclose)} data-active={contain === enclose}>
            <svg viewBox="0 0 150 86" aria-hidden="true">
              <rect
                className="marquee-example-region"
                x="13"
                y="12"
                width="91"
                height="60"
                rx="2"
              />
              <rect
                className="marquee-example-layer"
                data-selected="true"
                x="31"
                y="30"
                width="34"
                height="24"
                rx="5"
              />
              <rect
                className="marquee-example-layer"
                data-selected={!enclose}
                x="87"
                y="36"
                width="39"
                height="28"
                rx="5"
              />
              <path className="marquee-example-outline" d="M13 12H104V72H13Z" />
            </svg>
            <figcaption>{t(enclose ? "marqueeEnclose" : "marqueeTouch")}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
