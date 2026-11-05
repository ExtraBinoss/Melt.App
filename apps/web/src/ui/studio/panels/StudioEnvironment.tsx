import { memo, useMemo } from "react";
import { Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createSpatialScene, SPATIAL_ENVIRONMENTS, type EnginePort } from "@musart/core";
import { useDocumentSnapshot } from "../../../state/session/use-document-snapshot";
import { motionTimeChanges } from "../../../state/session/motion-edit";
import { useCurrentSceneEdit } from "../../../components/spatial/use-current-scene-edit";
import { EnvironmentPicker } from "../catalog/EnvironmentPicker";
import { StudioDock } from "../controls/StudioDock";
import { StudioSlider } from "../controls/StudioSlider";
import "../../../components/spatial/messages";
import "../messages";

export const StudioEnvironment = memo(function StudioEnvironment({
  engine,
  run,
}: {
  engine: EnginePort;
  run: (task: () => void) => void;
}) {
  const { t } = useTranslation("studioChrome");
  const snapshot = useDocumentSnapshot(engine, true);
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const settings = useMemo(() => page.spatial ?? createSpatialScene(), [page.spatial]);
  const { edit, identity } = useCurrentSceneEdit(engine, page, run, settings);
  const environment = settings.environment;
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
  return (
    <StudioDock title={t("scene")} icon={<Sun size={15} />} className="studio-environment">
      <div className="studio-field-title">{t("environment")}</div>
      <EnvironmentPicker
        embedded
        value={environment.assetId ?? environment.preset}
        assetName={environment.assetId ? (asset?.name ?? t("environment")) : undefined}
        onChoose={(preset) => {
          if (current() && SPATIAL_ENVIRONMENTS.some((item) => item === preset))
            edit.commit({ ...settings, environment: { ...environment, preset, assetId: null } });
        }}
      />
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
            onStart={() => {
              if (current()) edit.begin();
            }}
            onPreview={(value) => {
              if (current())
                edit.preview(
                  { ...settings, environment: { ...environment, [key]: value } },
                  target,
                );
            }}
            onCommit={(value) => {
              if (current())
                edit.commit({ ...settings, environment: { ...environment, [key]: value } }, target);
            }}
            onCancel={edit.cancel}
          />
        );
      })}
    </StudioDock>
  );
});
