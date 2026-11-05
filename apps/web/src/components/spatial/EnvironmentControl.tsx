import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createSpatialScene,
  SPATIAL_ENVIRONMENTS,
  SPATIAL_ENVIRONMENT_PRESETS,
  type EnginePort,
} from "@musart/core";
import { useDocumentSnapshot } from "../../state/session/use-document-snapshot";
import { motionTimeChanges } from "../../state/session/motion-edit";
import { useCurrentSceneEdit } from "./use-current-scene-edit";
import { EnvironmentPicker } from "./EnvironmentPicker";
import { SceneAnimations } from "../motion/scene/SceneAnimations";
import { animationPresentation } from "../motion/animations/presentation";
import { CatalogSwatch } from "../../ui/studio/catalog/CatalogSwatch";
import { SceneSpherePopover } from "./SceneSpherePopover";
import { StudioDirectionPad } from "../../ui/studio/controls/StudioDirectionPad";
import type { DirectionValue } from "../../ui/studio/controls/StudioDirectionPad";
import { StudioSlider } from "../../ui/studio/controls/StudioSlider";
import "./messages";
import "../../ui/studio/messages";
import "../../ui/studio/catalog/messages";

export const EnvironmentControl = memo(function EnvironmentControl({
  engine,
  run,
  presentation = "studio",
}: {
  engine: EnginePort;
  presentation?: "classic" | "studio";
  run: (task: () => void) => void;
}) {
  const { t } = useTranslation("studioChrome");
  const { t: spatialText } = useTranslation("spatial");
  const { t: catalogText } = useTranslation("studioCatalog");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const source = animationPresentation(engine);
    const reveal = () => {
      const request = source.readEditorRequest();
      if (
        request?.owner.kind === "environment" ||
        (request?.owner.kind === "camera" && presentation === "studio")
      ) {
        setOpen(true);
        source.consumeEditorRequest(request);
      }
    };
    const stop = source.subscribeEditor(reveal);
    reveal();
    return stop;
  }, [engine, presentation]);
  const snapshot = useDocumentSnapshot(engine, true);
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const settings = useMemo(() => page.spatial ?? createSpatialScene(), [page.spatial]);
  const { edit, identity } = useCurrentSceneEdit(engine, page, run, settings);
  const { environment, camera } = settings;
  const current = () => {
    const next = engine.getSnapshot();
    return (
      next.project.id === snapshot.project.id &&
      next.pageId === page.id &&
      next.project.pages.find((item) => item.id === page.id) === page &&
      next.selection === snapshot.selection
    );
  };
  const asset = environment.assetId ? snapshot.project.assets[environment.assetId] : undefined;
  const environmentIndex = SPATIAL_ENVIRONMENT_PRESETS.findIndex(
    (item) => item.id === environment.preset,
  );
  function direction(value: DirectionValue, commit: boolean) {
    if (!current()) return edit.cancel();
    const next = { ...settings, camera: { ...camera, yaw: value.x, pitch: value.y } };
    if (commit) edit.commit(next);
    else edit.preview(next);
  }
  function environmentPreset(preset: string, commit: boolean) {
    if (!current()) return edit.cancel();
    if (!SPATIAL_ENVIRONMENTS.some((item) => item === preset)) return;
    const next = { ...settings, environment: { ...environment, preset, assetId: null } };
    if (commit) edit.commit(next);
    else edit.preview(next);
  }
  return (
    <SceneSpherePopover
      presentation={presentation}
      open={open}
      onOpenChange={setOpen}
      title={t(presentation === "classic" ? "environment" : "scene")}
      icon={<CatalogSwatch kind="environments" index={Math.max(0, environmentIndex)} />}
      className="studio-environment"
    >
      <div className="studio-sphere-layout">
        <section role="group" className="studio-sphere-library" aria-label={t("environment")}>
          <div className="studio-panel-title">{t("environment")}</div>
          <EnvironmentPicker
            embedded
            identity={identity}
            value={environment.assetId ?? environment.preset}
            assetName={environment.assetId ? (asset?.name ?? t("environment")) : undefined}
            onPreview={(preset) => environmentPreset(preset, false)}
            onCancel={edit.cancel}
            onChoose={(preset) => environmentPreset(preset, true)}
          />
        </section>
        <section role="group" className="studio-sphere-properties" aria-label={t("scene")}>
          <div className="studio-panel-title">{catalogText("direction")}</div>
          <StudioDirectionPad
            label={catalogText("direction")}
            value={{ x: camera.yaw, y: camera.pitch }}
            minX={-180}
            maxX={180}
            minY={-89}
            maxY={89}
            identity={identity}
            invalidation={motionTimeChanges(engine)}
            onStart={edit.begin}
            onPreview={(value) => direction(value, false)}
            onCommit={(value) => direction(value, true)}
            onCancel={edit.cancel}
          />
          {(["distance", "fov"] as const).map((key) => (
            <StudioSlider
              key={key}
              identity={identity}
              invalidation={motionTimeChanges(engine)}
              label={spatialText(key)}
              value={camera[key]}
              min={key === "distance" ? 0.2 : 5}
              max={key === "distance" ? 100 : 120}
              step={key === "distance" ? 0.1 : 1}
              unit={key === "fov" ? "°" : undefined}
              disabled={key === "fov" && camera.projection !== "perspective"}
              onStart={edit.begin}
              onPreview={(value) => {
                if (current())
                  edit.preview(
                    { ...settings, camera: { ...camera, [key]: value } },
                    { kind: "camera", compositionId: page.id, property: key },
                  );
              }}
              onCommit={(value) => {
                if (current())
                  edit.commit(
                    { ...settings, camera: { ...camera, [key]: value } },
                    { kind: "camera", compositionId: page.id, property: key },
                  );
              }}
              onCancel={edit.cancel}
            />
          ))}
          <SceneAnimations
            engine={engine}
            page={page}
            owner={{ kind: "camera", compositionId: page.id }}
          />
          <div className="studio-scene-section-title">{catalogText("highlights")}</div>
          {(["intensity", "rotation"] as const).map((key) => {
            const target = { kind: "environment" as const, compositionId: page.id, property: key };
            return (
              <StudioSlider
                key={key}
                identity={identity}
                invalidation={motionTimeChanges(engine)}
                label={t(key)}
                value={environment[key]}
                min={key === "rotation" ? -180 : 0}
                max={key === "rotation" ? 180 : 10}
                step={key === "rotation" ? 1 : 0.1}
                unit={key === "rotation" ? "°" : undefined}
                onStart={edit.begin}
                onPreview={(value) => {
                  if (current())
                    edit.preview(
                      { ...settings, environment: { ...environment, [key]: value } },
                      target,
                    );
                }}
                onCommit={(value) => {
                  if (current())
                    edit.commit(
                      { ...settings, environment: { ...environment, [key]: value } },
                      target,
                    );
                }}
                onCancel={edit.cancel}
              />
            );
          })}
          <SceneAnimations
            engine={engine}
            page={page}
            owner={{ kind: "environment", compositionId: page.id }}
          />
        </section>
      </div>
    </SceneSpherePopover>
  );
});
