import type { GlyphGeometry } from "./glyph-geometry";
import { createGlyphSurface } from "./glyph-surface";

/** Reference choreography: point cloud → traced glyph → solid ink, with local hover replays. */
export function installVectorHeadline(
  stage: HTMLElement,
  heading: HTMLElement,
  glyphs: GlyphGeometry[],
) {
  const surface = createGlyphSurface(stage, heading, glyphs);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let intro = stage.hasAttribute("data-ink-pending");
  let time = 0;
  let last: number | undefined;
  let paintedAt = -Infinity;
  let frame: number | undefined;
  let visible = true;
  let disposed = false;
  let hovered = -1;
  let bounds: DOMRect | undefined;
  const pulses = new Map<number, number>();
  function stop() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    last = undefined;
  }
  function clear() {
    intro = false;
    pulses.clear();
    surface.clear();
    stage.removeAttribute("data-ink-pending");
    stage.removeAttribute("data-ink-active");
    stage.removeAttribute("data-ink-auto");
    stop();
  }
  function tick(stamp: number) {
    frame = undefined;
    if (disposed || !visible || document.hidden || reduced.matches) return;
    time += last === undefined ? 0 : Math.min(60, stamp - last);
    last = stamp;
    if (stamp - paintedAt >= 1000 / 30) {
      paintedAt = stamp;
      if (intro) {
        if (time >= 300) {
          stage.setAttribute("data-ink-auto", "");
          stage.setAttribute("data-ink-active", "");
        }
        glyphs.forEach((_, index) =>
          surface.paint(index, (time - 300 - (index / glyphs.length) * 750) / 450, true),
        );
        if (time >= 1500) clear();
      } else {
        for (const [index, start] of pulses) {
          const progress = (time - start) / 1100;
          surface.paint(index, progress, false);
          if (progress >= 1) pulses.delete(index);
        }
        if (!pulses.size) {
          stage.removeAttribute("data-ink-active");
          last = undefined;
        }
      }
    }
    if (intro || pulses.size) frame = requestAnimationFrame(tick);
  }
  function resume() {
    const paused = !visible || document.hidden || reduced.matches;
    stage.toggleAttribute("data-paused", paused);
    if (reduced.matches) clear();
    if (paused) stop();
    else if (!disposed && (intro || pulses.size) && frame === undefined)
      frame = requestAnimationFrame(tick);
  }
  function move(event: PointerEvent) {
    if (intro || event.pointerType === "touch" || reduced.matches || !bounds) return;
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    let nearest = -1;
    let distance = Infinity;
    glyphs.forEach((glyph, index) => {
      const value = Math.hypot(glyph.x + glyph.width / 2 - x, glyph.y + glyph.height / 2 - y);
      if (value < distance && value < glyph.height * 0.75) {
        nearest = index;
        distance = value;
      }
    });
    if (nearest < 0 || nearest === hovered) return;
    hovered = nearest;
    pulses.set(nearest, time);
    stage.setAttribute("data-ink-active", "");
    resume();
  }
  function enter(event: PointerEvent) {
    bounds = stage.getBoundingClientRect();
    move(event);
  }
  function leave() {
    hovered = -1;
  }
  function scroll() {
    hovered = -1;
    clear();
  }
  const observer = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    resume();
  });
  observer.observe(stage);
  stage.addEventListener("pointerenter", enter);
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
    stage.removeEventListener("pointerenter", enter);
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
