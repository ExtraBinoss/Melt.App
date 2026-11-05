import { useTranslation } from "react-i18next";
import { Box } from "lucide-react";
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
                  <div className="spatial-axis-grid">
                    {field("x", -1000, 1000)}
                    {field("y", -1000, 1000)}
                    {field("z", -1000, 1000)}
                  </div>
                  <div className="spatial-axis-grid">
                    {field("rotationX", -360000, 360000, 1)}
                    {field("rotationY", -360000, 360000, 1)}
                    {field("rotationZ", -360000, 360000, 1)}
                  </div>
                  <div className="spatial-axis-grid">
                    {field("scaleX", 0.001, 100, 0.01)}
                    {field("scaleY", 0.001, 100, 0.01)}
                    {field("scaleZ", 0.001, 100, 0.01)}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
            {!group && (
              <AccordionItem value="advanced">
                <AccordionTrigger>{t("advanced")}</AccordionTrigger>
                <AccordionContent>
                  <div className="spatial-accordion-body">
                    <div className="fields-grid">
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
