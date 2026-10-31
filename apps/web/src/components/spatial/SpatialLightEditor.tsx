import { SceneMotionValue } from "./SceneMotionValue";
import { SceneMotionField } from "./SceneMotionField";
import { useTranslation } from "react-i18next";
import {
  LIGHT_MOTION_SCHEMAS,
  type EnginePort,
  type LightMotionProperty,
  type SpatialLight,
} from "@musart/core";
import { ColorControl } from "../properties/ColorControl";
import { SceneNumberInput as NumberInput } from "./SceneNumberInput";
import { SelectField } from "../shared/SelectField";
import { Switch } from "../ui/switch";
interface Props {
  light: SpatialLight;
  engine?: EnginePort;
  compositionId?: string;
  onPreview: (value: SpatialLight, property?: LightMotionProperty) => void;
  onCommit: (value: SpatialLight, property?: LightMotionProperty) => void;
  onCancel: () => void;
  onStart?: () => void;
}
export function SpatialLightEditor({
  light,
  engine,
  compositionId,
  onPreview,
  onCommit,
  onCancel,
  onStart,
}: Props) {
  const { t } = useTranslation("spatial");
  const target = (property: LightMotionProperty) =>
    compositionId
      ? { kind: "light" as const, compositionId, lightId: light.id, property }
      : undefined;
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
    const descriptor = LIGHT_MOTION_SCHEMAS[key];
    return (
      <SceneMotionField key={key} engine={engine} target={target(key)} label={label}>
        <NumberInput
          key={key}
          engine={engine}
          target={target(key)}
          onStart={onStart}
          label={label}
          value={light[key]}
          identity={light}
          min={descriptor.kind === "number" ? descriptor.min : min}
          max={descriptor.kind === "number" ? descriptor.max : max}
          step={step}
          onPreview={(value) => onPreview({ ...light, [key]: value }, key)}
          onCommit={(value) => onCommit({ ...light, [key]: value }, key)}
          onCancel={onCancel}
        />
      </SceneMotionField>
    );
  }
  return (
    <div className="spatial-light-editor">
      <SceneMotionField engine={engine} target={target("type")} label={t("lights")}>
        <SceneMotionValue engine={engine} target={target("type")} fallback={light.type}>
          {(value) => (
            <SelectField
              label={t("lights")}
              value={value as typeof light.type}
              identity={light}
              options={(["directional", "point", "spot"] as const).map((value) => ({
                value,
                label: t(`lightTypes.${value}`),
              }))}
              onValueChange={(type) =>
                onCommit({ ...light, type: type as SpatialLight["type"] }, "type")
              }
            />
          )}
        </SceneMotionValue>
      </SceneMotionField>
      <SceneMotionField engine={engine} target={target("color")} label={t("color")}>
        <SceneMotionValue engine={engine} target={target("color")} fallback={light.color}>
          {(value) => (
            <ColorControl
              value={value as typeof light.color}
              identity={light.id}
              alpha={false}
              onPreview={(color) => onPreview({ ...light, color }, "color")}
              onCommit={(color) => onCommit({ ...light, color }, "color")}
              onCancel={onCancel}
            />
          )}
        </SceneMotionValue>
      </SceneMotionField>
      {field("intensity", 0, 100, 0.1)}
      <div className="spatial-axis-grid">
        {field("x", -1000, 1000)}
        {field("y", -1000, 1000)}
        {field("z", -1000, 1000)}
      </div>
      <SceneMotionValue engine={engine} target={target("type")} fallback={light.type}>
        {(type) => (
          <>
            {type !== "point" && (
              <div className="spatial-axis-grid">
                {field("targetX", -1000, 1000)}
                {field("targetY", -1000, 1000)}
                {field("targetZ", -1000, 1000)}
              </div>
            )}
            {type === "spot" && (
              <div className="fields-grid">
                {field("angle", 1, 89, 1)}
                {field("softness", 0, 1, 0.01)}
              </div>
            )}
          </>
        )}
      </SceneMotionValue>
      {(["enabled", "castShadow"] as const).map((key) => (
        <SceneMotionField key={key} engine={engine} target={target(key)} label={t(key)}>
          <label className="spatial-compact-row">
            {t(key)}
            <SceneMotionValue engine={engine} target={target(key)} fallback={light[key]}>
              {(value) => (
                <Switch
                  aria-label={t(key)}
                  checked={value as boolean}
                  onCheckedChange={(value) => onCommit({ ...light, [key]: value }, key)}
                />
              )}
            </SceneMotionValue>
          </label>
        </SceneMotionField>
      ))}
    </div>
  );
}
