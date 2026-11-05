import { createRoot } from "react-dom/client";
import { Provider } from "jotai";
import { EditorEngine, type Project } from "../../../packages/core/src/index";
import { EditorCanvas } from "../../../apps/web/src/canvas/EditorCanvas";
import { ObjectLibrary } from "../../../apps/web/src/components/spatial/objects/ObjectLibrary";
import { ShapeToolSlot } from "../../../apps/web/src/components/assets/ShapeToolSlot";
import { Button } from "../../../apps/web/src/components/ui/button";
import { TooltipProvider } from "../../../apps/web/src/components/ui/tooltip";
import { ProjectPreferencesProvider } from "../../../apps/web/src/components/workspace/preferences/context";
import { WorkspaceModeBoundary } from "../../../apps/web/src/ui/studio/WorkspaceModeBoundary";
import { i18n } from "../../../apps/web/src/state/i18n";
import "../../../apps/web/src/styles/global.css";

/** Actual retained canvas and shared insertion controls, without unrelated route bootstrap. */
export async function mountLibraryCanvas(project: Project) {
  await i18n.changeLanguage("en");
  const engine = new EditorEngine(project);
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  const onError = (value: unknown) => {
    throw value;
  };
  root.render(
    <Provider>
      <ProjectPreferencesProvider projectId={project.id} onError={onError}>
        <WorkspaceModeBoundary engine={engine}>
          <TooltipProvider>
            <div
              className="canvas-area"
              style={{ display: "flex", width: "100vw", height: "100vh" }}
            >
              <EditorCanvas engine={engine} tool="pointer" onError={onError} />
            </div>
            <nav
              aria-label="Insertion"
              style={{ position: "fixed", left: 16, top: 16, display: "flex", zIndex: 100 }}
            >
              <ShapeToolSlot engine={engine} />
              <ObjectLibrary
                engine={engine}
                onTask={async (action) => {
                  await action();
                  return true;
                }}
              />
            </nav>
            <div
              id="button-witness"
              style={{ position: "fixed", left: 16, bottom: 16, display: "flex", gap: 8 }}
            >
              <Button>Primary</Button>
              <Button disabled>Disabled</Button>
              <Button variant="secondary">Secondary</Button>
            </div>
          </TooltipProvider>
        </WorkspaceModeBoundary>
      </ProjectPreferencesProvider>
    </Provider>,
  );
  window.__backgroundEngine = engine;
  window.__disposeBackground = () => {
    root.unmount();
    delete window.__backgroundEngine;
  };
}
