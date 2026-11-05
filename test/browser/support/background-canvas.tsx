import { createRoot } from "react-dom/client";
import { Provider } from "jotai";
import { EditorEngine, type Project } from "../../../packages/core/src/index";
import { EditorCanvas } from "../../../apps/web/src/canvas/EditorCanvas";
import { StudioBackground } from "../../../apps/web/src/ui/studio/background/StudioBackground";
import { ProjectPreferencesProvider } from "../../../apps/web/src/components/workspace/preferences/context";
import { WorkspaceModeBoundary } from "../../../apps/web/src/ui/studio/WorkspaceModeBoundary";
import { TooltipProvider } from "../../../apps/web/src/components/ui/tooltip";
import type { TaskRunner } from "../../../apps/web/src/components/projects/ProjectDialog";
import { i18n } from "../../../apps/web/src/state/i18n";
import "../../../apps/web/src/styles/global.css";

declare global {
  interface Window {
    __backgroundEngine?: EditorEngine;
    __disposeBackground?: () => void;
  }
}

/** Actual canvas, selection handles, renderer and Background controls without project-route startup. */
export async function mountBackgroundCanvas(project: Project) {
  await i18n.changeLanguage("en");
  const engine = new EditorEngine(project);
  const error = (value: unknown) => {
    console.error(value);
  };
  const task: TaskRunner = async (action) => action();
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  root.render(
    <Provider>
      <ProjectPreferencesProvider projectId={project.id} onError={error}>
        <WorkspaceModeBoundary engine={engine}>
          <TooltipProvider>
            <div
              className="canvas-area"
              style={{ display: "flex", width: "100vw", height: "100vh" }}
            >
              <EditorCanvas engine={engine} tool="pointer" onError={error} />
            </div>
            <div style={{ position: "fixed", right: 16, top: 16 }}>
              <StudioBackground engine={engine} onTask={task} />
            </div>
          </TooltipProvider>
        </WorkspaceModeBoundary>
      </ProjectPreferencesProvider>
    </Provider>,
  );
  window.__backgroundEngine = engine;
  window.__disposeBackground = () => {
    root.unmount();
    host.remove();
    delete window.__backgroundEngine;
  };
}
