import { SOCIAL_PRESETS } from "@musart/core";
import { useTranslation } from "react-i18next";
import { NumberInput } from "../../../components/shared/NumberInput";
import { Button } from "../../../components/ui/button";
import "./messages";
import "./framing.css";
export interface FrameChoice {
  preset: string;
  width: number;
  height: number;
  full: boolean;
}

export function FormatGlyph({
  width,
  height,
  full = false,
}: {
  width: number;
  height: number;
  full?: boolean;
}) {
  const scale = 31 / Math.max(width, height),
    w = width * scale,
    h = height * scale;
  return (
    <svg viewBox="0 0 48 40" aria-hidden="true" className="studio-format-glyph">
      <rect
        x={(48 - w) / 2}
        y={(40 - h) / 2}
        width={w}
        height={h}
        rx={height > width ? 3 : 1.5}
        fill="currentColor"
        fillOpacity=".07"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeDasharray={full ? "3 2" : undefined}
      />
      {height > width && (
        <path
          d={`M${22} ${(40 - h) / 2 + 3}h4`}
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** The same actual format catalog is used by capture guides and delivered output. */
export function FramePresetPicker({
  value,
  onChange,
  bounds,
  disabled,
}: {
  value: FrameChoice;
  onChange: (value: FrameChoice) => void;
  bounds: { width: number; height: number };
  disabled?: boolean;
}) {
  const { t } = useTranslation("studioFraming");
  const { t: common } = useTranslation();
  return (
    <div className="studio-frame-picker">
      <div className="studio-format-grid" role="group" aria-label={t("format")}>
        <Button
          variant="ghost"
          disabled={disabled}
          aria-pressed={value.full}
          data-preset-id="full"
          onClick={() =>
            onChange({
              preset: "full",
              width: Math.max(1, Math.round(bounds.width)),
              height: Math.max(1, Math.round(bounds.height)),
              full: true,
            })
          }
        >
          <FormatGlyph {...bounds} full />
          <span>{t("full")}</span>
        </Button>
        <Button
          variant="ghost"
          disabled={disabled}
          aria-pressed={!value.full && value.preset === "custom"}
          data-preset-id="custom"
          onClick={() => onChange({ ...value, preset: "custom", full: false })}
        >
          <FormatGlyph {...value} />
          <span>{t("custom")}</span>
        </Button>
        {SOCIAL_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            variant="ghost"
            disabled={disabled}
            data-preset-id={preset.id}
            aria-pressed={!value.full && value.preset === preset.id}
            onClick={() =>
              onChange({
                preset: preset.id,
                width: preset.width,
                height: preset.height,
                full: false,
              })
            }
          >
            <FormatGlyph {...preset} />
            <span>{common(preset.nameKey)}</span>
          </Button>
        ))}
      </div>
      <div className="studio-frame-dimensions">
        <NumberInput
          label={t("width")}
          value={value.width}
          min={1}
          max={16384}
          step={1}
          unit="px"
          disabled={disabled || value.full}
          onCommit={(width) =>
            onChange({ ...value, width: Math.round(width), preset: "custom", full: false })
          }
        />
        <span aria-hidden="true">×</span>
        <NumberInput
          label={t("height")}
          value={value.height}
          min={1}
          max={16384}
          step={1}
          unit="px"
          disabled={disabled || value.full}
          onCommit={(height) =>
            onChange({ ...value, height: Math.round(height), preset: "custom", full: false })
          }
        />
      </div>
    </div>
  );
}
