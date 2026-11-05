import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { Provider, createStore } from "jotai";
import {
  EditorEngine,
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
} from "../../../packages/core/src/index";
import { MaterialControl } from "../../../apps/web/src/components/spatial/MaterialControl";
import { EnvironmentControl } from "../../../apps/web/src/components/spatial/EnvironmentControl";
import { TooltipProvider } from "../../../apps/web/src/components/ui/tooltip";
import { WorkspaceTheme } from "../../../apps/web/src/ui/brand/WorkspaceTheme";
import { previewAtom } from "../../../apps/web/src/state/session/editor";
import { i18n } from "../../../apps/web/src/state/i18n";
import "../../../apps/web/src/styles/global.css";
import "../../../apps/web/src/ui/studio/studio-chrome.css";

export async function mount(presentation: "classic" | "studio") {
  await i18n.changeLanguage("en");
  const layer = createLayer("rectangle", { spatial: createSpatialLayer("sphere") });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ spatial: createSpatialScene(), layers: [layer] })] }),
  );
  engine.select([layer.id]);
  const store = createStore();
  const run = (action: () => void) => action();
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  root.render(
    <Provider store={store}>
      <WorkspaceTheme value={presentation}>
        <TooltipProvider>
          <div
            data-workspace-theme={presentation}
            style={
              {
                position: "fixed",
                right: 20,
                bottom: 30,
                display: "flex",
                gap: 12,
                width: 220,
                "--studio-left": "0px",
                "--studio-right": "0px",
                "--studio-bottom": "0px",
              } as CSSProperties
            }
          >
            <MaterialControl engine={engine} run={run} presentation={presentation} />
            <EnvironmentControl engine={engine} run={run} presentation={presentation} />
          </div>
        </TooltipProvider>
      </WorkspaceTheme>
    </Provider>,
  );
  Object.assign(window, {
    __scenePickers: {
      preview: () => JSON.stringify(store.get(previewAtom)),
      project: () => JSON.stringify(engine.getSnapshot().project),
      canUndo: () => engine.getSnapshot().canUndo,
      undo: () => engine.undo(),
      dispose: () => root.unmount(),
    },
  });
}
