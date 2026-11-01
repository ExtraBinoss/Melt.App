import { useCallback, useSyncExternalStore } from "react";
import type { EnginePort } from "@musart/core";
import { usesVideoSources } from "@musart/render";
import type { SceneController } from "../session/scene-controller";

/** Only a video-presence change remounts the renderer; playback and previews retain the same boolean. */
export function useVideoBackend(controller: SceneController, engine?: EnginePort): boolean {
  const read = useCallback(() => {
    const snapshot = engine?.getSnapshot();
    const page = snapshot?.project.pages.find((page) => page.id === snapshot.pageId);
    return usesVideoSources(page ?? controller.read().page);
  }, [controller, engine]);
  return useSyncExternalStore(controller.subscribe, read, read);
}
