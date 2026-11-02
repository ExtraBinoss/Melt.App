import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createDahliaEngine } from "../../../../src/ui/brand/dahlia";
import { installHeroMascot } from "../../../../src/components/projects/landing/hero/mascot-playback";
import { installNativeHeadlineFallback } from "../../../../src/components/projects/landing/hero/native-headline";
import { installVectorHeadline } from "../../../../src/components/projects/landing/hero/vector-playback";
import {
  mascotGaze,
  mascotScale,
  signalHeroReady,
} from "../../../../src/components/projects/landing/hero/choreography";

let frames: Map<number, FrameRequestCallback>;
let stamp: number;
let hidden: boolean;
let reduced: boolean;
let preferenceListeners: Set<() => void>;
let intersection: IntersectionObserverCallback;
let disconnect: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  frames = new Map();
  let sequence = 0;
  stamp = 0;
  hidden = false;
  reduced = false;
  preferenceListeners = new Set();
  disconnect = vi.fn();
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.spyOn(window, "matchMedia").mockImplementation(
    () =>
      ({
        get matches() {
          return reduced;
        },
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        addEventListener: (_type: string, listener: () => void) => {
          preferenceListeners.add(listener);
        },
        removeEventListener: (_type: string, listener: () => void) => {
          preferenceListeners.delete(listener);
        },
      }) as unknown as MediaQueryList,
  );
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersection = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
});
function step(milliseconds = 34) {
  stamp += milliseconds;
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(stamp));
}
function fixture(markup: string) {
  const parent = document.createElement("section");
  parent.className = "landing-intro landing-page";
  parent.innerHTML = markup;
  document.body.append(parent);
  return parent;
}
function mascot() {
  const parent = fixture(
    '<div class="hero-mascot-stage"><svg class="hero-mascot-face"></svg></div>',
  );
  const host = parent.firstElementChild as HTMLElement;
  const dispose = installHeroMascot(host);
  signalHeroReady(host);
  return { parent, host, dispose, geometry: () => host.querySelector("svg")!.innerHTML };
}

test("the original face looks around, blinks goodbye, leaves and retires every frame", () => {
  const engine = createDahliaEngine();
  const blink = vi.spyOn(Object.getPrototypeOf(engine), "blink");
  const look = vi.spyOn(Object.getPrototypeOf(engine), "setLook");
  const f = mascot();
  expect(f.host).toHaveAttribute("data-face-ready");
  expect(look).toHaveBeenCalledWith(mascotGaze(0), -1, 0.001);
  const initial = f.geometry();
  for (let i = 0; i < 20; i++) step();
  expect(f.geometry()).not.toBe(initial);
  expect(f.geometry()).not.toContain("NaN");
  for (let i = 0; i < 60; i++) step();
  expect(blink).toHaveBeenCalledOnce();
  expect(f.host).toHaveAttribute("data-mascot-finished");
  expect(f.geometry()).toBe("");
  expect(frames.size).toBe(0);
  f.dispose();
  expect(preferenceListeners.size).toBe(0);
  expect(disconnect).toHaveBeenCalledOnce();
  f.parent.remove();
});

test("the measured mascot envelope grows smoothly, holds and accelerates into its exit", () => {
  expect(mascotScale(0)).toBe(0);
  expect(mascotScale(100)).toBeCloseTo(0.598, 3);
  expect(mascotScale(600)).toBe(1);
  expect(mascotScale(800)).toBe(1);
  expect(mascotScale(1125)).toBe(0.75);
  expect(mascotScale(1450)).toBe(0);
  expect(mascotScale(599.9)).toBeCloseTo(mascotScale(600.1), 7);
  expect(mascotScale(799.9)).toBeCloseTo(mascotScale(800.1), 7);
  expect(mascotGaze(0).pitch).toBe(-45);
  expect(mascotGaze(300).pitch).toBeCloseTo(28.62);
  expect(mascotGaze(1100).pitch).toBeCloseTo(28.62);
  expect(mascotGaze(1450).pitch).toBeCloseTo(28.62 - 360);
});

test("hidden/offscreen mascot clocks pause without catching up; reduced motion retires them", () => {
  const f = mascot();
  step();
  hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  expect(frames.size).toBe(0);
  const before = f.geometry();
  step(10000);
  expect(f.geometry()).toBe(before);
  hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  expect(frames.size).toBe(1);
  intersection(
    [{ isIntersecting: false }] as IntersectionObserverEntry[],
    {} as IntersectionObserver,
  );
  expect(frames.size).toBe(0);
  intersection(
    [{ isIntersecting: true }] as IntersectionObserverEntry[],
    {} as IntersectionObserver,
  );
  expect(frames.size).toBe(1);
  reduced = true;
  preferenceListeners.forEach((listener) => listener());
  expect(frames.size).toBe(0);
  expect(f.host).toHaveAttribute("data-mascot-finished");
  f.dispose();
  f.parent.remove();
});

function headline() {
  const parent = fixture(
    '<div data-ink-pending><h1><span class="hero-chunk">Créez et</span> <span class="hero-chunk">animez.</span></h1></div>',
  );
  const stage = parent.firstElementChild as HTMLElement;
  const heading = stage.firstElementChild as HTMLElement;
  stage.getBoundingClientRect = () => new DOMRect(0, 0, 600, 100);
  const chunks = [...stage.querySelectorAll<HTMLElement>(".hero-chunk")];
  const reads = chunks.map((chunk, index) =>
    vi.spyOn(chunk, "getBoundingClientRect").mockReturnValue(new DOMRect(index * 300, 0, 300, 100)),
  );
  const dispose = installNativeHeadlineFallback(stage, heading);
  return { parent, stage, heading, chunks, reads, dispose };
}
function completeWriting() {
  vi.advanceTimersByTime(350);
  for (let i = 0; i < 50; i++) step();
}

test("the native fallback writes sequentially, then native text returns to normal", () => {
  const f = headline();
  vi.advanceTimersByTime(250);
  expect(frames.size).toBe(0);
  expect(f.stage).toHaveAttribute("data-ink-pending");
  vi.advanceTimersByTime(100);
  for (let i = 0; i < 13; i++) step();
  expect(f.stage).toHaveAttribute("data-ink-auto");
  expect(f.chunks[0]).toHaveAttribute("data-ink-writing");
  expect(f.chunks[1]!.style.getPropertyValue("--reveal-x")).toBe("0px");
  for (let i = 0; i < 14; i++) step();
  expect(f.chunks[0]).not.toHaveAttribute("data-ink-writing");
  expect(f.chunks[1]).toHaveAttribute("data-ink-writing");
  for (let i = 0; i < 30; i++) step();
  expect(f.stage).not.toHaveAttribute("data-ink-pending");
  expect(f.stage).not.toHaveAttribute("data-ink-active");
  expect(frames.size).toBe(0);
  expect(f.heading.textContent).toBe("Créez et animez.");
  f.dispose();
  f.parent.remove();
});

test("native hover coalesces input and reads current geometry without creating character nodes or readbacks", () => {
  const f = headline();
  completeWriting();
  const measured = f.reads[0]!.mock.calls.length;
  f.stage.dispatchEvent(new PointerEvent("pointerenter", { clientX: 60, clientY: 40 }));
  for (let i = 0; i < 12; i++)
    f.stage.dispatchEvent(new PointerEvent("pointermove", { clientX: 60 + i, clientY: 40 }));
  expect(frames.size).toBe(1);
  step();
  expect(f.stage).toHaveAttribute("data-ink-active");
  expect(f.reads[0]).toHaveBeenCalledTimes(measured + 1);
  f.stage.dispatchEvent(new PointerEvent("pointermove", { clientX: 120, clientY: 60 }));
  step();
  expect(f.reads[0]).toHaveBeenCalledTimes(measured + 2);
  expect(f.heading.children).toHaveLength(2);
  f.stage.dispatchEvent(new PointerEvent("pointerleave"));
  expect(f.stage).not.toHaveAttribute("data-ink-active");
  f.dispose();
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(preferenceListeners.size).toBe(0);
  f.parent.remove();
});

test("hidden automatic writing pauses, scrolling reveals immediately, and disposal cancels pending work", () => {
  const f = headline();
  vi.advanceTimersByTime(100);
  hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  vi.advanceTimersByTime(10000);
  expect(frames.size).toBe(0);
  hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  vi.advanceTimersByTime(250);
  step();
  expect(f.stage).toHaveAttribute("data-ink-auto");
  f.parent.dispatchEvent(new Event("scroll"));
  expect(f.stage).not.toHaveAttribute("data-ink-pending");
  expect(frames.size).toBe(0);
  f.stage.dispatchEvent(new PointerEvent("pointerenter"));
  expect(frames.size).toBe(1);
  f.dispose();
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  f.parent.remove();
});

test("reduced motion skips every delay and displays the complete heading", () => {
  reduced = true;
  const f = headline();
  expect(f.stage).not.toHaveAttribute("data-ink-pending");
  expect(vi.getTimerCount()).toBe(0);
  f.stage.dispatchEvent(new PointerEvent("pointerenter"));
  expect(frames.size).toBe(0);
  f.dispose();
  f.parent.remove();
});

test("real curve endpoints coalesce, each glyph traces before filling, and hover replays finitely", () => {
  const parent = fixture("<div data-ink-pending><h1>AB</h1></div>");
  const stage = parent.firstElementChild as HTMLElement;
  const heading = stage.firstElementChild as HTMLElement;
  stage.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100);
  const glyphs = [0, 1].map((index) => ({
    d: `M${index * 80} 10L${index * 80 + 60} 10L${index * 80 + 60} 80Z`,
    points: [
      { x: index * 80, y: 10 },
      { x: index * 80 + 60, y: 10 },
    ],
    x: index * 80,
    y: 0,
    width: 60,
    height: 100,
  }));
  const dispose = installVectorHeadline(stage, heading, glyphs);
  for (let i = 0; i < 13; i++) step();
  const groups = [...stage.querySelectorAll("[data-hero-glyph]")];
  expect(stage).toHaveAttribute("data-ink-auto");
  expect(groups[0]).toHaveAttribute("opacity", "1");
  expect(groups[0]!.querySelector("path")!.getAttribute("fill-opacity")).toBe("0");
  expect(groups[1]).toHaveAttribute("opacity", "0");
  for (let i = 0; i < 40; i++) step();
  expect(stage).not.toHaveAttribute("data-ink-pending");
  expect(frames.size).toBe(0);
  stage.dispatchEvent(new PointerEvent("pointerenter", { clientX: 30, clientY: 40 }));
  for (let i = 0; i < 10; i++) step();
  expect(stage).toHaveAttribute("data-ink-active");
  expect(groups[0]!.querySelector("path")).toHaveAttribute("fill-opacity", "0");
  expect(groups[0]!.querySelector("circle")).toHaveAttribute("cx", "0");
  for (let i = 0; i < 30; i++) step();
  expect(stage).not.toHaveAttribute("data-ink-active");
  expect(frames.size).toBe(0);
  dispose();
  expect(stage.querySelector("svg")).toBeNull();
  expect(heading.style.maskImage).toBe("");
  expect(preferenceListeners.size).toBe(0);
  parent.remove();
});

function pointerFixture(pending = false) {
  const parent = fixture(`<div ${pending ? 'data-ink-pending=""' : ""}><h1>A</h1></div>`);
  const stage = parent.firstElementChild as HTMLElement;
  const heading = stage.firstElementChild as HTMLElement;
  const bounds = vi
    .spyOn(stage, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(0, 0, 200, 100));
  const dispose = installVectorHeadline(stage, heading, [
    {
      d: "M0 10L60 10L60 80Z",
      points: [{ x: 0, y: 10 }],
      x: 0,
      y: 0,
      width: 60,
      height: 100,
    },
  ]);
  return { parent, stage, bounds, dispose, path: stage.querySelector("[data-hero-glyph] > path")! };
}

test("pointermove works without enter, repeats a completed glyph and uses current geometry once per frame", () => {
  const f = pointerFixture();
  const reads = f.bounds.mock.calls.length;
  for (let i = 0; i < 12; i++)
    f.stage.dispatchEvent(new PointerEvent("pointermove", { clientX: 30 + i / 10, clientY: 40 }));
  expect(frames.size).toBe(1);
  step();
  expect(f.bounds).toHaveBeenCalledTimes(reads + 1);
  for (let i = 0; i < 10; i++) step();
  expect(f.path).toHaveAttribute("fill-opacity", "0");
  for (let i = 0; i < 30; i++) step();
  expect(frames.size).toBe(0);
  expect(f.stage).not.toHaveAttribute("data-ink-active");
  // Stay on the same letter: a completed pulse must not suppress the next native move.
  f.stage.dispatchEvent(new PointerEvent("pointermove", { clientX: 31, clientY: 40 }));
  for (let i = 0; i < 10; i++) step();
  expect(f.path).toHaveAttribute("fill-opacity", "0");
  expect(f.stage).toHaveAttribute("data-ink-active");
  for (let i = 0; i < 30; i++) step();
  // A translated surface does not necessarily receive another pointerenter.
  f.bounds.mockReturnValue(new DOMRect(100, 100, 200, 100));
  f.stage.dispatchEvent(new PointerEvent("pointermove", { clientX: 131, clientY: 140 }));
  for (let i = 0; i < 10; i++) step();
  expect(f.path).toHaveAttribute("fill-opacity", "0");
  expect(f.stage).toHaveAttribute("data-ink-active");
  f.dispose();
  expect(frames.size).toBe(0);
  f.parent.remove();
});

test("a pointer already over the letters when the entrance ends receives its hover replay", () => {
  const f = pointerFixture(true);
  f.stage.dispatchEvent(new PointerEvent("pointermove", { clientX: 30, clientY: 40 }));
  for (let i = 0; i < 54; i++) step();
  expect(f.stage).not.toHaveAttribute("data-ink-pending");
  expect(f.stage).toHaveAttribute("data-ink-active");
  expect(f.path).toHaveAttribute("fill-opacity", "0");
  f.stage.dispatchEvent(new PointerEvent("pointerleave"));
  for (let i = 0; i < 40; i++) step();
  expect(frames.size).toBe(0);
  expect(f.stage).not.toHaveAttribute("data-ink-active");
  f.dispose();
  f.parent.remove();
});

test("fallback scripts also accept a first pointermove without pointerenter", () => {
  const f = headline();
  completeWriting();
  f.stage.dispatchEvent(new PointerEvent("pointermove", { clientX: 60, clientY: 40 }));
  step();
  expect(f.stage).toHaveAttribute("data-ink-active");
  f.dispose();
  expect(frames.size).toBe(0);
  f.parent.remove();
});
