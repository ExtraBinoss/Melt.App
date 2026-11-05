import { useRef, type ReactNode, type RefObject } from "react";
import { useIsPresent } from "motion/react";
import { ContextualSurface } from "../../components/shared/motion/ContextualSurface";
import { useObjectToolbarPosition } from "./use-object-toolbar-position";
import "./object-toolbar.css";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
export function ObjectToolbar({
  controller,
  view,
  viewport,
  layerId,
  layoutKey = layerId,
  children,
  allowDraft = false,
  className = "vector-canvas-toolbar vector-canvas-entry",
}: {
  controller: SceneController;
  view: ViewSource;
  viewport: RefObject<HTMLDivElement | null>;
  layerId: string;
  layoutKey?: string;
  children: ReactNode;
  allowDraft?: boolean;
  className?: string;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const present = useIsPresent();
  useObjectToolbarPosition(anchor, controller, view, viewport, layerId, allowDraft);
  return (
    <div
      ref={anchor}
      className="canvas-object-toolbar-anchor"
      data-canvas-control
      inert={!present}
      aria-hidden={!present}
    >
      <ContextualSurface
        as="aside"
        layout="size"
        layoutKey={layoutKey}
        className={`${className} floating-panel`}
      >
        {children}
      </ContextualSurface>
    </div>
  );
}
