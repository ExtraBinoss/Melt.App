import { memo, useMemo } from "react";
import { Layers3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import type { EditorServices } from "../../../state/contracts";
import { useSidebarSnapshot } from "../../../components/workspace/use-sidebar-snapshot";
import { LayersPresentation } from "../../../components/workspace/LayersPresentation";
import { CompositionMode } from "../../../components/motion/CompositionMode";
import { PagesPanel } from "../../../components/pages/PagesPanel";
import { useMobileLayout } from "../../../components/workspace/mobile/use-mobile";
import { StudioDock } from "../controls/StudioDock";
import "../messages";

export const StudioCompositions = memo(function StudioCompositions({
  engine,
  services,
  run,
}: {
  engine: EnginePort;
  services: EditorServices;
  run: (task: () => void) => void;
}) {
  const { t } = useTranslation("studioChrome");
  const mobile = useMobileLayout();
  const { snapshot, historyNavigation } = useSidebarSnapshot(engine);
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const model = useMemo(
    () => ({
      page,
      project: snapshot.project,
      selection: snapshot.selection,
      historyNavigation,
      origin: { projectId: snapshot.project.id, revision: snapshot.revision },
    }),
    [page, snapshot.project, snapshot.selection, snapshot.revision, historyNavigation],
  );
  return (
    <StudioDock
      key={mobile ? "compact" : "wide"}
      title={t("compositions")}
      icon={<Layers3 size={15} />}
      className="studio-compositions"
    >
      <div className="studio-composition-mode">
        <CompositionMode engine={engine} snapshot={snapshot} />
      </div>
      <PagesPanel engine={engine} page={page} pages={snapshot.project.pages} run={run} />
      <LayersPresentation engine={engine} services={services} model={model} run={run} />
    </StudioDock>
  );
});
