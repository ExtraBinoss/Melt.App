import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";

/** Keep editable decorations above artboard chrome without raising the GPU surface. */
export function SelectionPlane({
  controller,
  viewSource,
  children,
}: {
  controller: SceneController;
  viewSource: ViewSource;
  children: ReactNode;
}) {
  const [host, setHost] = useState<Element | null>(null);
  const plane = useRef<HTMLDivElement>(null);
  const attach = useCallback((node: HTMLSpanElement | null) => {
    setHost(node?.closest(".canvas-stage") ?? null);
  }, []);
  useLayoutEffect(() => {
    const node = plane.current;
    if (!node || !host) return;
    let width = 0,
      height = 0,
      transform = "";
    const paint = () => {
      const page = controller.read().page,
        view = viewSource.read();
      if (width !== page.width || height !== page.height) {
        width = page.width;
        height = page.height;
        Object.assign(node.style, {
          width: `${width}px`,
          height: `${height}px`,
          marginLeft: `${-width / 2}px`,
          marginTop: `${-height / 2}px`,
        });
      }
      const next = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom})`;
      if (next !== transform) {
        transform = next;
        node.style.transform = next;
      }
    };
    paint();
    const stopScene = controller.subscribe(paint),
      stopView = viewSource.subscribe(paint);
    return () => {
      stopScene();
      stopView();
    };
  }, [controller, viewSource, host]);
  return (
    <>
      <span hidden ref={attach} />
      {host
        ? createPortal(
            <div ref={plane} className="canvas-selection-plane">
              {children}
            </div>,
            host,
          )
        : children}
    </>
  );
}
