import type { Page } from "@playwright/test";

declare global {
  interface Window {
    __studioPresentation?: { dispatchToFrameMs: number; backend: string };
  }
}

/** Native pointer dispatch to the next acknowledged preview frame, not a physical-display metric. */
export async function armStudioPresentation(page: Page) {
  await page.evaluate(() => {
    delete window.__studioPresentation;
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!;
    const slider = document
      .querySelector<HTMLElement>('.studio-material [role="slider"][aria-label="Roughness"]')!
      .closest<HTMLElement>(".studio-slider")!;
    let start = 0;
    let revision = canvas.dataset.renderedRevision;
    const observer = new MutationObserver(() => {
      if (
        !start ||
        canvas.dataset.renderedRevision === revision ||
        canvas.dataset.presentationReady !== "true"
      )
        return;
      window.__studioPresentation = {
        dispatchToFrameMs: performance.now() - start,
        backend: canvas.dataset.backend ?? "unknown",
      };
      cleanup();
    });
    const pointer = () => {
      revision = canvas.dataset.renderedRevision;
      start = performance.now();
      observer.observe(canvas, {
        attributes: true,
        attributeFilter: ["data-rendered-revision", "data-presentation-ready"],
      });
    };
    const timeout = setTimeout(cleanup, 10000);
    function cleanup() {
      clearTimeout(timeout);
      observer.disconnect();
      slider.removeEventListener("pointerdown", pointer, true);
    }
    slider.addEventListener("pointerdown", pointer, { capture: true, once: true });
  });
}
