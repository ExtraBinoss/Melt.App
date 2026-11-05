import { useEffect, useState } from "react";
import type { EnginePort } from "@musart/core";
import { animationPresentation } from "../motion/animations/presentation";
import { useWorkspaceMode } from "../../ui/studio/workspace-mode";

/** Explicit activation reveals an existing owner editor; drag selection never opens a popup. */
export function useSceneMotionNavigation(engine: EnginePort) {
  const mode = useWorkspaceMode();
  const [camera, setCamera] = useState("");
  const [light, setLight] = useState<string | null>(null);
  useEffect(() => {
    const store = animationPresentation(engine);
    const reveal = (animationId: string) => {
      const snapshot = engine.getSnapshot();
      const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId);
      const animation = page?.motion?.sceneAnimations?.find(
        (animation) => animation.id === animationId,
      );
      if (animation?.owner.kind === "camera" && mode === "classic") {
        setCamera("camera");
        setLight(null);
      } else if (animation?.owner.kind === "light") setLight(animation.owner.lightId);
      if (
        animation?.owner.kind === "light" ||
        (animation?.owner.kind === "camera" && mode === "classic")
      ) {
        const request = store.readEditorRequest();
        if (request?.animationId === animationId) store.consumeEditorRequest(request);
      }
    };
    const stop = store.subscribeEditor(reveal);
    const pending = store.readEditorRequest();
    if (pending && pending.owner.kind !== "compositionEffect") reveal(pending.animationId);
    return stop;
  }, [engine, mode]);
  return { camera, setCamera, light, setLight };
}
