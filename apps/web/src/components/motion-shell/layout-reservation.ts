import type { EnginePort } from "@musart/core";
import {
  createViewportResizeAnchor,
  type ViewportResizeLease,
} from "../../canvas/session/viewport-resize";
const moving = new WeakMap<Element, Animation>();

/** Reserve once, then translate panel contents from their old screen positions without scaling. */
export function captureDockLayout(
  engine: EnginePort,
  root: HTMLElement | null,
): ViewportResizeLease | undefined {
  const nodes = root
    ? [
        ...root.querySelectorAll<HTMLElement>(
          ".sidebar-panels > [data-slot=resizable-panel], .layers-resize, .toolbar",
        ),
      ]
    : [];
  const before = nodes.map((node) => ({ node, top: node.getBoundingClientRect().top }));
  const anchor = createViewportResizeAnchor(engine).capture();
  if (!anchor) return;
  for (const { node } of before) moving.get(node)?.cancel();
  const animations: Animation[] = [];
  let resolve!: () => void;
  const finished = new Promise<void>((done) => {
    resolve = done;
  });
  const events = new AbortController();
  let applied = false,
    retired = false;
  const cancel = () => {
    if (retired) return;
    retired = true;
    anchor.cancel();
    events.abort();
    for (const animation of animations) animation.cancel();
    resolve();
  };
  return {
    finished,
    cancel,
    apply() {
      if (retired || applied) return;
      applied = true;
      anchor.apply();
      const after = before.map(({ node, top }) => ({
        node,
        delta: top - node.getBoundingClientRect().top,
      }));
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        for (const { node, delta } of after) {
          if (!node.isConnected || Math.abs(delta) < 0.5 || typeof node.animate !== "function")
            continue;
          const animation = node.animate([{ translate: `0 ${delta}px` }, { translate: "0 0" }], {
            duration: 240,
            easing: "cubic-bezier(.2,.8,.2,1)",
          });
          moving.set(node, animation);
          animations.push(animation);
          void animation.finished
            .catch(() => {})
            .then(() => {
              if (moving.get(node) === animation) moving.delete(node);
            });
        }
      }
      root?.addEventListener("pointerdown", cancel, { capture: true, signal: events.signal });
      root?.addEventListener("wheel", cancel, {
        capture: true,
        passive: true,
        signal: events.signal,
      });
      void Promise.all([
        anchor.finished,
        ...animations.map((animation) => animation.finished.catch(() => {})),
      ]).then(() => {
        events.abort();
        retired = true;
        resolve();
      });
    },
  };
}
