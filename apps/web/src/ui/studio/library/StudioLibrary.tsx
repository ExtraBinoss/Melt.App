import { useState } from "react";
import type { EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { SpatialLibrary } from "../../../components/spatial/SpatialLibrary";
import { ShapePalette } from "../../../components/assets/ShapePalette";
import { Switch } from "../../../components/ui/switch";
import type { TaskRunner } from "../../../components/projects/ProjectDialog";
import { StudioPackLibrary } from "./StudioPackLibrary";
import { insertStudioVector } from "./vector";
import "./messages";
import "./library.css";

export function StudioLibrary({ engine, onTask }: { engine: EnginePort; onTask: TaskRunner }) {
  const { t } = useTranslation("studioLibrary");
  return (
    <SpatialLibrary
      engine={engine}
      tooltipSide="bottom"
      vectorLibrary={{
        label: t("vectors"),
        content: <VectorLibrary engine={engine} onTask={onTask} />,
      }}
      modelPacks={{
        label: t("packs"),
        content: <StudioPackLibrary engine={engine} onTask={onTask} />,
      }}
    />
  );
}
function VectorLibrary({ engine, onTask }: { engine: EnginePort; onTask: TaskRunner }) {
  const { t } = useTranslation("studioLibrary");
  const [extrude, setExtrude] = useState(true);
  return (
    <div className="studio-vector-library">
      <label className="studio-vector-mode">
        <span>{t("extrude")}</span>
        <Switch checked={extrude} onCheckedChange={setExtrude} />
      </label>
      <p className="studio-library-hint">{t("extrudeHint")}</p>
      <ShapePalette
        engine={engine}
        onChoose={(asset) => {
          void onTask(() => {
            insertStudioVector(engine, asset, extrude);
          });
        }}
      />
    </div>
  );
}
