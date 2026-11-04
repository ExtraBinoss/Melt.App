import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { EnginePort, Layer } from "@musart/core";
import { useDocumentSnapshot } from "../../../state/session/use-document-snapshot";
import { Inspector } from "../../../components/properties/Inspector";
import { EffectsPanel } from "../../../components/properties/EffectsPanel";
import { layerSelection } from "../../../components/layers/menu/selection";
import { useLayerPreview } from "../../../components/layers/controls/use-layer-preview";
import { MotionFieldProvider } from "../../../components/properties/motion/context";
import "../messages";

export const StudioAdvanced = memo(function StudioAdvanced({
  engine,
  run,
}: {
  engine: EnginePort;
  run: (task: () => void) => void;
}) {
  const { t } = useTranslation("studioChrome");
  const snapshot = useDocumentSnapshot(engine, true);
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const selection = useMemo(
    () => layerSelection(page, snapshot.selection),
    [page, snapshot.selection],
  );
  const layer = selection.selected.length === 1 ? selection.selected[0] : undefined;
  const edit = useLayerPreview(engine, page, snapshot.selection, run, true);
  function change(patch: Partial<Layer>, commit: boolean) {
    const next = engine.getSnapshot();
    if (
      !selection.editable ||
      next.project !== snapshot.project ||
      next.pageId !== page.id ||
      next.selection !== snapshot.selection
    )
      return edit.cancel();
    if (commit) edit.commit(patch);
    else edit.previewLayer(patch);
  }
  return (
    <div className="studio-advanced-body">
      <h2 className="studio-popover-title">{t("advanced")}</h2>
      {layer && (
        <MotionFieldProvider editor={edit}>
          <fieldset disabled={!selection.editable} className="studio-effects">
            <EffectsPanel
              engine={engine}
              layer={layer}
              onPatch={(patch) => change(patch, true)}
              onPreview={(patch) => change(patch, false)}
              onCancel={edit.cancel}
            />
          </fieldset>
        </MotionFieldProvider>
      )}
      <Inspector
        engine={engine}
        page={page}
        selected={selection.selected}
        assets={snapshot.project.assets}
        run={run}
      />
    </div>
  );
});
