import { createRoot } from "react-dom/client";
import { animate } from "motion/mini";
import { OpeningSurface } from "./OpeningSurface";
import { openingOrigin } from "./origin";
import { createRadialBackground } from "./radial";

export interface ProjectOpening {
  painted(): Promise<void>;
  installed(): void;
  close(): void;
}
let active: ProjectOpening | undefined;
export const currentProjectOpening = () => active;

/** A small independent surface spans library unmount and the first real canvas presentation. */
export function beginProjectOpening(cancel?: () => void, projectName?: string): ProjectOpening {
  active?.close();
  // Read the source geometry before adding any presentation DOM.
  const { x, y } = openingOrigin();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const before = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
  const beforeFrame = before?.dataset.canonicalPresentedAt;
  const host = document.createElement("div");
  host.className = "project-opening-surface";
  host.dataset.openingPhase = "installing";
  host.dataset.originX = String(x);
  host.dataset.originY = String(y);
  document.body.append(host);
  const content = document.createElement("div");
  content.className = "project-opening-body";
  host.append(content);
  const radial = createRadialBackground(host, x, y, reduced);
  const root = createRoot(content);
  let closed = false,
    installed = false,
    removed = false;
  let firstFrame = 0,
    secondFrame = 0;
  let paintTask: ReturnType<typeof setTimeout> | undefined;
  let finishPaint = () => {};
  // Yield one presentation opportunity before document validation/installation.
  const paint = new Promise<void>((resolve) => {
    finishPaint = resolve;
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        paintTask = setTimeout(resolve, 0);
      });
    });
  });
  let exit: ReturnType<typeof animate> | undefined;
  const observer = new MutationObserver(check);
  const timeout = setTimeout(() => {
    console.warn(
      "[Melt project opening stalled] Still waiting for installation or visible canvas",
      { phase: host.dataset.openingPhase },
    );
  }, 12000);
  function remove() {
    if (removed) return;
    removed = true;
    cancelAnimationFrame(firstFrame);
    cancelAnimationFrame(secondFrame);
    clearTimeout(paintTask);
    finishPaint();
    radial.dispose();
    exit?.stop();
    root.unmount();
    host.remove();
    if (active === owner) active = undefined;
  }
  function finish(fade: boolean) {
    if (closed) return;
    closed = true;
    observer.disconnect();
    clearTimeout(timeout);
    window.removeEventListener("pagehide", hide);
    window.removeEventListener("popstate", hide);
    window.removeEventListener("keydown", key, true);
    if (fade && !reduced) {
      exit = animate(host, { opacity: 0 }, { duration: 0.16 });
      void exit.finished.then(remove, remove);
    } else remove();
  }
  function hide() {
    finish(false);
  }
  function key(event: KeyboardEvent) {
    if (event.key === "Escape" && cancel) {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
      owner.close();
    }
  }
  function check() {
    if (!installed || closed) return;
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    if (canvas?.dataset.renderError) {
      finish(true);
      return;
    }
    if (canvas?.dataset.presentationReady !== "true") return;
    if (canvas !== before || canvas.dataset.canonicalPresentedAt !== beforeFrame) finish(true);
  }
  const owner: ProjectOpening = {
    painted: () => paint,
    installed() {
      if (closed) return;
      installed = true;
      host.dataset.openingPhase = "canvas";
      check();
    },
    close: () => {
      if (closed) remove();
      else finish(false);
    },
  };
  active = owner;
  root.render(
    <OpeningSurface
      projectName={projectName}
      cancel={
        cancel
          ? () => {
              cancel();
              owner.close();
            }
          : undefined
      }
    />,
  );
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      "data-presentation-ready",
      "data-project-id",
      "data-rendered-revision",
      "data-canonical-presented-at",
      "data-render-error",
    ],
  });
  window.addEventListener("pagehide", hide);
  window.addEventListener("popstate", hide);
  window.addEventListener("keydown", key, true);
  return owner;
}
import.meta.hot?.dispose(() => active?.close());
