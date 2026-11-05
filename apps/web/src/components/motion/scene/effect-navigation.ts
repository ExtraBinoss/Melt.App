import { useEffect, useRef } from "react";
import { getEffectDefinition, type EnginePort } from "@musart/core";
import { animationPresentation, type AnimationEditorRequest } from "../animations/presentation";

type EffectEditorRequest = AnimationEditorRequest & {
  effectId: string;
  category: "effect" | "adjustment";
};

/** Outer surfaces reveal the owner; only its mounted Motion editor acknowledges the token. */
export function useCompositionEffectMotionRequest(
  engine: EnginePort,
  reveal: (request: EffectEditorRequest) => void,
) {
  const latest = useRef(reveal);
  latest.current = reveal;
  useEffect(() => {
    const store = animationPresentation(engine);
    const receive = () => {
      const request = store.readEditorRequest();
      if (request?.owner.kind !== "compositionEffect") return;
      const page = request.project.pages.find((item) => item.id === request.pageId);
      const effectId = request.owner.effectId;
      const effect = page?.effects?.find((item) => item.id === effectId);
      if (effect)
        latest.current({
          ...request,
          effectId,
          category: getEffectDefinition(effect.type).category,
        });
    };
    const stop = store.subscribeEditor(receive);
    receive();
    return stop;
  }, [engine]);
}
