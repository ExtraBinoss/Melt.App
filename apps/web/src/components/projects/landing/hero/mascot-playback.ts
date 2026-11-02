import { createDahliaEngine } from "../../../../ui/brand/dahlia";
import { createMascotSurface } from "../../../../ui/brand/render-frame";
import {
  heroTiming,
  mascotGaze,
  mascotScale,
  onHeroReady,
  signalMascotReady,
  readHeroProgress,
} from "./choreography";

/** One continuous spherical gaze turn and size envelope, sampled together at display cadence. */
export function installHeroMascot(host: HTMLElement) {
  const svg = host.querySelector<SVGSVGElement>(".hero-mascot-face")!;
  const landing = host.querySelector<HTMLElement>(".hero-mascot-landing") ?? host;
  const engine = createDahliaEngine();
  const surface = createMascotSurface(svg, `hero-${crypto.randomUUID()}`);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const heading = host.closest(".landing-intro")?.querySelector("h1");
  const size = heading ? parseFloat(getComputedStyle(heading).fontSize) : 120;
  surface.paint(engine.sample(0));
  const body = svg.querySelector<SVGGraphicsElement>('[data-mascot-part="body"]');
  const bodyWidth = body?.getBBox?.().width ?? 200;
  const peakScale = (size * 1.22) / ((88 * bodyWidth) / 232);
  let visible = true;
  let disposed = false;
  let finished = false;
  let started = false;
  let frame: number | undefined;
  let last: number | undefined;
  let elapsed = 0;
  let blinked = false;
  engine.setLook(mascotGaze(0), -1, 0.001);
  landing.style.transform = "scale(0)";
  signalMascotReady(host);
  function stop() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    last = undefined;
  }
  function finish() {
    finished = true;
    stop();
    landing.style.transform = "scale(0)";
    surface.dispose();
    host.setAttribute("data-mascot-finished", "");
  }
  function tick(stamp: number) {
    frame = undefined;
    if (disposed || finished || !visible || document.hidden || reduced.matches) return;
    elapsed += last === undefined ? 0 : Math.max(0, stamp - last);
    last = stamp;
    if (elapsed >= heroTiming.finish) {
      finish();
      return;
    }
    if (elapsed >= heroTiming.blink && !blinked) {
      blinked = true;
      engine.blink(elapsed / 1000);
    }
    landing.style.transform = `scale(${peakScale * mascotScale(elapsed)})`;
    // Complete the tiny engine interpolation at this sample; the authored curve owns easing.
    engine.setLook(mascotGaze(elapsed), elapsed / 1000 - 0.001, 0.001);
    surface.paint(engine.sample(elapsed / 1000));
    frame = requestAnimationFrame(tick);
  }
  function resume() {
    const paused = !visible || document.hidden || reduced.matches;
    host.toggleAttribute("data-paused", paused);
    if (reduced.matches) finish();
    if (paused) stop();
    else if (started && !disposed && !finished && frame === undefined)
      frame = requestAnimationFrame(tick);
  }
  const stopReady = onHeroReady(host, () => {
    if (started || finished || disposed) return;
    started = true;
    elapsed = readHeroProgress(host);
    resume();
  });
  const observer = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    resume();
  });
  observer.observe(host);
  document.addEventListener("visibilitychange", resume);
  reduced.addEventListener("change", resume);
  resume();
  return () => {
    disposed = true;
    stop();
    stopReady();
    observer.disconnect();
    document.removeEventListener("visibilitychange", resume);
    reduced.removeEventListener("change", resume);
    surface.dispose();
    landing.style.removeProperty("transform");
    host.removeAttribute("data-face-ready");
    host.removeAttribute("data-paused");
  };
}
