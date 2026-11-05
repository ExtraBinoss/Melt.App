import { createRoot } from "react-dom/client";
import type { Project } from "../../../packages/core/src/index";
import { SCENE_MOTION_ANIMATION_PRESETS } from "../../../packages/core/src/index";
import { createMotionTransport } from "../../../apps/web/src/services/motion/transport";
import { PresetGrid } from "../../../apps/web/src/components/motion/animations/PresetGrid";
import "../../../apps/web/src/components/motion/animations/messages";
import "../../../apps/web/src/components/motion/animations/animations.css";
import { mountBackgroundCanvas } from "./background-canvas";

declare global {
  interface Window {
    __sceneMotion?: {
      play(): void;
      seek(seconds: number): void;
      read(): { playing: boolean; yaw: number | undefined; revision: number };
      catalogue(): void;
      dispose(): void;
    };
  }
}

/** Borrow the real background fixture's canvas and expose only the existing shared transport. */
export async function mountSceneMotionCanvas(project: Project) {
  await mountBackgroundCanvas(project);
  const engine = window.__backgroundEngine!;
  const transport = createMotionTransport(engine);
  const host = document.body.appendChild(document.createElement("div"));
  host.style.cssText =
    "position:fixed;right:16px;top:16px;width:390px;height:250px;display:flex;flex-direction:column;z-index:30;background:#20232b";
  const root = createRoot(host);
  window.__sceneMotion = {
    play: transport.play,
    seek: (seconds) => transport.seek({ value: Math.round(seconds * 1000000), rate: 1000000 }),
    read: () => ({
      playing: transport.read().playing,
      yaw: transport.readFrame()?.spatial?.camera.yaw,
      revision: engine.getSnapshot().revision,
    }),
    catalogue() {
      transport.pause();
      root.render(
        <PresetGrid
          engine={engine}
          entries={SCENE_MOTION_ANIMATION_PRESETS.filter(
            (preset) => preset.channels[0]?.target.kind === "camera",
          )}
          apply={() => {}}
          busy={false}
          empty="Empty"
          onError={() => console.error("Scene catalogue preview failed")}
        />,
      );
    },
    dispose() {
      root.unmount();
      host.remove();
      transport.dispose();
      window.__disposeBackground?.();
      delete window.__sceneMotion;
    },
  };
}
