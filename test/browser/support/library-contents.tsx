import { createRoot } from "react-dom/client";
import { Provider } from "jotai";
import { createRuntime } from "../../../apps/web/src/services/session/runtime";
import { ProjectDialog } from "../../../apps/web/src/components/projects/ProjectDialog";
import { TooltipProvider } from "../../../apps/web/src/components/ui/tooltip";
import { changeLanguage } from "../../../apps/web/src/state/i18n";
import {
  createProject,
  createPage,
  createLayer,
  createEffect,
} from "../../../packages/core/src/index";
import "../../../apps/web/src/styles/global.css";

declare global {
  interface Window {
    libraryContentsWitness?: { seed: () => Promise<void>; dispose: () => Promise<void> };
  }
}

/** Real library, persistence, creation flow and previews, independent of route bootstrap. */
export async function mountLibraryContentsWitness() {
  await changeLanguage("en");
  const runtime = await createRuntime((error) => console.error("[Library witness]", error), {
    library: true,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (key: number) =>
    root.render(
      <Provider>
        <TooltipProvider>
          <ProjectDialog
            key={key}
            services={runtime.services}
            welcome
            showLanding={false}
            onClose={() => {}}
            onTask={async (task) => {
              await task();
              return true;
            }}
          />
        </TooltipProvider>
      </Provider>,
    );
  render(0);
  window.libraryContentsWitness = {
    async seed() {
      await runtime.store.create(
        createProject({
          name: "Detected project",
          pages: [
            createPage({
              width: 96,
              height: 64,
              layers: [createLayer("rectangle", { effects: [createEffect("blur")] })],
            }),
          ],
        }),
      );
      render(1);
    },
    async dispose() {
      root.unmount();
      host.remove();
      await runtime.dispose();
      delete window.libraryContentsWitness;
    },
  };
}
