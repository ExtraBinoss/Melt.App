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
      else if (animation) setLight(null);
    };
    const stop = store.subscribeEditor(reveal);
    const pending = store.takeEditorRequest();
    if (pending) reveal(pending);
    return stop;
  }, [engine]);
  return { camera, setCamera, light, setLight };
}
