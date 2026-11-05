import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import type { EnginePort } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import type { TaskRunner } from "../../components/projects/ProjectDialog";
import { ExportActions } from "../../components/export/ExportActions";
import { MagicSearch, type MagicSearchProps } from "../../components/search/MagicSearch";
import { useWorkspaceMode } from "./workspace-mode";
import "./workspace-mode.css";

const StudioChrome = lazy(() =>
  import("./StudioChrome").then((module) => ({ default: module.StudioChrome })),
);
const StudioBackground = lazy(() =>
  import("./background/StudioBackground").then((module) => ({ default: module.StudioBackground })),
);
const StudioLibrary = lazy(() =>
  import("./library/StudioLibrary").then((module) => ({ default: module.StudioLibrary })),
);

/** A presentation-only leaf: switching chrome never replaces the engine or canvas. */
export function WorkspaceModeBoundary({ children }: { children: ReactNode }) {
  const mode = useWorkspaceMode();
  return (
    <div className="workspace-mode-root" data-workspace-mode={mode}>
      {children}
    </div>
  );
}

export function ClassicWorkspaceOnly({ children }: { children: ReactNode }) {
  return useWorkspaceMode() === "classic" ? children : null;
}

export function StudioWorkspaceChrome(props: {
  engine: EnginePort;
  services: EditorServices;
  onTask: TaskRunner;
  onImport: () => void;
  onExport: () => void;
  exportControl: ReactNode;
  onProjects: MagicSearchProps["onProjects"];
  onPanelMode: MagicSearchProps["onPanelMode"];
}) {
  const mode = useWorkspaceMode();
  const { exportControl, onProjects, onPanelMode, ...chromeProps } = props;
  return (
    <Suspense fallback={null}>
      {mode === "studio" && (
        <>
          <StudioChrome
            {...chromeProps}
            exportControl={exportControl}
            commandControl={
              <MagicSearch {...chromeProps} onProjects={onProjects} onPanelMode={onPanelMode} />
            }
            library={<StudioLibrary engine={props.engine} onTask={props.onTask} />}
            background={<StudioBackground engine={props.engine} onTask={props.onTask} />}
          />
        </>
      )}
    </Suspense>
  );
}

/** Both workspaces open the exact same export UI and canonical export service. */
export function StudioExportActions({
  engine,
  services,
  onTask,
  exportOpen,
  timelapseOpen,
  onExportOpenChange,
  onTimelapseOpenChange,
}: {
  engine: EnginePort;
  services: EditorServices;
  onTask: TaskRunner;
  exportOpen: boolean;
  timelapseOpen: boolean;
  onExportOpenChange: (open: boolean) => void;
  onTimelapseOpenChange: (open: boolean) => void;
}) {
  const snapshot = engine.getSnapshot();
  const page =
    snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
    snapshot.project.pages[0]!;
  return (
    <ExportActions
      engine={engine}
      services={services}
      onTask={onTask}
      page={page}
      pageCount={snapshot.project.pages.length}
      open={exportOpen}
      onOpenChange={onExportOpenChange}
      timelapseOpen={timelapseOpen}
      onTimelapseOpenChange={onTimelapseOpenChange}
    />
  );
}
