import { useEffect, useState } from "react";
import type { EnginePort } from "@musart/core";
import { animationPresentation } from "../motion/animations/presentation";

/** Explicit activation reveals an existing owner editor; drag selection never opens a popup. */
export function useSceneMotionNavigation(engine: EnginePort) {
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
      if (animation?.owner.kind === "camera") {
        setCamera("camera");
        setLight(null);
      } else if (animation?.owner.kind === "light") setLight(animation.owner.lightId);
      else if (animation?.owner.kind === "environment") setLight(null);
      if (animation && animation.owner.kind !== "compositionEffect") {
        const request = store.readEditorRequest();
        if (request?.animationId === animationId) store.consumeEditorRequest(request);
      }
    };
    const stop = store.subscribeEditor(reveal);
    const pending = store.readEditorRequest();
    if (pending && pending.owner.kind !== "compositionEffect") reveal(pending.animationId);
    return stop;
  }, [engine]);
  return { camera, setCamera, light, setLight };
}
