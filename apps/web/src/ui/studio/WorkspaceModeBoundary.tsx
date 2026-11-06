import { lazy, Suspense, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import type { EnginePort } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import type { TaskRunner } from "../../components/projects/ProjectDialog";
import { ExportActions } from "../../components/export/ExportActions";
import { MagicSearch, type MagicSearchProps } from "../../components/search/MagicSearch";
import { OpeningSurface } from "../../components/projects/opening/OpeningSurface";
import { currentProjectOpening } from "../../components/projects/opening/controller";
import { WorkspaceTheme } from "../brand/WorkspaceTheme";
import { useProjectPreferences } from "../../components/workspace/preferences/context";
import {
  readInitialWorkspaceMode,
  useWorkspaceMode,
  useInitialWorkspaceMode,
} from "./workspace-mode";
import { PresentedWorkspaceMode, WorkspaceChromeReadiness } from "./transition/context";
import { createWorkspaceSession } from "./transition/session";
import {
  WorkspaceChromePending,
  WorkspaceTransitionSurface,
} from "./transition/WorkspaceTransitionSurface";
import "./workspace-mode.css";

export { WorkspaceChromePending } from "./transition/WorkspaceTransitionSurface";

const StudioChrome = lazy(() =>
  import("./StudioChrome").then((module) => ({ default: module.StudioChrome })),
);
const StudioBackground = lazy(() =>
  import("./background/StudioBackground").then((module) => ({ default: module.StudioBackground })),
);
const ObjectLibrary = lazy(() =>
  import("../../components/spatial/objects/ObjectLibrary").then((module) => ({
    default: module.ObjectLibrary,
  })),
);

/** A presentation-only leaf: switching chrome never replaces the engine or canvas. */
export function WorkspaceModeBoundary({
  children,
  engine,
  editorActive = true,
}: {
  children: ReactNode;
  engine: EnginePort;
  editorActive?: boolean;
}) {
  const requested = useInitialWorkspaceMode();
  const preferences = useProjectPreferences();
  const reduced = useReducedMotion();
  const { transition, pending, attach, configure } = useMemo(
    () => createWorkspaceSession(engine, readInitialWorkspaceMode(preferences)),
    [engine, preferences],
  );
  useLayoutEffect(() => {
    configure(Boolean(reduced), editorActive);
  }, [configure, reduced, editorActive]);
  const state = useSyncExternalStore(transition.subscribe, transition.read, transition.read);
  useLayoutEffect(() => {
    if (requested) transition.request(requested);
  }, [transition, requested]);
  useLayoutEffect(() => () => transition.dispose(), [transition]);
  return (
    <PresentedWorkspaceMode value={state.mode}>
      <WorkspaceChromeReadiness value={pending}>
        <WorkspaceTheme value={state.mode}>
          <div
            ref={attach}
            className="workspace-mode-root"
            data-workspace-mode={state.mode}
            data-workspace-theme={state.mode}
            data-workspace-transition={state.phase}
            data-workspace-initializing={state.initializing ? "true" : undefined}
          >
            {children}
            {state.initializing ? (
              !currentProjectOpening() && (
                <div className="workspace-opening-surface project-opening-surface" role="status">
                  <OpeningSurface projectName={engine.getSnapshot().project.name} />
                </div>
              )
            ) : (
              <WorkspaceTransitionSurface state={state} />
            )}
          </div>
        </WorkspaceTheme>
      </WorkspaceChromeReadiness>
    </PresentedWorkspaceMode>
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
    <Suspense fallback={<WorkspaceChromePending />}>
      {mode === "studio" && (
        <>
          <StudioChrome
            {...chromeProps}
            exportControl={exportControl}
            commandControl={
              <MagicSearch
                {...chromeProps}
                onProjects={onProjects}
                onPanelMode={onPanelMode}
                tooltipSide="bottom"
              />
            }
            library={
              <ObjectLibrary engine={props.engine} onTask={props.onTask} tooltipSide="bottom" />
            }
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
