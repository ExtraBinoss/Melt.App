import type { GlyphGeometry } from "./glyph-geometry";
import { createGlyphSurface } from "./glyph-surface";
import {
  finishHeroWriting,
  heroTiming,
  readHeroProgress,
  saveHeroProgress,
  signalHeroReady,
} from "./choreography";

/** Reference choreography: point cloud → traced glyph → solid ink, with local hover replays. */
export function installVectorHeadline(
  stage: HTMLElement,
  heading: HTMLElement,
  glyphs: GlyphGeometry[],
  initialPointer?: { x: number; y: number },
) {
  const surface = createGlyphSurface(stage, heading, glyphs);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let intro = stage.hasAttribute("data-ink-pending");
  let time = stage.hasAttribute("data-ink-pending") ? readHeroProgress(stage) : 0;
  signalHeroReady(stage);
  let last: number | undefined;
  let frame: number | undefined;
  let visible = true;
  let disposed = false;
  let pointer = initialPointer;
  let pointerDirty = Boolean(initialPointer);
  const pulses = new Map<number, number>();
  const hoverDuration = 1100;
  function stop() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    last = undefined;
  }
  function clear() {
    intro = false;
    pulses.clear();
    surface.clear();
    finishHeroWriting(stage);
    stage.removeAttribute("data-ink-active");
    stage.removeAttribute("data-ink-auto");
    stop();
  }
  function tick(stamp: number) {
    frame = undefined;
    if (disposed || !visible || document.hidden || reduced.matches) return;
    // Read current geometry once for the coalesced input before touching SVG or styles.
    const bounds = pointerDirty && pointer && !intro ? stage.getBoundingClientRect() : undefined;
    time += last === undefined ? 0 : Math.max(0, stamp - last);
    last = stamp;
    if (bounds && pointer) {
      pointerDirty = false;
      const x = pointer.x - bounds.left;
      const y = pointer.y - bounds.top;
      let nearest = -1;
      let distance = Infinity;
      glyphs.forEach((glyph, index) => {
        const value = Math.hypot(glyph.x + glyph.width / 2 - x, glyph.y + glyph.height / 2 - y);
        if (value < distance && value < glyph.height * 0.75) {
          nearest = index;
          distance = value;
        }
      });
      // The pulse map is the active state: a finished glyph can always be played again.
      const start = pulses.get(nearest);
      if (nearest >= 0 && (start === undefined || time - start >= hoverDuration)) {
        pulses.set(nearest, time);
        stage.toggleAttribute("data-ink-active", true);
      }
    }
    if (intro) {
      saveHeroProgress(stage, time);
      if (time >= heroTiming.textAt) {
        stage.toggleAttribute("data-ink-auto", true);
        stage.toggleAttribute("data-ink-active", true);
      }
      glyphs.forEach((_, index) =>
        surface.paint(
          index,
          (time - heroTiming.textAt - (index / glyphs.length) * heroTiming.textSpread) /
            heroTiming.glyph,
          true,
        ),
      );
      if (time >= heroTiming.textFinish) {
        clear();
        pointerDirty = Boolean(pointer);
      }
    } else {
      for (const [index, start] of pulses) {
        const progress = (time - start) / hoverDuration;
        surface.paint(index, progress, false);
        if (progress >= 1) pulses.delete(index);
      }
      if (!pulses.size) {
        surface.unmask();
        stage.removeAttribute("data-ink-active");
        last = undefined;
      }
    }
    if (intro || pulses.size || pointerDirty) frame = requestAnimationFrame(tick);
  }
  function resume() {
    const paused = !visible || document.hidden || reduced.matches;
    stage.toggleAttribute("data-paused", paused);
    if (reduced.matches) {
      pointer = undefined;
      pointerDirty = false;
      clear();
    }
    if (paused) stop();
    else if (!disposed && (intro || pulses.size || pointerDirty) && frame === undefined)
      frame = requestAnimationFrame(tick);
  }
  function move(event: PointerEvent) {
    if (event.pointerType === "touch" || reduced.matches) return;
    pointer = { x: event.clientX, y: event.clientY };
    pointerDirty = true;
    resume();
  }
  function leave() {
    pointer = undefined;
    pointerDirty = false;
  }
  function scroll() {
    leave();
    if (!intro) clear();
  }
  const observer = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    resume();
  });
  observer.observe(stage);
  stage.addEventListener("pointerenter", move);
  stage.addEventListener("pointermove", move);
  stage.addEventListener("pointerleave", leave);
  stage.addEventListener("pointercancel", leave);
  document.addEventListener("visibilitychange", resume);
  reduced.addEventListener("change", resume);
  stage.closest(".landing-page")?.addEventListener("scroll", scroll, { passive: true });
  resume();
  return () => {
    disposed = true;
    stop();
    observer.disconnect();
    stage.removeEventListener("pointerenter", move);
    stage.removeEventListener("pointermove", move);
    stage.removeEventListener("pointerleave", leave);
    stage.removeEventListener("pointercancel", leave);
    document.removeEventListener("visibilitychange", resume);
    reduced.removeEventListener("change", resume);
    stage.closest(".landing-page")?.removeEventListener("scroll", scroll);
    stage.removeAttribute("data-paused");
    stage.removeAttribute("data-ink-active");
    stage.removeAttribute("data-ink-auto");
    surface.dispose();
  };
}
