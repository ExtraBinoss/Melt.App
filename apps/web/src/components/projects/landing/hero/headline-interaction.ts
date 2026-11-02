import { prepareHeroGlyphs } from "./glyph-geometry";
import { finishHeroWriting, waitForHeroMascot } from "./choreography";
import { installVectorHeadline } from "./vector-playback";
import { installNativeHeadlineFallback } from "./native-headline";

/** Acquire exact font curves where available, retaining native script/fallback rendering. */
export function installHeadlineInteraction(
  stage: HTMLElement,
  heading: HTMLElement,
  options: { deferUntilVisible?: boolean } = {},
) {
  let disposed = false;
  let generation = 0;
  let release: (() => void) | undefined;
  let controller: AbortController | undefined;
  let activated = !options.deferUntilVisible;
  let width = activated ? stage.clientWidth : 0;
  let height = activated ? stage.clientHeight : 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let pointer: { x: number; y: number } | undefined;
  const rememberPointer = (event: PointerEvent) => {
    if (event.pointerType !== "touch") {
      pointer = { x: event.clientX, y: event.clientY };
      activate();
    }
  };
  const forgetPointer = () => {
    pointer = undefined;
  };
  const scrollOwner = stage.closest(".landing-page");
  stage.addEventListener("pointerenter", rememberPointer);
  stage.addEventListener("pointermove", rememberPointer);
  stage.addEventListener("pointerleave", forgetPointer);
  stage.addEventListener("pointercancel", forgetPointer);
  scrollOwner?.addEventListener("scroll", forgetPointer, { passive: true });
  async function prepare() {
    const token = ++generation;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    if (reduced.matches) {
      release?.();
      release = undefined;
      finishHeroWriting(stage);
      return;
    }
    try {
      const glyphs = await prepareHeroGlyphs(stage, heading, signal);
      if (stage.hasAttribute("data-ink-pending")) await waitForHeroMascot(stage, signal);
      if (disposed || signal.aborted || token !== generation) return;
      release?.();
      release = glyphs
        ? installVectorHeadline(stage, heading, glyphs, pointer)
        : installNativeHeadlineFallback(stage, heading, pointer);
    } catch (error) {
      if (disposed || signal.aborted || token !== generation) return;
      console.warn(
        "[Melt hero] Exact font curves are unavailable; retaining native text contours.",
        error,
      );
      release?.();
      release = installNativeHeadlineFallback(stage, heading, pointer);
    }
  }
  const observer = new ResizeObserver(([entry]) => {
    if (
      !activated ||
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
  const motionChanged = () => {
    if (activated) void prepare();
  };
  reduced.addEventListener("change", motionChanged);
  const visibility =
    options.deferUntilVisible && typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(
          ([entry]) => {
            if (entry?.isIntersecting) activate();
          },
          { rootMargin: "240px" },
        )
      : undefined;
  function activate() {
    if (activated || disposed) return;
    activated = true;
    width = stage.clientWidth;
    height = stage.clientHeight;
    visibility?.disconnect();
    void prepare();
  }
  if (activated) void prepare();
  else if (visibility) visibility.observe(stage);
  else activate();
  return () => {
    disposed = true;
    controller?.abort();
    observer.disconnect();
    visibility?.disconnect();
    reduced.removeEventListener("change", motionChanged);
    stage.removeEventListener("pointerenter", rememberPointer);
    stage.removeEventListener("pointermove", rememberPointer);
    stage.removeEventListener("pointerleave", forgetPointer);
    stage.removeEventListener("pointercancel", forgetPointer);
    scrollOwner?.removeEventListener("scroll", forgetPointer);
    release?.();
  };
}
