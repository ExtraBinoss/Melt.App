import { afterEach, vi } from "vitest";
import { installCarouselPan } from "../../../../../src/components/projects/landing/carousel/controller";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

export function fixture(
  options: {
    reducedMotion?: boolean;
    origin?: number;
    position?: number;
    autoScroll?: boolean;
    visible?: boolean;
    links?: boolean;
  } = {},
) {
  vi.useFakeTimers();
  let resize!: ResizeObserverCallback,
    now = 0,
    nextFrame = 0;
  const disconnect = vi.fn(),
    observe = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => frames.delete(id)),
  );
  vi.spyOn(performance, "now").mockImplementation(() => now);
  let intersection: IntersectionObserverCallback | undefined;
  let reduced = options.reducedMotion ?? false;
  const mediaListeners = new Map<string, Set<() => void>>();
  const intersectionDisconnect = vi.fn(),
    mediaRemove = vi.fn((_: string, listener: () => void) => {
      for (const listeners of mediaListeners.values()) listeners.delete(listener);
    });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersection = callback;
      }
      observe() {}
      disconnect = intersectionDisconnect;
    },
  );
  if (options.autoScroll) {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          get matches() {
            return query.includes("prefers-reduced-motion")
              ? reduced
              : query.includes("pointer: fine");
          },
          media: query,
          addEventListener: (_: string, listener: () => void) => {
            const listeners = mediaListeners.get(query) ?? new Set();
            listeners.add(listener);
            mediaListeners.set(query, listeners);
          },
          removeEventListener: mediaRemove,
        }) as unknown as MediaQueryList,
    );
  }

  const node = document.createElement("div");
  node.style.columnGap = "24px";
  node.tabIndex = 0;
  node.setAttribute("data-carousel", "previous");
  const cards = Array.from({ length: 6 }, (_, index) => {
    const button = document.createElement(options.links ? "a" : "button");
    if (button instanceof HTMLAnchorElement)
      button.href = `/dashboard?preview=template&item=card-${index}`;
    button.textContent = `Card ${index}`;
    node.append(button);
    return button;
  });
  cards[0]!.style.transform = "rotate(5deg)";
  cards[0]!.style.willChange = "opacity";
  let cardWidth = 350;
  const origin = options.origin ?? 24;
  const reads = vi.fn();
  Object.defineProperty(node, "clientWidth", {
    get: () => {
      reads();
      return 800;
    },
  });
  for (const [index, card] of cards.entries())
    Object.defineProperties(card, {
      offsetLeft: {
        get: () => {
          reads();
          return origin + index * (cardWidth + 24);
        },
      },
      offsetWidth: {
        get: () => {
          reads();
          return cardWidth;
        },
      },
    });
  const captured = new Set<number>();
  node.setPointerCapture = vi.fn((id) => {
    captured.add(id);
  });
  node.hasPointerCapture = vi.fn((id) => captured.has(id));
  node.releasePointerCapture = vi.fn((id) => {
    captured.delete(id);
    const event = new Event("lostpointercapture", { bubbles: true });
    Object.assign(event, { pointerId: id });
    node.dispatchEvent(event);
  });
  document.body.append(node);
  const events: boolean[] = [];
  node.addEventListener("musart:carousel-motion", (event) =>
    events.push((event as CustomEvent<{ moving: boolean }>).detail.moving),
  );
  const api = installCarouselPan(node, {
    reducedMotion: options.reducedMotion ?? false,
    position: options.position,
    autoScroll: options.autoScroll ?? false,
  });
  const measure = () => resize([], {} as ResizeObserver);
  measure();
  function intersect(visible: boolean) {
    intersection?.(
      [{ isIntersecting: visible } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  }
  intersect(options.visible ?? true);
  function pointer(type: string, x: number, time: number, y = 100, pointerType = "mouse") {
    now = time;
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 7, button: 0, pointerType, clientX: x, clientY: y });
    node.dispatchEvent(event);
    return event;
  }
  function frame(time: number) {
    now = time;
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(time);
  }
  function wheel(x: number, y = 0, extra: WheelEventInit = {}) {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: x,
      deltaY: y,
      ...extra,
    });
    node.dispatchEvent(event);
    return event;
  }
  function intervals() {
    return cards
      .map((card, index) => {
        const translate = Number(
          card.style.transform.match(/translate3d\(([-\d.eE]+)px/)?.[1] ?? 0,
        );
        return {
          left: origin + index * (cardWidth + 24) + translate,
          right: origin + index * (cardWidth + 24) + translate + cardWidth,
        };
      })
      .sort((a, b) => a.left - b.left);
  }
  function dispose() {
    api.dispose();
    node.remove();
  }
  cleanup.push(dispose);
  return {
    node,
    intersectionDisconnect,
    changeReduced: (value: boolean) => {
      reduced = value;
      for (const listener of mediaListeners.get("(prefers-reduced-motion: reduce)") ?? [])
        listener();
    },
    mediaRemove,
    intersect,
    time: () => now,
    elapse: (duration: number) => {
      now += duration;
      vi.advanceTimersByTime(duration);
    },
    cards,
    api,
    pointer,
    frame,
    frames,
    wheel,
    intervals,
    events,
    reads,
    measure,
    observe,
    disconnect,
    captured,
    dispose,
    period: () => 6 * (cardWidth + 24),
    resizeTo: (value: number) => {
      cardWidth = value;
      measure();
    },
  };
}
