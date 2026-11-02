import type { EnginePort } from "@musart/core";
import { PenTool } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EditorServices } from "../../state/contracts";
import type { TaskRunner } from "../projects/ProjectDialog";
import { ExportActions } from "../export/ExportActions";

export function InspectorExportHeader({
  engine,
  services,
  onTask,
  open,
  onOpenChange,
  timelapseOpen,
  onTimelapseOpenChange,
}: {
  engine: EnginePort;
  services: EditorServices;
  onTask: TaskRunner;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timelapseOpen: boolean;
  onTimelapseOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  // The engine-backed export workspace reads its canonical document when opened.
  const snapshot = engine.getSnapshot();
  const page =
    snapshot.project.pages.find((page) => page.id === snapshot.pageId) ??
    snapshot.project.pages[0]!;
  return (
    <section className="inspector-section inspector-header">
      <span className="inspector-design-label">
        <PenTool size={13} />
        {t("design")}
      </span>
      <ExportActions
        engine={engine}
        services={services}
        onTask={onTask}
        open={open}
        onOpenChange={onOpenChange}
        timelapseOpen={timelapseOpen}
        onTimelapseOpenChange={onTimelapseOpenChange ?? ignoreTimelapseChange}
        page={page}
        pageCount={snapshot.project.pages.length}
      />
    </section>
  );
}

function ignoreTimelapseChange() {}
