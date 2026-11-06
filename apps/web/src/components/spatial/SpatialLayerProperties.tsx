import { useTranslation } from "react-i18next";
import {
  Blend,
  Box,
  CircleDashed,
  Diamond,
  Flame,
  Layers,
  Move3D,
  Rainbow,
  Rotate3D,
  Scaling,
  Settings2,
  Spline,
  Sun,
  Waves,
  type LucideIcon,
} from "lucide-react";
import {
  createSpatialLayer,
  type EnginePort,
  type Layer,
  type SpatialLayer,
  type SpatialMotionProperty,
} from "@musart/core";
import { SelectField } from "../shared/SelectField";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Switch } from "../ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { MotionNumberInput } from "../properties/motion/MotionNumberInput";
import { MaterialControl } from "./MaterialControl";
import { useWorkspaceMode } from "../../ui/studio/workspace-mode";
import "./messages";
const transformRows = [
  { label: "position", icon: Move3D, fields: ["x", "y", "z"], min: -1000, max: 1000, step: 0.1 },
  {
    label: "rotation",
    icon: Rotate3D,
    fields: ["rotationX", "rotationY", "rotationZ"],
    min: -360000,
    max: 360000,
    step: 1,
  },
  {
    label: "scale",
    icon: Scaling,
    fields: ["scaleX", "scaleY", "scaleZ"],
    min: 0.001,
    max: 100,
    step: 0.01,
  },
] as const;
const parameterIcons: Readonly<Record<string, LucideIcon>> = {
  transmission: Blend,
  ior: Diamond,
  clearcoat: Layers,
  clearcoatRoughness: Waves,
  sheen: Sun,
  iridescence: Rainbow,
  emissiveIntensity: Flame,
  opacity: CircleDashed,
  bevelSegments: Spline,
  curveSegments: Spline,
};
function parameterLabel(key: string, label: string) {
  const Icon = parameterIcons[key] ?? Settings2;
  return (
    <span className="spatial-parameter-label" title={label}>
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
interface Props {
  engine: EnginePort;
  run: (task: () => void) => void;
  layer: Layer;
  patch: (value: Partial<Layer>) => void;
  preview: (value: Partial<Layer>) => void;
  cancel: () => void;
}
export function SpatialLayerProperties({ engine, layer, patch, preview, cancel, run }: Props) {
  const { t } = useTranslation("spatial");
  const showMaterial = useWorkspaceMode() !== "studio";
  const spatial = layer.spatial;
  const group = layer.kind === "group" && spatial?.source === "group";
  if (!group && !["rectangle", "ellipse", "text", "vector"].includes(layer.kind)) return null;
  const settings =
    spatial ??
    createSpatialLayer(
      layer.kind === "text" || layer.kind === "vector"
        ? "extrude"
        : layer.kind === "ellipse"
          ? "sphere"
          : "box",
    );
  const locked = layer.locked;
  const unsupported =
    settings.source === "extrude"
      ? layer.kind === "vector" &&
        (layer.vector?.strokeOnly || (layer.vector?.parts?.length ?? 1) > 256)
        ? "filledOutlines"
        : layer.kind === "text" && layer.text.length > 4096
          ? "textLimit"
          : null
      : null;
  const asset = layer.assetId ? engine.getSnapshot().project.assets[layer.assetId] : null;
  const clips = asset && "clips" in asset ? (asset.clips ?? []) : [];

  function update(value: Partial<SpatialLayer>, commit: boolean) {
    (commit ? patch : preview)({ spatial: { ...settings, ...value } });
  }
  function field(
    key:
      | "x"
      | "y"
      | "z"
      | "rotationX"
      | "rotationY"
      | "rotationZ"
      | "scaleX"
      | "scaleY"
      | "scaleZ"
      | "depth"
      | "bevel"
      | "bevelSegments"
      | "curveSegments"
      | "clipTime",
    min: number,
    max: number,
    step = 0.1,
  ) {
    const axis = key.slice(-1).toUpperCase();
    const label = ["x", "y", "z"].includes(key)
      ? t("positionAxis", { axis })
      : key.startsWith("rotation")
        ? t("rotationAxis", { axis })
        : key.startsWith("scale")
          ? t("scaleAxis", { axis })
          : t(key);
    return (
      <MotionNumberInput
        key={key}
        engine={engine}
        target={{ kind: "layer", layerId: layer.id, property: `spatial.${key}` }}
        identity={layer}
        label={label}
        scrubLabel={
          key.length === 1 || /^(rotation|scale)[XYZ]$/.test(key) ? (
            <span className="spatial-axis-label">{axis}</span>
          ) : (
            parameterLabel(key, label)
          )
        }
        value={settings[key]}
        min={min}
        max={max}
        step={step}
        unit={key.startsWith("rotation") ? "°" : key === "clipTime" ? "s" : undefined}
        disabled={locked}
        onPreview={(value) => update({ [key]: value }, false)}
        onCommit={(value) => update({ [key]: value }, true)}
        onCancel={cancel}
      />
    );
  }
  function materialField(key: keyof Omit<SpatialLayer["material"], "preset">, min = 0, max = 1) {
    const change = (value: number, commit: boolean) =>
      update(
        { material: { ...settings.material, [key]: value }, useModelMaterials: false },
        commit,
      );
    return (
      <MotionNumberInput
        key={key}
        engine={engine}
        target={{
          kind: "layer",
          layerId: layer.id,
          property: `spatial.material.${key}` as SpatialMotionProperty,
        }}
        identity={layer}
        label={t(key)}
        scrubLabel={parameterLabel(key, t(key))}
        value={settings.material[key]}
        min={min}
        max={max}
        step={0.01}
        disabled={locked}
        onPreview={(value) => change(value, false)}
        onCommit={(value) => change(value, true)}
        onCancel={cancel}
      />
    );
  }
  return (
    <section className="inspector-section spatial-properties" aria-label={t("title")}>
      <div className="spatial-title">
        <h3>
          <Box size={13} />
          {t("title")}
        </h3>
        {!group && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={unsupported ? 0 : undefined}>
                <Switch
                  aria-label={t("enable")}
                  checked={Boolean(spatial?.enabled)}
                  disabled={locked || Boolean(unsupported && !spatial?.enabled)}
                  onCheckedChange={(enabled) => patch({ spatial: { ...settings, enabled } })}
                />
              </span>
            </TooltipTrigger>
            {unsupported && <TooltipContent>{t(unsupported)}</TooltipContent>}
          </Tooltip>
        )}
      </div>
      {spatial?.enabled && (
        <>
          {!group && showMaterial && (
            <MaterialControl engine={engine} run={run} presentation="classic" />
          )}
          {showMaterial && settings.source === "glb" && (
            <label className="spatial-compact-row">
              {t("originalMaterials")}
              <Switch
                checked={settings.useModelMaterials}
                disabled={locked}
                onCheckedChange={(useModelMaterials) => update({ useModelMaterials }, true)}
              />
            </label>
          )}
          {settings.source === "extrude" && (
            <div className="fields-grid">
              {field("depth", 0.001, 100)}
              {field("bevel", 0, 2, 0.01)}
            </div>
          )}
          {settings.source === "box" && field("bevel", 0, 0.8, 0.01)}
          {settings.source === "glb" && clips.length > 0 && (
            <>
              <SelectField
                label={t("clip")}
                disabled={locked}
                value={String(settings.clip)}
                identity={layer}
                options={[
                  { value: "-1", label: t("none") },
                  ...clips.map((clip, index) => ({ value: String(index), label: clip.name })),
                ]}
                onValueChange={(value) => update({ clip: Number(value), clipTime: 0 }, true)}
              />
              {settings.clip >= 0 &&
                field("clipTime", 0, clips[settings.clip]?.duration ?? 86400, 0.01)}
            </>
          )}
          <Accordion type="multiple" className="spatial-accordion">
            <AccordionItem value="transform">
              <AccordionTrigger>{t("transform")}</AccordionTrigger>
              <AccordionContent>
                <div className="spatial-accordion-body">
                  {transformRows.map(({ label, icon: Icon, fields, min, max, step }) => (
                    <div key={label} className="spatial-transform-row" data-transform-kind={label}>
                      <div className="spatial-transform-heading" title={t(label)}>
                        <Icon size={13} aria-hidden="true" />
                        <span>{t(label)}</span>
                      </div>
                      <div className="spatial-axis-grid">
                        {fields.map((key) => field(key, min, max, step))}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
            {!group && (
              <AccordionItem value="advanced">
                <AccordionTrigger>{t("advanced")}</AccordionTrigger>
                <AccordionContent>
                  <div className="spatial-accordion-body">
                    <div className="fields-grid spatial-advanced-grid">
                      {showMaterial && (
                        <>
                          {materialField("transmission")}
                          {materialField("ior", 1, 2.333)}
                          {materialField("clearcoat")}
                          {materialField("clearcoatRoughness")}
                          {materialField("sheen")}
                          {materialField("iridescence")}
                          {materialField("emissiveIntensity", 0, 10)}
                          {materialField("opacity")}
                        </>
                      )}
                      {settings.source === "extrude" && (
                        <>
                          {field("bevelSegments", 1, 12, 1)}
                          {field("curveSegments", 3, 64, 1)}
                        </>
                      )}
                    </div>
                    {(["castShadow", "receiveShadow"] as const).map((key) => (
                      <label key={key} className="spatial-compact-row">
                        {t(key)}
                        <Switch
                          checked={settings[key]}
                          disabled={locked}
                          onCheckedChange={(value) => update({ [key]: value }, true)}
                        />
                      </label>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </>
      )}
    </section>
  );
}
