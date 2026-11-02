import { prepareHeroGlyphs } from "./glyph-geometry";
import { installVectorHeadline } from "./vector-playback";
import { installNativeHeadlineFallback } from "./native-headline";

/** Acquire exact font curves where available, retaining native script/fallback rendering. */
export function installHeadlineInteraction(stage: HTMLElement, heading: HTMLElement) {
  let disposed = false;
  let generation = 0;
  let release: (() => void) | undefined;
  let controller: AbortController | undefined;
  let width = stage.clientWidth;
  let height = stage.clientHeight;
  async function prepare() {
    const token = ++generation;
    controller?.abort();
    release?.();
    release = undefined;
    controller = new AbortController();
    const signal = controller.signal;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      stage.removeAttribute("data-ink-pending");
      return;
    }
    try {
      const glyphs = await prepareHeroGlyphs(stage, heading, signal);
      if (disposed || signal.aborted || token !== generation) return;
      release = glyphs
        ? installVectorHeadline(stage, heading, glyphs)
        : installNativeHeadlineFallback(stage, heading);
    } catch (error) {
      if (disposed || signal.aborted || token !== generation) return;
      console.warn(
        "[Melt hero] Exact font curves are unavailable; retaining native text contours.",
        error,
      );
      release = installNativeHeadlineFallback(stage, heading);
    }
  }
  const observer = new ResizeObserver(([entry]) => {
    if (
      !entry ||
      (Math.abs(entry.contentRect.width - width) < 1 &&
        Math.abs(entry.contentRect.height - height) < 1)
    )
      return;
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    void prepare();
  });
  observer.observe(stage);
  void prepare();
  return () => {
    disposed = true;
    controller?.abort();
    observer.disconnect();
    release?.();
  };
}
