import { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "jotai";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
} from "../../../packages/core/src/index";
import { EffectsPanel } from "../../../apps/web/src/components/properties/EffectsPanel";
import { StudioEffects } from "../../../apps/web/src/ui/studio/effects/StudioEffects";
import { EffectPlayback } from "../../../apps/web/src/components/properties/effects/EffectPlayback";
import { TooltipProvider } from "../../../apps/web/src/components/ui/tooltip";
import { WorkspaceTheme } from "../../../apps/web/src/ui/brand/WorkspaceTheme";
import { i18n } from "../../../apps/web/src/state/i18n";
import "../../../apps/web/src/components/properties/effects/library-messages";
import "../../../apps/web/src/styles/global.css";

/** The production Motion popover and portaled parameter menu, without a GPU scene. */
export async function mountEffectMotionLayout(
  language: string,
  workspace: "classic" | "studio",
  stack = false,
) {
  await i18n.changeLanguage(language);
  document.documentElement.classList.add("dark");
  const effect = createEffect("shatter");
  const layer = createLayer("text", {
    effects: stack ? [effect, createEffect("grain")] : [effect],
    text: "Melt",
  });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] }));
  engine.select([layer.id]);
  window.__effectStack = engine;
  const host = document.body.appendChild(document.createElement("div"));
  host.style.cssText = "padding: 24px; min-height: 100vh; background: var(--background)";
  createRoot(host).render(
    <Provider>
      <WorkspaceTheme value={workspace}>
        <TooltipProvider>
          {stack ? (
            workspace === "studio" ? (
              <StudioEffects engine={engine} run={(task) => task()} />
            ) : (
              <LiveEffects engine={engine} />
            )
          ) : (
            <EffectPlayback engine={engine} effect={effect} disabled={false} onChange={() => {}} />
          )}
        </TooltipProvider>
      </WorkspaceTheme>
    </Provider>,
  );
}

function LiveEffects({ engine }: { engine: EditorEngine }) {
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const layer = snapshot.project.pages[0]!.layers[0]!;
  return (
    <EffectsPanel
      engine={engine}
      layer={layer}
      onPatch={(patch) => engine.execute({ type: "updateLayers", ids: [layer.id], patch })}
      onPreview={() => {}}
    />
  );
}
declare global {
  interface Window {
    __effectStack?: EditorEngine;
  }
}
