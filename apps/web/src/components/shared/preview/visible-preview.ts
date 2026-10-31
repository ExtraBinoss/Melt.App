interface Candidate {
  element: HTMLElement;
  enabled: () => boolean;
  priority: number;
  ratio: number;
  change: (active: boolean) => void;
}
const candidates = new Set<Candidate>();
let current: Candidate | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
function publish(next: Candidate | undefined) {
  if (next === current) return;
  const previous = current;
  current = next;
  previous?.change(false);
  next?.change(true);
}
function reconcile() {
  if (timer !== undefined) return;
  // Batch geometry reads before notifying owners, which may attach canvases.
  const ranked = [...candidates]
    .filter((c) => c.ratio >= 0.6 && !document.hidden && c.enabled())
    .map((candidate) => {
      const rect = candidate.element.getBoundingClientRect();
      return { candidate, distance: Math.abs(rect.top + rect.height / 2 - innerHeight / 2) };
    });
  ranked.sort((a, b) => b.candidate.priority - a.candidate.priority || a.distance - b.distance);
  publish(ranked[0]?.candidate);
}
function scroll() {
  clearTimeout(timer);
  publish(undefined);
  timer = setTimeout(() => {
    timer = undefined;
    reconcile();
  }, 120);
}
/** One visible touch-card or dialog at a time; scrolling suspends optional GPU work. */
export function bindVisiblePreview(
  element: HTMLElement,
  options: {
    enabled: () => boolean;
    priority: number;
    onChange: (active: boolean) => void;
  },
) {
  const candidate: Candidate = {
    element,
    enabled: options.enabled,
    priority: options.priority,
    ratio: 0,
    change: options.onChange,
  };
  candidates.add(candidate);
  if (candidates.size === 1) {
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("scroll", scroll, { passive: true, capture: true });
  }
  const observer = new IntersectionObserver(
    (entries) => {
      candidate.ratio = entries[0]?.intersectionRatio ?? 0;
      reconcile();
    },
    { threshold: [0, 0.6, 1] },
  );
  observer.observe(element);
  return {
    refresh: reconcile,
    dispose() {
      observer.disconnect();
      candidates.delete(candidate);
      if (!candidates.size) {
        clearTimeout(timer);
        timer = undefined;
        document.removeEventListener("visibilitychange", reconcile);
        window.removeEventListener("scroll", scroll, true);
      }
      reconcile();
    },
  };
}
