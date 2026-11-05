import { useEngineValue } from "../../state/session/editor";
import { resolveInspectorPage } from "../properties/inspector-scope";
import { useSceneMotionNavigation } from "./use-scene-motion-navigation";
import { SceneAnimations } from "../motion/scene/SceneAnimations";
import { SceneMotionValue } from "./SceneMotionValue";
import { SceneMotionField } from "./SceneMotionField";
import { InfoTooltip } from "../shared/InfoTooltip";
import { useTranslation } from "react-i18next";
import { Plus, Sun, Trash2, Upload } from "lucide-react";
import {
  createSpatialLight,
  createSpatialScene,
  type Composition,
  type EnginePort,
  type SpatialLight,
  type SpatialScene,
  type LightMotionProperty,
  type SceneMotionPropertyTarget,
  type SceneAnimationOwner,
  CAMERA_MOTION_SCHEMAS,
} from "@musart/core";
import { createContext, memo, useContext, useMemo, useRef, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { SceneNumberInput as NumberInput } from "./SceneNumberInput";
import { IconButton } from "../shared/IconButton";
import { SelectField } from "../shared/SelectField";
import { SpatialLightEditor } from "./SpatialLightEditor";
import { useCurrentSceneEdit } from "./use-current-scene-edit";
import { LIGHTING_RIGS, lightingRig } from "./lighting-presets";
import { importSpatialEnvironment } from "../../services/assets/spatial-import";
import { useWorkspaceMode } from "../../ui/studio/workspace-mode";
import { EnvironmentControl } from "./EnvironmentControl";
import "./messages";
import "./spatial.css";
const ScenePage = createContext<Composition | null>(null);

export function SpatialSceneProperties({
  engine,
  page: originPage,
  run,
}: {
  engine: EnginePort;
  page: Composition;
  run: (task: () => void) => void;
}) {
  // Rebind only the lightweight owner; unchanged settings retain the expensive view.
  const page = useEngineValue(engine, () => resolveInspectorPage(engine, originPage) ?? originPage);
  const settings = useMemo(() => page.spatial ?? createSpatialScene(), [page.spatial]);
  const binding = useCurrentSceneEdit(engine, page, run, settings);
  const showEnvironment = useWorkspaceMode() !== "studio";
  return (
    <ScenePage value={page}>
      <SpatialSceneView
        key={binding.owner}
        engine={engine}
        pageId={page.id}
        settings={settings}
        identity={binding.identity}
        edit={binding.edit}
        run={run}
        showEnvironment={showEnvironment}
      />
    </ScenePage>
  );
}

/** Animation actions still receive the exact live page required by their stale-page guards. */
function CurrentSceneAnimations({
  engine,
  owner,
}: {
  engine: EnginePort;
  owner: SceneAnimationOwner;
}) {
  const page = useContext(ScenePage)!;
  return <SceneAnimations engine={engine} page={page} owner={owner} />;
}

const SpatialSceneView = memo(function SpatialSceneView({
  engine,
  pageId,
  settings,
  identity,
  edit,
  run,
  showEnvironment,
}: {
  engine: EnginePort;
  pageId: string;
  settings: SpatialScene;
  identity: ReturnType<typeof useCurrentSceneEdit>["identity"];
  edit: ReturnType<typeof useCurrentSceneEdit>["edit"];
  run: (task: () => void) => void;
  showEnvironment: boolean;
}) {
  const { t } = useTranslation("spatial");
  const navigation = useSceneMotionNavigation(engine);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const camera = settings.camera;
  const changeCamera = (patch: Partial<SpatialScene["camera"]>, commit: boolean) =>
    (commit ? edit.commit : edit.preview)(
      { ...settings, camera: { ...camera, ...patch } },
      Object.keys(patch).length === 1
        ? ({
            kind: "camera",
            compositionId: pageId,
            property: Object.keys(patch)[0],
          } as SceneMotionPropertyTarget)
        : undefined,
    );
  const changeLight = (value: SpatialLight, commit: boolean, property?: LightMotionProperty) =>
    (commit ? edit.commit : edit.preview)(
      {
        ...settings,
        lights: settings.lights.map((light) => (light.id === value.id ? value : light)),
      },
      property ? { kind: "light", compositionId: pageId, lightId: value.id, property } : undefined,
    );
  function cameraField(
    key: "fov" | "yaw" | "pitch" | "distance",
    min: number,
    max: number,
    step = 1,
  ) {
    const descriptor = CAMERA_MOTION_SCHEMAS[key];
    return (
      <SceneMotionField
        engine={engine}
        target={{ kind: "camera", compositionId: pageId, property: key }}
        label={t(key)}
      >
        <NumberInput
          engine={engine}
          target={{ kind: "camera", compositionId: pageId, property: key }}
          onStart={edit.begin}
          label={t(key)}
          identity={identity}
          value={camera[key]}
          min={descriptor.kind === "number" ? descriptor.min : min}
          max={descriptor.kind === "number" ? descriptor.max : max}
          step={step}
          unit={key === "distance" ? undefined : "°"}
          onPreview={(value) => changeCamera({ [key]: value }, false)}
          onCommit={(value) => changeCamera({ [key]: value }, true)}
          onCancel={edit.cancel}
        />
      </SceneMotionField>
    );
  }
  return (
    <section className="inspector-section spatial-properties">
      {showEnvironment && (
        <>
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
          <EnvironmentControl engine={engine} run={run} presentation="classic" />
        </>
      )}
      <div className="spatial-title">
        <span>{t("reflections")}</span>
        <InfoTooltip label={t("reflections")}>{t("reflectionsHint")}</InfoTooltip>
      </div>
      <SelectField
        label={t("reflections")}
        identity={identity}
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
          identity={identity}
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
            open={navigation.light === light.id}
            onOpenChange={(open) => {
              navigation.setLight(open ? light.id : null);
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
                engine={engine}
                compositionId={pageId}
                onPreview={(value, property) => changeLight(value, false, property)}
                onCommit={(value, property) => changeLight(value, true, property)}
                onCancel={edit.cancel}
                onStart={edit.begin}
              />
              <CurrentSceneAnimations
                engine={engine}
                owner={{ kind: "light", compositionId: pageId, lightId: light.id }}
              />
            </PopoverContent>
          </Popover>
          <Switch
            aria-label={t("enabled")}
            checked={light.enabled}
            onCheckedChange={(enabled) => changeLight({ ...light, enabled }, true, "enabled")}
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
      <Accordion
        type="single"
        collapsible
        className="spatial-accordion"
        value={navigation.camera}
        onValueChange={navigation.setCamera}
      >
        <AccordionItem value="camera">
          <AccordionTrigger>{t("camera")}</AccordionTrigger>
          <AccordionContent>
            <div className="spatial-accordion-body">
              <SceneMotionField
                engine={engine}
                target={{ kind: "camera", compositionId: pageId, property: "projection" }}
                label={t("projection")}
              >
                <SceneMotionValue
                  engine={engine}
                  target={{ kind: "camera", compositionId: pageId, property: "projection" }}
                  fallback={camera.projection}
                >
                  {(value) => (
                    <SelectField
                      label={t("projection")}
                      identity={identity}
                      value={value as string}
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
                  )}
                </SceneMotionValue>
              </SceneMotionField>
              <div className="fields-grid">
                {cameraField("yaw", -360000, 360000)}
                {cameraField("pitch", -89.9, 89.9)}
                {cameraField("distance", 0.2, 100, 0.1)}
                {camera.projection === "perspective" && cameraField("fov", 5, 120)}
              </div>
              <CurrentSceneAnimations
                engine={engine}
                owner={{ kind: "camera", compositionId: pageId }}
              />
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
});
