import type { Composition, EnginePort, Layer } from "@musart/core";
import { FolderPlus, Ungroup } from "lucide-react";
import { useTranslation } from "react-i18next";
import { layerSelection } from "../layers/menu/selection";
import { layerActions } from "../layers/menu/actions";
import { Button } from "../ui/button";
/** Reuse the same validated, stale-safe grouping action as canvas and Layers menus. */
export function SelectionGroupAction({
  engine,
  page,
  selected,
  run,
}: {
  engine: EnginePort;
  page: Composition;
  selected: readonly Layer[];
  run: (task: () => void) => void;
}) {
  const { t } = useTranslation();
  const state = layerSelection(
    page,
    selected.map((layer) => layer.id),
  );
  if (selected.length < 2 && !state.ungroup) return null;
  const actions = layerActions(engine, page, run);
  return (
    <div className="inspector-section">
      <Button
        variant="outline"
        size="sm"
        disabled={state.ungroup ? !state.canUngroup : !state.canGroup}
        onClick={state.ungroup ? actions.ungroup : actions.group}
      >
        {state.ungroup ? <Ungroup size={14} /> : <FolderPlus size={14} />}
        {t(state.ungroup ? "ungroupLayers" : "groupLayers")}
      </Button>
    </div>
  );
}
