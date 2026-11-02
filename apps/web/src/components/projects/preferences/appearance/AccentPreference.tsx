import { useState } from "react";
import type { CSSProperties } from "react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Check, MousePointer2, Play } from "lucide-react";
import { SelectField } from "../../../shared/SelectField";
import { accentAtom } from "../../../../state/session/accent";
import { accentIds, accentPalettes, accentTokens, isAccent } from "../../../../ui/brand/accents";
import type { Accent } from "../../../../ui/brand/accents";
import "./appearance.css";

export function AccentPreference() {
  const { t } = useTranslation("preferences");
  const [accent, setAccent] = useAtom(accentAtom);
  const [preview, setPreview] = useState<Accent | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const shown = preview ?? accent;
  return (
    <div className="preferences-card appearance-accent">
      <div className="preferences-setting-row">
        <div>
          <strong>{t("accent")}</strong>
          <p>{t("accentDescription")}</p>
        </div>
        <SelectField
          id="preferences-accent"
          label={t("accent")}
          value={accent}
          options={accentIds.map((value) => ({
            value,
            label: (
              <span className="appearance-accent-option">
                <span aria-hidden style={{ background: accentPalettes[value].light }} />
                {t(`accentName_${value}`)}
              </span>
            ),
          }))}
          onPreview={(value) => {
            if (isAccent(value)) setPreview(value);
          }}
          onPreviewCancel={() => setPreview(null)}
          onValueChange={(value) => {
            if (!isAccent(value)) return;
            setSaveFailed(!setAccent(value));
            setPreview(null);
          }}
        />
      </div>
      <div
        className="appearance-previews"
        role="group"
        aria-label={t("accentPreview")}
        data-accent-preview={shown}
      >
        {[false, true].map((dark) => (
          <figure
            key={String(dark)}
            className="appearance-preview"
            data-dark={dark}
            style={accentTokens(shown, dark) as CSSProperties}
          >
            <figcaption>{t(dark ? "accentDark" : "accentLight")}</figcaption>
            <div className="appearance-preview-window">
              <div className="appearance-preview-heading">
                <span>{t("accentWorkspace")}</span>
                <span className="appearance-preview-action">
                  <Play size={11} fill="currentColor" />
                  {t("accentAction")}
                </span>
              </div>
              <div className="appearance-preview-canvas">
                <span className="appearance-preview-art">
                  <span />
                  <span />
                  <MousePointer2 size={15} />
                </span>
              </div>
              <div className="appearance-preview-row">
                <Check size={13} />
                <span>{t("accentSelected")}</span>
                <span />
              </div>
            </div>
          </figure>
        ))}
      </div>
      {saveFailed && <p role="alert">{t("accentSaveError")}</p>}
    </div>
  );
}
