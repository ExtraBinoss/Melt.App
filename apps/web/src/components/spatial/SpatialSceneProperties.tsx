import { InfoTooltip } from "../shared/InfoTooltip";
import { useTranslation } from "react-i18next";
import { Plus, Sun, Trash2, Upload } from "lucide-react";
import {
  createSpatialLight,
  createSpatialScene,
  SPATIAL_ENVIRONMENTS,
  type Composition,
  type EnginePort,
  type SpatialLight,
  type SpatialScene,
} from "@musart/core";
import { useRef, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { NumberInput } from "../shared/NumberInput";
import { IconButton } from "../shared/IconButton";
import { SelectField } from "../shared/SelectField";
import { SpatialLightEditor } from "./SpatialLightEditor";
import { useScenePreview } from "./use-scene-preview";
import { LIGHTING_RIGS, lightingRig } from "./lighting-presets";
import { importSpatialEnvironment } from "../../services/assets/spatial-import";
import "./messages";
import "./spatial.css";
export function SpatialSceneProperties({
  engine,
  page,
  run,
}: {
  engine: EnginePort;
  page: Composition;
  run: (task: () => void) => void;
}) {
  const { t } = useTranslation("spatial");
  const settings = page.spatial ?? createSpatialScene();
  const edit = useScenePreview(engine, page, run);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const environment = settings.environment,
    camera = settings.camera;
  const changeEnvironment = (patch: Partial<SpatialScene["environment"]>, commit: boolean) =>
    (commit ? edit.commit : edit.preview)({
      ...settings,
      environment: { ...environment, ...patch },
    });
  const changeCamera = (patch: Partial<SpatialScene["camera"]>, commit: boolean) =>
    (commit ? edit.commit : edit.preview)({ ...settings, camera: { ...camera, ...patch } });
  const changeLight = (value: SpatialLight, commit: boolean) =>
    (commit ? edit.commit : edit.preview)({
      ...settings,
      lights: settings.lights.map((light) => (light.id === value.id ? value : light)),
    });
  function cameraField(
    key: "fov" | "yaw" | "pitch" | "distance",
    min: number,
    max: number,
    step = 1,
  ) {
    return (
      <NumberInput
        label={t(key)}
        identity={page}
        value={camera[key]}
        min={min}
        max={max}
        step={step}
        unit={key === "distance" ? undefined : "°"}
        onPreview={(value) => changeCamera({ [key]: value }, false)}
        onCommit={(value) => changeCamera({ [key]: value }, true)}
        onCancel={edit.cancel}
      />
    );
  }
  return (
    <section className="inspector-section spatial-properties">
      <div className="spatial-title">
        <h3>
          <Sun size={13} />
          {t("environment")}
        </h3>
        <IconButton
          label={t("importEnvironment")}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={13} />
        </IconButton>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept=".hdr,.exr,image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setBusy(true);
          setError("");
          void importSpatialEnvironment(engine, file)
            .catch(() => setError(t("errors.import")))
            .finally(() => setBusy(false));
        }}
      />
      {error && (
        <p role="status" className="spatial-import-error">
          {error}
        </p>
      )}
      <SelectField
        label={t("environment")}
        identity={page}
        value={environment.assetId ?? environment.preset}
        options={[
          ...(environment.assetId
            ? [
                {
                  value: environment.assetId,
                  label:
                    engine.getSnapshot().project.assets[environment.assetId]?.name ??
                    t("environment"),
                },
              ]
            : []),
          ...SPATIAL_ENVIRONMENTS.map((value) => ({ value, label: t(`environments.${value}`) })),
        ]}
        onPreview={(preset) => {
          if (SPATIAL_ENVIRONMENTS.some((value) => value === preset))
            changeEnvironment({ preset, assetId: null }, false);
        }}
        onPreviewCancel={edit.cancel}
        onValueChange={(preset) => {
          if (SPATIAL_ENVIRONMENTS.some((value) => value === preset))
            changeEnvironment({ preset, assetId: null }, true);
        }}
      />
      <div className="fields-grid">
        <NumberInput
          label={t("intensity")}
          identity={page}
          value={environment.intensity}
          min={0}
          max={10}
          step={0.1}
          onPreview={(intensity) => changeEnvironment({ intensity }, false)}
          onCommit={(intensity) => changeEnvironment({ intensity }, true)}
          onCancel={edit.cancel}
        />
        <NumberInput
          label={t("rotation")}
          identity={page}
          value={environment.rotation}
          min={-360}
          max={360}
          step={1}
          unit="°"
          onPreview={(rotation) => changeEnvironment({ rotation }, false)}
          onCommit={(rotation) => changeEnvironment({ rotation }, true)}
          onCancel={edit.cancel}
        />
      </div>
      <div className="spatial-title">
        <span>{t("reflections")}</span>
        <InfoTooltip label={t("reflections")}>{t("reflectionsHint")}</InfoTooltip>
      </div>
      <SelectField
        label={t("reflections")}
        identity={page}
        value={settings.reflections?.mode ?? "scene"}
        options={[
          { value: "scene", label: t("sceneReflections") },
          { value: "environment", label: t("environmentReflections") },
        ]}
        onValueChange={(mode) =>
          edit.commit({
            ...settings,
            reflections: {
              mode: mode as "scene" | "environment",
              quality: settings.reflections?.quality ?? "balanced",
            },
          })
        }
      />
      {(settings.reflections?.mode ?? "scene") === "scene" && (
        <SelectField
          label={t("reflectionQuality")}
          identity={page}
          value={settings.reflections?.quality ?? "balanced"}
          options={["draft", "balanced", "high"].map((value) => ({
            value,
            label: t(`reflectionQualities.${value}`),
          }))}
          onValueChange={(quality) =>
            edit.commit({
              ...settings,
              reflections: { mode: "scene", quality: quality as "draft" | "balanced" | "high" },
            })
          }
        />
      )}
      <div className="spatial-title">
        <h3>{t("lights")}</h3>
        <Popover>
          <PopoverTrigger asChild>
            <IconButton label={t("lights")}>
              <Plus size={13} />
            </IconButton>
          </PopoverTrigger>
          <PopoverContent align="end" className="spatial-preset-menu">
            {(["directional", "point", "spot"] as const).map((type) => (
              <Button
                key={type}
                variant="ghost"
                disabled={settings.lights.length >= 8}
                onClick={() =>
                  edit.commit({
                    ...settings,
                    lights: [
                      ...settings.lights,
                      { ...createSpatialLight(type), id: crypto.randomUUID() },
                    ],
                  })
                }
              >
                {t(`lightTypes.${type}`)}
              </Button>
            ))}
            <span className="muted-description">{t("presets")}</span>
            {LIGHTING_RIGS.map((rig) => (
              <Button
                key={rig}
                variant="ghost"
                onClick={() => edit.commit({ ...settings, lights: lightingRig(rig) })}
              >
                {t(`rigs.${rig}`)}
              </Button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
      {settings.lights.map((light, index) => (
        <div className="spatial-light-row" key={light.id}>
          <Popover
            onOpenChange={(open) => {
              if (!open) edit.cancel();
            }}
          >
            <PopoverTrigger asChild>
              <Button variant="outline">
                <Sun size={13} />
                {t(`lightTypes.${light.type}`)} {index + 1}
              </Button>
            </PopoverTrigger>
            <PopoverContent side="left" align="start">
              <SpatialLightEditor
                light={light}
                onPreview={(value) => changeLight(value, false)}
                onCommit={(value) => changeLight(value, true)}
                onCancel={edit.cancel}
              />
            </PopoverContent>
          </Popover>
          <Switch
            aria-label={t("enabled")}
            checked={light.enabled}
            onCheckedChange={(enabled) => changeLight({ ...light, enabled }, true)}
          />
          <IconButton
            label={t("remove")}
            onClick={() =>
              edit.commit({
                ...settings,
                lights: settings.lights.filter((item) => item.id !== light.id),
              })
            }
          >
            <Trash2 size={12} />
          </IconButton>
        </div>
      ))}
      <label className="spatial-compact-row">
        {t("shadows")}
        <Switch
          aria-label={t("shadows")}
          checked={settings.shadows}
          onCheckedChange={(shadows) => edit.commit({ ...settings, shadows })}
        />
      </label>
      <Accordion type="single" collapsible className="spatial-accordion">
        <AccordionItem value="camera">
          <AccordionTrigger>{t("camera")}</AccordionTrigger>
          <AccordionContent>
            <div className="spatial-accordion-body">
              <SelectField
                label={t("camera")}
                identity={page}
                value={camera.projection}
                options={["perspective", "orthographic"].map((value) => ({
                  value,
                  label: t(value),
                }))}
                onValueChange={(projection) =>
                  changeCamera(
                    { projection: projection as SpatialScene["camera"]["projection"] },
                    true,
                  )
                }
              />
              <div className="fields-grid">
                {cameraField("yaw", -360000, 360000)}
                {cameraField("pitch", -89.9, 89.9)}
                {cameraField("distance", 0.2, 100, 0.1)}
                {camera.projection === "perspective" && cameraField("fov", 5, 120)}
              </div>
              <Button
                variant="ghost"
                onClick={() => changeCamera(createSpatialScene().camera, true)}
              >
                {t("reset")}
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
