/** Admit one worker inference only after an input-free interval. No document/React frame updates. */
export function createDepthScheduling(page: Document = document, quietMs = 120) {
  const pointers = new Set<number>();
  let lastInput = performance.now(),
    timer: ReturnType<typeof setTimeout> | undefined,
    closed = false;
  let pending: (() => void) | undefined;
  const input = () => {
    lastInput = performance.now();
  };
  const down = (event: PointerEvent) => {
    pointers.add(event.pointerId);
    input();
  };
  const up = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    input();
  };
  const blur = () => {
    pointers.clear();
    input();
  };
  function poll() {
    timer = undefined;
    if (closed || !pending) return;
    if (page.hidden || pointers.size || performance.now() - lastInput < quietMs) {
      timer = setTimeout(poll, 50);
      return;
    }
    const ready = pending;
    pending = undefined;
    ready();
  }
  page.addEventListener("pointerdown", down, { capture: true, passive: true });
  page.addEventListener("pointerup", up, { capture: true, passive: true });
  page.addEventListener("pointercancel", up, { capture: true, passive: true });
  page.addEventListener("wheel", input, { capture: true, passive: true });
  page.addEventListener("keydown", input, { capture: true });
  page.defaultView?.addEventListener("blur", blur);
  return {
    request(ready: () => void) {
      if (closed) return;
      pending = ready;
      clearTimeout(timer);
      // Give the editor a frame opportunity between GPU jobs, even during idle preparation.
      timer = setTimeout(poll, 75);
    },
    dispose() {
      closed = true;
      pending = undefined;
      clearTimeout(timer);
      page.removeEventListener("pointerdown", down, true);
      page.removeEventListener("pointerup", up, true);
      page.removeEventListener("pointercancel", up, true);
      page.removeEventListener("wheel", input, true);
      page.removeEventListener("keydown", input, true);
      page.defaultView?.removeEventListener("blur", blur);
    },
  };
}
