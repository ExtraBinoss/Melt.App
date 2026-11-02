import { createDahliaEngine } from "../../../../ui/brand/dahlia";
import { createMascotSurface } from "../../../../ui/brand/render-frame";

/** The original face looks around, blinks goodbye and retires with its CSS departure. */
export function installHeroMascot(host: HTMLElement) {
  const svg = host.querySelector<SVGSVGElement>(".hero-mascot-face")!;
  const engine = createDahliaEngine();
  const surface = createMascotSurface(svg, `hero-${crypto.randomUUID()}`);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let visible = true;
  let disposed = false;
  let finished = false;
  let frame: number | undefined;
  let last: number | undefined;
  let time = 0.75;
  let paintedAt = -Infinity;
  let blinked = false;
  let waved = false;

  surface.paint(engine.sample(time));
  host.setAttribute("data-face-ready", "");
  function stop() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    last = undefined;
  }
  function finish() {
    finished = true;
    stop();
    surface.dispose();
    host.setAttribute("data-mascot-finished", "");
  }
  function tick(stamp: number) {
    frame = undefined;
    if (disposed || finished || !visible || document.hidden || reduced.matches) return;
    time += last === undefined ? 0 : Math.min(0.06, (stamp - last) / 1000);
    last = stamp;
    const elapsed = time - 0.75;
    if (elapsed >= 1.4) {
      finish();
      return;
    }
    if (stamp - paintedAt >= 1000 / 30) {
      paintedAt = stamp;
      if (elapsed < 0.6) {
        const progress = elapsed / 0.6;
        engine.setLook(
          {
            yaw: Math.sin(progress * Math.PI * 2) * 62,
            pitch: Math.cos(progress * Math.PI * 2) * 28,
            mix: 1,
            spin: 0,
            wander: 0,
          },
          time,
          0.04,
        );
      } else if (!blinked) {
        blinked = true;
        engine.setLook(null, time);
        engine.blink(time);
      } else if (elapsed >= 0.9 && !waved) {
        waved = true;
        engine.blink(time);
      }
      surface.paint(engine.sample(time));
    }
    frame = requestAnimationFrame(tick);
  }
  function resume() {
    const paused = !visible || document.hidden || reduced.matches;
    host.toggleAttribute("data-paused", paused);
    if (paused) stop();
    else if (!disposed && !finished && frame === undefined) frame = requestAnimationFrame(tick);
    if (reduced.matches) finish();
  }
  function animationEnd(event: AnimationEvent) {
    if (event.animationName === "hero-mascot-exit") finish();
  }
  const observer = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    resume();
  });
  observer.observe(host);
  host.addEventListener("animationend", animationEnd);
  document.addEventListener("visibilitychange", resume);
  reduced.addEventListener("change", resume);
  resume();
  return () => {
    disposed = true;
    stop();
    observer.disconnect();
    host.removeEventListener("animationend", animationEnd);
    document.removeEventListener("visibilitychange", resume);
    reduced.removeEventListener("change", resume);
    surface.dispose();
    host.removeAttribute("data-face-ready");
    host.removeAttribute("data-paused");
  };
}
