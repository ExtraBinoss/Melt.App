import { useEffect, useState } from "react";
import type { EnginePort } from "@musart/core";
import {
  animationPresentation,
  type AnimationEditorRequest,
} from "../../../components/motion/animations/presentation";

/** Light actions reveal their existing scene inspector even before Advanced has mounted. */
export function useSceneAnimationNavigation(engine: EnginePort) {
  const [request, setRequest] = useState<AnimationEditorRequest | null>(null);
  useEffect(() => {
    const presentation = animationPresentation(engine);
    const reveal = () => {
      const pending = presentation.readEditorRequest();
      if (pending?.owner.kind === "light") setRequest(pending);
    };
    const stop = presentation.subscribeEditor(reveal);
    reveal();
    return stop;
  }, [engine]);
  return request;
}
