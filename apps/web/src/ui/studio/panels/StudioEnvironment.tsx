import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  createSpatialScene,
  SPATIAL_ENVIRONMENTS,
  SPATIAL_ENVIRONMENT_PRESETS,
  type EnginePort,
} from "@musart/core";
import { useDocumentSnapshot } from "../../../state/session/use-document-snapshot";
import { motionTimeChanges } from "../../../state/session/motion-edit";
import { useCurrentSceneEdit } from "../../../components/spatial/use-current-scene-edit";
import { EnvironmentPicker } from "../catalog/EnvironmentPicker";
import { CatalogSwatch } from "../catalog/CatalogSwatch";
import { StudioSphereDock } from "../controls/StudioSphereDock";
import { StudioDirectionPad } from "../controls/StudioDirectionPad";
import type { DirectionValue } from "../controls/StudioDirectionPad";
import { StudioSlider } from "../controls/StudioSlider";
import "../../../components/spatial/messages";
import "../messages";
import "../catalog/messages";

export const StudioEnvironment = memo(function StudioEnvironment({
  engine,
  run,
}: {
  engine: EnginePort;
  run: (task: () => void) => void;
}) {
  const { t } = useTranslation("studioChrome");
  const { t: spatialText } = useTranslation("spatial");
  const { t: catalogText } = useTranslation("studioCatalog");
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
  return (
    <StudioSphereDock
      title={t("scene")}
      icon={<CatalogSwatch kind="environments" index={Math.max(0, environmentIndex)} />}
      className="studio-environment"
    >
      <div className="studio-sphere-layout">
        <section className="studio-sphere-library" aria-label={t("environment")}>
          <div className="studio-panel-title">{t("environment")}</div>
          <EnvironmentPicker
            embedded
            value={environment.assetId ?? environment.preset}
            assetName={environment.assetId ? (asset?.name ?? t("environment")) : undefined}
            onChoose={(preset) => {
              if (current() && SPATIAL_ENVIRONMENTS.some((item) => item === preset))
                edit.commit({
                  ...settings,
                  environment: { ...environment, preset, assetId: null },
                });
            }}
          />
        </section>
        <section className="studio-sphere-properties" aria-label={t("scene")}>
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
        </section>
      </div>
    </StudioSphereDock>
  );
});
