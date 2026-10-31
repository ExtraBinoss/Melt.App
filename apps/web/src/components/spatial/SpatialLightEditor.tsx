import { useTranslation } from "react-i18next";
import type { SpatialLight } from "@musart/core";
import { ColorControl } from "../properties/ColorControl";
import { NumberInput } from "../shared/NumberInput";
import { SelectField } from "../shared/SelectField";
import { Switch } from "../ui/switch";
interface Props {
  light: SpatialLight;
  onPreview: (value: SpatialLight) => void;
  onCommit: (value: SpatialLight) => void;
  onCancel: () => void;
}
export function SpatialLightEditor({ light, onPreview, onCommit, onCancel }: Props) {
  const { t } = useTranslation("spatial");
  function field(
    key: "intensity" | "x" | "y" | "z" | "targetX" | "targetY" | "targetZ" | "angle" | "softness",
    min: number,
    max: number,
    step = 0.1,
  ) {
    const label =
      key.length === 1
        ? t("positionAxis", { axis: key.toUpperCase() })
        : key.startsWith("target")
          ? t("targetAxis", { axis: key.slice(-1) })
          : t(key);
    return (
      <NumberInput
        key={key}
        label={label}
        value={light[key]}
        identity={light}
        min={min}
        max={max}
        step={step}
        onPreview={(value) => onPreview({ ...light, [key]: value })}
        onCommit={(value) => onCommit({ ...light, [key]: value })}
        onCancel={onCancel}
      />
    );
  }
  return (
    <div className="spatial-light-editor">
      <SelectField
        label={t("lights")}
        value={light.type}
        identity={light}
        options={(["directional", "point", "spot"] as const).map((value) => ({
          value,
          label: t(`lightTypes.${value}`),
        }))}
        onValueChange={(type) => onCommit({ ...light, type: type as SpatialLight["type"] })}
      />
      <ColorControl
        value={light.color}
        identity={light.id}
        alpha={false}
        onPreview={(color) => onPreview({ ...light, color })}
        onCommit={(color) => onCommit({ ...light, color })}
        onCancel={onCancel}
      />
      {field("intensity", 0, 100, 0.1)}
      <div className="spatial-axis-grid">
        {field("x", -1000, 1000)}
        {field("y", -1000, 1000)}
        {field("z", -1000, 1000)}
      </div>
      {light.type !== "point" && (
        <div className="spatial-axis-grid">
          {field("targetX", -1000, 1000)}
          {field("targetY", -1000, 1000)}
          {field("targetZ", -1000, 1000)}
        </div>
      )}
      {light.type === "spot" && (
        <div className="fields-grid">
          {field("angle", 1, 89, 1)}
          {field("softness", 0, 1, 0.01)}
        </div>
      )}
      {(["enabled", "castShadow"] as const).map((key) => (
        <label key={key} className="spatial-compact-row">
          {t(key)}
          <Switch
            aria-label={t(key)}
            checked={light[key]}
            onCheckedChange={(value) => onCommit({ ...light, [key]: value })}
          />
        </label>
      ))}
    </div>
  );
}
