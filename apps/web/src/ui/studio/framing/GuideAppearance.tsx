import { useTranslation } from "react-i18next";
import { NumberInput } from "../../../components/shared/NumberInput";
import { SelectField } from "../../../components/shared/SelectField";
import { Switch } from "../../../components/ui/switch";
import { STUDIO_GUIDE_COLORS, type StudioGuideAppearance } from "./guide-settings";
import "./messages";

/** Compact presentation options inside the existing framing popover. */
export function GuideAppearance({
  value,
  onChange,
  onPreview,
  onCancel,
  identity,
}: {
  value: StudioGuideAppearance;
  onChange: (value: StudioGuideAppearance) => void;
  onPreview: (value: StudioGuideAppearance) => void;
  onCancel: () => void;
  identity?: object;
}) {
  const { t } = useTranslation("studioFraming");
  return (
    <div className="studio-guide-appearance">
      <div className="studio-guide-setting">
        <span>{t("safeArea")}</span>
        <SelectField
          identity={identity}
          label={t("safeArea")}
          value={value.safeArea}
          options={[
            { value: "format", label: t("formatSafeArea") },
            { value: "custom", label: t("customMargin") },
            { value: "none", label: t("none") },
          ]}
          onValueChange={(safeArea) =>
            onChange({ ...value, safeArea: safeArea as StudioGuideAppearance["safeArea"] })
          }
        />
      </div>
      {value.safeArea === "custom" && (
        <NumberInput
          identity={identity}
          label={t("margin")}
          value={value.margin}
          min={0}
          max={40}
          step={1}
          unit="%"
          onPreview={(margin) => onPreview({ ...value, margin })}
          onCancel={onCancel}
          onCommit={(margin) => onChange({ ...value, margin })}
        />
      )}
      <div className="studio-guide-setting">
        <span>{t("guideColor")}</span>
        <SelectField
          identity={identity}
          label={t("guideColor")}
          value={value.color}
          options={(Object.keys(STUDIO_GUIDE_COLORS) as (keyof typeof STUDIO_GUIDE_COLORS)[]).map(
            (color) => ({
              value: color,
              label: (
                <span className="studio-guide-color-option">
                  <i style={{ backgroundColor: STUDIO_GUIDE_COLORS[color] }} />
                  {t(color)}
                </span>
              ),
            }),
          )}
          onPreview={(color) =>
            onPreview({ ...value, color: color as StudioGuideAppearance["color"] })
          }
          onPreviewCancel={onCancel}
          onValueChange={(color) =>
            onChange({ ...value, color: color as StudioGuideAppearance["color"] })
          }
        />
      </div>
      <label className="studio-guide-setting">
        <span>{t("centerLines")}</span>
        <Switch
          aria-label={t("centerLines")}
          checked={value.center}
          onCheckedChange={(center) => onChange({ ...value, center })}
        />
      </label>
    </div>
  );
}
