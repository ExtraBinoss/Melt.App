import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import { useDocumentSnapshot } from "../../../state/session/use-document-snapshot";
import { Inspector } from "../../../components/properties/Inspector";
import { layerSelection } from "../../../components/layers/menu/selection";
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
  return (
    <div className="studio-advanced-body">
      <h2 className="studio-popover-title">{t("advanced")}</h2>
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
