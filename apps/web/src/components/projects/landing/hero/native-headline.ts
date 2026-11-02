/** One finite contour sweep, then on-demand pointer lighting of the same native text. */
export function installNativeHeadlineFallback(stage: HTMLElement, heading: HTMLElement) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const chunks = [...heading.querySelectorAll<HTMLElement>(".hero-chunk")];
  const lattice = stage.querySelector("feImage");
  let origins: { x: number; y: number; width: number }[] = [];
  let bounds: DOMRect | undefined;
  let pointer: { x: number; y: number } | undefined;
  let frame: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = 350;
  let scheduledAt = 0;
  let phase: "waiting" | "scanning" | "done" =
    reduced.matches || !stage.hasAttribute("data-ink-pending") ? "done" : "waiting";
  let elapsed = 0;
  let last: number | undefined;
  let visible = true;
  let disposed = false;
  let dirty = true;
  let rtl = false;

  function measure() {
    bounds = stage.getBoundingClientRect();
    rtl = getComputedStyle(heading).direction === "rtl";
    origins = chunks.map((chunk) => {
      const rect = chunk.getBoundingClientRect();
      return { x: rect.left - bounds!.left, y: rect.top - bounds!.top, width: rect.width };
    });
    dirty = false;
  }
  function cancelFrame() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    last = undefined;
  }
  function cancelTimer() {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    delay = Math.max(0, delay - (performance.now() - scheduledAt));
  }
  function clearLighting() {
    stage.removeAttribute("data-ink-active");
    stage.removeAttribute("data-ink-auto");
  }
  function reveal() {
    stage.removeAttribute("data-ink-pending");
    chunks.forEach((chunk) => chunk.removeAttribute("data-ink-writing"));
  }
  function paint(stamp: number) {
    frame = undefined;
    if (disposed || !visible || reduced.matches || document.hidden) return;
    if (dirty) measure();
    if (!bounds) return;
    if (phase === "scanning") {
      elapsed += last === undefined ? 0 : Math.min(60, stamp - last);
      last = stamp;
      const progress = elapsed / 1600;
      if (progress >= 1) {
        phase = "done";
        last = undefined;
        reveal();
        clearLighting();
        if (pointer) queue();
        return;
      }
      stage.setAttribute("data-ink-auto", "");
      stage.setAttribute("data-ink-active", "");
      lattice?.setAttribute("x", String(-(elapsed / 75) % 27));
      stage.style.setProperty(
        "--hero-ink",
        `var(--hero-tone-${Math.min(3, Math.floor(progress * 4))})`,
      );
      const total = origins.reduce((sum, origin) => sum + origin.width, 0);
      let written = progress * total;
      chunks.forEach((chunk, index) => {
        const width = origins[index]!.width;
        const local = Math.max(0, Math.min(1, written / Math.max(1, width)));
        written -= width;
        chunk.toggleAttribute("data-ink-writing", local > 0 && local < 1);
        chunk.style.setProperty(
          "--reveal-x",
          `${local === 1 ? width : Math.max(0, local * width - 18)}px`,
        );
        chunk.style.setProperty("--ink-x", `${(rtl ? 1 - local : local) * width}px`);
        chunk.style.setProperty("--ink-y", "50%");
      });
      queue();
    } else if (pointer) {
      const x = pointer.x - bounds.left;
      const y = pointer.y - bounds.top;
      stage.setAttribute("data-ink-active", "");
      lattice?.setAttribute("x", String((x * 0.08) % 27));
      const tone = Math.min(3, Math.floor(Math.max(0, x) / Math.max(1, bounds.width / 4)));
      stage.style.setProperty("--hero-ink", `var(--hero-tone-${tone})`);
      chunks.forEach((chunk, index) => {
        chunk.style.setProperty("--ink-x", `${x - origins[index]!.x}px`);
        chunk.style.setProperty("--ink-y", `${y - origins[index]!.y}px`);
      });
    }
  }
  function queue() {
    if (frame === undefined) frame = requestAnimationFrame(paint);
  }
  function environment() {
    cancelTimer();
    cancelFrame();
    if (reduced.matches) {
      phase = "done";
      pointer = undefined;
      reveal();
      clearLighting();
    }
    if (disposed || !visible || document.hidden || reduced.matches) {
      clearLighting();
      return;
    }
    if (phase === "waiting") {
      scheduledAt = performance.now();
      timer = setTimeout(() => {
        timer = undefined;
        phase = "scanning";
        queue();
      }, delay);
    } else if (phase === "scanning" || pointer) queue();
  }
  function enter(event: PointerEvent) {
    if (event.pointerType === "touch" || reduced.matches) return;
    dirty = true;
    pointer = { x: event.clientX, y: event.clientY };
    if (phase === "done") queue();
  }
  function move(event: PointerEvent) {
    if (!pointer || reduced.matches) return;
    pointer = { x: event.clientX, y: event.clientY };
    if (phase === "done") queue();
  }
  function leave() {
    pointer = undefined;
    if (phase === "done") {
      cancelFrame();
      clearLighting();
    }
  }
  function scroll() {
    phase = "done";
    cancelTimer();
    reveal();
    leave();
  }
  function invalidate() {
    dirty = true;
    if (pointer || phase === "scanning") queue();
  }
  const observer = new ResizeObserver(invalidate);
  const intersection =
    typeof IntersectionObserver === "undefined"
      ? undefined
      : new IntersectionObserver(([entry]) => {
          visible = Boolean(entry?.isIntersecting);
          environment();
        });
  observer.observe(stage);
  intersection?.observe(stage);
  stage.addEventListener("pointerenter", enter);
  stage.addEventListener("pointermove", move);
  stage.addEventListener("pointerleave", leave);
  stage.addEventListener("pointercancel", leave);
  heading.addEventListener("animationend", invalidate);
  document.addEventListener("visibilitychange", environment);
  reduced.addEventListener("change", environment);
  document.fonts?.addEventListener("loadingdone", invalidate);
  stage.closest(".landing-page")?.addEventListener("scroll", scroll, { passive: true });
  environment();
  return () => {
    disposed = true;
    cancelTimer();
    cancelFrame();
    clearLighting();
    observer.disconnect();
    intersection?.disconnect();
    stage.removeEventListener("pointerenter", enter);
    stage.removeEventListener("pointermove", move);
    stage.removeEventListener("pointerleave", leave);
    stage.removeEventListener("pointercancel", leave);
    heading.removeEventListener("animationend", invalidate);
    document.removeEventListener("visibilitychange", environment);
    reduced.removeEventListener("change", environment);
    document.fonts?.removeEventListener("loadingdone", invalidate);
    stage.closest(".landing-page")?.removeEventListener("scroll", scroll);
  };
}
