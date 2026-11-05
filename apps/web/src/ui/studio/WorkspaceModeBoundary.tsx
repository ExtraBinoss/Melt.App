import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import type { EnginePort } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import type { TaskRunner } from "../../components/projects/ProjectDialog";
import { ExportActions } from "../../components/export/ExportActions";
import { MagicSearch, type MagicSearchProps } from "../../components/search/MagicSearch";
import { WorkspaceTheme } from "../brand/WorkspaceTheme";
import { useProjectPreferences } from "../../components/workspace/preferences/context";
import {
  readRequestedWorkspaceMode,
  useWorkspaceMode,
  useRequestedWorkspaceMode,
} from "./workspace-mode";
import { PresentedWorkspaceMode, WorkspaceChromeReadiness } from "./transition/context";
import { WorkspaceTransition } from "./transition/controller";
import { createWorkspaceChromeMotion, createWorkspaceReadiness } from "./transition/presentation";
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
}: {
  children: ReactNode;
  engine: EnginePort;
}) {
  const requested = useRequestedWorkspaceMode();
  const preferences = useProjectPreferences();
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const reduceMotion = useRef(reduced);
  useLayoutEffect(() => {
    reduceMotion.current = reduced;
  }, [reduced]);
  const readiness = useMemo(() => createWorkspaceReadiness(engine, () => root.current), [engine]);
  const transition = useMemo(() => {
    const motion = createWorkspaceChromeMotion(
      () => root.current,
      () => Boolean(reduceMotion.current),
    );
    // A replacement project starts directly in its own saved presentation.
    return new WorkspaceTransition(readRequestedWorkspaceMode(preferences), {
      ...motion,
      ready: readiness.ready,
    });
  }, [preferences, readiness]);
  const state = useSyncExternalStore(transition.subscribe, transition.read, transition.read);
  useLayoutEffect(() => {
    transition.request(requested);
  }, [transition, requested]);
  useLayoutEffect(() => () => transition.dispose(), [transition]);
  return (
    <PresentedWorkspaceMode value={state.mode}>
      <WorkspaceChromeReadiness value={readiness.pending}>
        <WorkspaceTheme value={state.mode}>
          <div
            ref={root}
            className="workspace-mode-root"
            data-workspace-mode={state.mode}
            data-workspace-theme={state.mode}
            data-workspace-transition={state.phase}
          >
            {children}
            <WorkspaceTransitionSurface state={state} />
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
