import { useTranslation } from "react-i18next";
import { createLayerGeometryIndex, type Effect, type EnginePort } from "@musart/core";
import { Button } from "../../ui/button";
export function LiquifyControls({
  engine,
  layerId,
  effect,
  onChange,
}: {
  engine?: EnginePort;
  layerId?: string;
  effect: Effect;
  onChange: (patch: Partial<Effect>) => void;
}) {
  const { t } = useTranslation("liquifyFx");
  const snapshot = engine?.getSnapshot(),
    page = snapshot?.project.pages.find((p) => p.id === snapshot.pageId);
  const owner = page?.layers.find((l) => l.id === layerId);
  const spatial =
    owner &&
    (owner.spatial?.enabled ||
      owner.spatialContext ||
      createLayerGeometryIndex(page!)
        .ancestors(owner.id)
        .some((l) => l.spatial?.enabled || l.spatialContext));
  return (
    <div className="liquify-controls">
      <p className="muted-description">{t(spatial ? "spatialHint" : "brushHint")}</p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!effect.liquify?.length}
        onClick={() => onChange({ liquify: [] })}
      >
        {t("clear")}
      </Button>
    </div>
  );
}
