import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { EditorServices } from "../../../state/contracts";
import type { TaskRunner } from "../../projects/ProjectDialog";
import { BACKGROUND_MODEL } from "../../../services/selection/model/manifest";
import { ManagedModel, SegmentationModel } from "./SegmentationModel";
export function SelectionModels({
  services,
  onTask,
}: {
  services: EditorServices;
  onTask: TaskRunner;
}) {
  const { t } = useTranslation("pixelSelection");
  const details = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => {
    const models = [services.backgroundModel, services.segmentationModel].filter(
      (model) => model !== undefined,
    );
    const showProgress = () => {
      if (
        models.some((model) => ["loading", "initializing", "error"].includes(model.read().phase)) &&
        details.current
      )
        details.current.open = true;
    };
    const stops = models.map((model) => model.subscribe(showProgress));
    showProgress();
    return () => {
      for (const stop of stops) stop();
    };
  }, [services]);
  return (
    <details ref={details} className="object-selection-models">
      <summary>{t("objectModels")}</summary>
      {services.backgroundModel && (
        <ManagedModel
          model={services.backgroundModel}
          manifest={BACKGROUND_MODEL}
          onTask={onTask}
        />
      )}
      <SegmentationModel services={services} onTask={onTask} />
    </details>
  );
}
