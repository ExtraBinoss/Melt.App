import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Diamond, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  compareMotionTime,
  resolveSceneMotionProperty,
  sceneMotionAddress,
  type EnginePort,
  type SceneMotionPropertyTarget,
} from "@musart/core";
import { animationPresentation } from "../motion/animations/presentation";
import { createMotionTransport } from "../../services/motion/transport";
import { addSceneMotionKey, removeSceneMotionKey } from "./scene-motion-edit";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import "../properties/motion/messages";
import "../properties/motion/motion-properties.css";

/** Scene diamonds observe transport imperatively, just like layer property controls. */
export function SceneMotionField({
  engine,
  target,
  label,
  children,
}: {
  engine?: EnginePort;
  target?: SceneMotionPropertyTarget;
  label: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("motionProperties");
  const { t: spatial } = useTranslation("spatial");
  const slot = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const remove = useRef<HTMLButtonElement>(null);
  const [help, setHelp] = useState("");
  const tooltip = useRef("");
  useLayoutEffect(() => {
    if (!engine || !target) return;
    const transport = createMotionTransport(engine);
    const update = () => {
      const state = transport.read(),
        snapshot = engine.getSnapshot();
      const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
      const descriptor = resolveSceneMotionProperty(page, target);
      const property = page.motion?.sceneProperties?.find(
        (property) => sceneMotionAddress(property.target) === sceneMotionAddress(target),
      );
      const current =
        property?.keyframes.some((key) => compareMotionTime(key.time, state.time) === 0) ?? false;
      const hidden = state.mode !== "motion" || !animationPresentation(engine).read().details;
      if (slot.current) slot.current.hidden = hidden;
      if (button.current) {
        button.current.disabled = !descriptor;
        button.current.dataset.animated = String(Boolean(property?.keyframes.length));
        button.current.dataset.current = String(current);
        button.current.setAttribute("aria-pressed", String(current));
        button.current.setAttribute(
          "aria-label",
          t(current ? "update" : "add", { property: label }),
        );
      }
      if (remove.current) remove.current.hidden = !current;
      tooltip.current = t(current ? "update" : "add", { property: label });
    };
    const stop = transport.subscribe(update),
      stopPresentation = animationPresentation(engine).subscribe(update);
    update();
    return () => {
      stop();
      stopPresentation();
    };
  }, [engine, target, label, t]);
  if (!engine || !target) return children;
  return (
    <div className="motion-property-field">
      <div className="motion-property-input">{children}</div>
      <span ref={slot} className="motion-property-diamond-slot" hidden>
        <Tooltip
          onOpenChange={(open) => {
            if (open) setHelp(tooltip.current);
          }}
        >
          <TooltipTrigger asChild>
            <Button
              ref={button}
              variant="ghost"
              size="icon-xs"
              className="motion-property-diamond"
              data-motion-diamond
              aria-label={t("add", { property: label })}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => addSceneMotionKey(engine, target)}
            >
              <Diamond size={11} aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{help}</TooltipContent>
        </Tooltip>
        <Button
          ref={remove}
          variant="ghost"
          size="icon-xs"
          hidden
          aria-label={spatial("removeKeyframe", { property: label })}
          onClick={() => removeSceneMotionKey(engine, target)}
        >
          <Minus size={10} aria-hidden />
        </Button>
      </span>
    </div>
  );
}
