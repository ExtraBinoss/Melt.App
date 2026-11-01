import { createRoot } from "react-dom/client";
import { animate } from "motion/mini";
import { OpeningSurface } from "./OpeningSurface";
import { openingOrigin } from "./origin";
import type { OpeningPoint } from "./origin";
import { createRadialBackground } from "./radial";

let cancelActive: (() => void) | undefined;
/** Landing navigation and library opening share the same pointer-centered compositor reveal. */
export async function revealNavigation(
  navigate: () => Promise<unknown>,
  target: string,
  point?: OpeningPoint,
) {
  cancelActive?.();
  const { x, y } = point ?? openingOrigin();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const host = document.createElement("div");
  host.className = "project-opening-surface";
  host.dataset.originX = String(x);
  host.dataset.originY = String(y);
  host.dataset.openingPhase = "navigation";
  const content = document.createElement("div");
  content.className = "project-opening-body";
  host.append(content);
  document.body.append(host);
  const root = createRoot(content);
  root.render(<OpeningSurface />);
  const radial = createRadialBackground(host, x, y, reduced);
  const contentEntry = reduced
    ? undefined
    : animate(content, { opacity: [0, 1] }, { duration: 0.18 });
  let closed = false,
    finishReady: ((error?: Error) => void) | undefined;
  let rejectInterrupted!: (error: Error) => void;
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectInterrupted = reject;
  });
  let exit: ReturnType<typeof animate> | undefined;
  const timeout = setTimeout(
    () => rejectInterrupted(Error(`Navigation target did not appear: ${target}`)),
    15000,
  );
  const observer = new MutationObserver(() => {
    if (document.querySelector(target)) finishReady?.();
    else if (document.querySelector(".runtime-error")) finishReady?.(Error("Navigation failed."));
  });
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timeout);
    observer.disconnect();
    window.removeEventListener("pagehide", close);
    window.removeEventListener("popstate", close);
    radial.dispose();
    contentEntry?.stop();
    exit?.stop();
    root.unmount();
    host.remove();
    if (cancelActive === close) cancelActive = undefined;
    rejectInterrupted(Error("Navigation was interrupted."));
    finishReady?.(Error("Navigation was interrupted."));
  }
  cancelActive = close;
  window.addEventListener("pagehide", close);
  window.addEventListener("popstate", close);
  try {
    await Promise.race([radial.covered, interrupted]);
    if (closed) return;
    await Promise.race([navigate(), interrupted]);
    if (closed) return;
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        finishReady = (error) => (error ? reject(error) : resolve());
        if (document.querySelector(target)) return resolve();
        observer.observe(document.body, { childList: true, subtree: true });
      }),
      interrupted,
    ]);
    if (!reduced && !closed) {
      exit = animate(host, { opacity: 0 }, { duration: 0.16 });
      await Promise.race([exit.finished, interrupted]);
    }
  } finally {
    close();
  }
}
import.meta.hot?.dispose(() => cancelActive?.());
