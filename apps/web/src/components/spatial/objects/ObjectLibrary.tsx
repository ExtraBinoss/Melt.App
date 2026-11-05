import { useState } from "react";
import type { EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { SpatialLibrary, type SpatialLibraryPanelContext } from "../SpatialLibrary";
import { publishEditorNotice } from "../../notifications/source";
import "../../notifications/messages";
import { ShapePalette } from "../../assets/ShapePalette";
import { Switch } from "../../ui/switch";
import type { TaskRunner } from "../../projects/ProjectDialog";
import { ModelPackLibrary } from "./ModelPackLibrary";
import { insertLibraryVector } from "./vector";
import "./messages";
import "./library.css";

export function ObjectLibrary({
  engine,
  onTask,
  tooltipSide,
}: {
  engine: EnginePort;
  onTask: TaskRunner;
  tooltipSide?: "top" | "right" | "bottom" | "left";
}) {
  const { t } = useTranslation("studioLibrary");
  return (
    <SpatialLibrary
      engine={engine}
      tooltipSide={tooltipSide}
      vectorLibrary={{
        label: t("vectors"),
        content: (context) => <VectorLibrary engine={engine} onTask={onTask} {...context} />,
      }}
      modelPacks={{
        label: t("packs"),
        content: (context) => <ModelPackLibrary engine={engine} onTask={onTask} {...context} />,
      }}
    />
  );
}
function VectorLibrary({
  engine,
  onTask,
  query,
  close,
}: { engine: EnginePort; onTask: TaskRunner } & SpatialLibraryPanelContext) {
  const { t } = useTranslation("studioLibrary");
  const { t: common } = useTranslation();
  const [extrude, setExtrude] = useState(true);
  return (
    <div className="studio-vector-library">
      <label className="studio-vector-mode">
        <span>{t("extrude")}</span>
        <Switch checked={extrude} onCheckedChange={setExtrude} />
      </label>
      <ShapePalette
        engine={engine}
        searchQuery={query}
        compact
        onChoose={(asset) => {
          void onTask(() => {
            const layer = insertLibraryVector(engine, asset, extrude);
            publishEditorNotice(engine, {
              message: common("objectAdded", { ns: "notices", name: layer.name }),
              error: false,
            });
            close();
          });
        }}
      />
    </div>
  );
}
