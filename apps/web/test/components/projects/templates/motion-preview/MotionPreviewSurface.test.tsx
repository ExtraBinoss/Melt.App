import { createPreviewPlayback } from "../../../../../src/components/projects/templates/motion-preview/playback";
import { changeLanguage } from "../../../../../src/state/i18n";
import { expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MotionPreviewSurface } from "../../../../../src/components/projects/templates/motion-preview/MotionPreviewSurface";
import "../../../../../src/state/i18n";

test("carousel motion releases GPU work and rejects hover until the rail settles", () => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query.includes("hover"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const release = vi.fn(async () => undefined),
    start = vi.fn(() => ({ release }));
  const view = render(
    <div data-carousel>
      <button>
        <MotionPreviewSurface startPreview={start} poster="cached.webp" />
      </button>
    </div>,
  );
  const button = screen.getByRole("button"),
    rail = button.parentElement!;
  expect(view.container.querySelector(".motion-preview-hint")).toBeNull();
  fireEvent.pointerEnter(button);
  expect(start).toHaveBeenCalledOnce();
  rail.dataset.carouselMoving = "true";
  fireEvent(rail, new CustomEvent("musart:carousel-motion"));
  expect(release).toHaveBeenCalledOnce();
  fireEvent.pointerEnter(button);
  expect(start).toHaveBeenCalledOnce();
  delete rail.dataset.carouselMoving;
  fireEvent.focusIn(button);
  expect(start).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(release).toHaveBeenCalledTimes(2);
});

test("the generic saved/template surface stops native resources on page hiding and pointer gestures", () => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query.includes("hover"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const release = vi.fn(async () => undefined),
    start = vi.fn(() => ({ release }));
  const view = render(
    <button>
      <MotionPreviewSurface startPreview={start}>
        <span>Cached poster pending</span>
      </MotionPreviewSurface>
    </button>,
  );
  const button = screen.getByRole("button");
  expect(start).not.toHaveBeenCalled();
  fireEvent.pointerEnter(button);
  expect(start).toHaveBeenCalledOnce();
  fireEvent(document, new Event("visibilitychange"));
  expect(release).toHaveBeenCalledOnce();
  fireEvent.pointerLeave(button);
  fireEvent.pointerEnter(button);
  expect(start).toHaveBeenCalledTimes(2);
  fireEvent.pointerDown(button);
  fireEvent.focusIn(button);
  expect(start).toHaveBeenCalledTimes(2);
  expect(release).toHaveBeenCalledTimes(2);
  view.unmount();
});

test("rebinding beneath a real fine pointer resumes intent without autoplaying an active drag", () => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query.includes("hover"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const matches = HTMLElement.prototype.matches;
  let pressed = false;
  vi.spyOn(HTMLElement.prototype, "matches").mockImplementation(function (
    this: HTMLElement,
    selector: string,
  ) {
    return selector === ":hover"
      ? this.tagName === "BUTTON"
      : selector === ":active"
        ? pressed
        : matches.call(this, selector);
  });
  const release = vi.fn(async () => undefined),
    first = vi.fn(() => ({ release })),
    second = vi.fn(() => ({ release }));
  const view = render(
    <button>
      <MotionPreviewSurface startPreview={first} poster="cached.webp" />
    </button>,
  );
  expect(first).toHaveBeenCalledOnce();
  view.rerender(
    <button>
      <MotionPreviewSurface startPreview={second} poster="cached-new.webp" />
    </button>,
  );
  expect(release).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  pressed = true;
  const third = vi.fn(() => ({ release }));
  view.rerender(
    <button>
      <MotionPreviewSurface startPreview={third} poster="cached-new.webp" />
    </button>,
  );
  expect(third).not.toHaveBeenCalled();
});

test("separate preview controls keep pause and retry out of the card activation target", () => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query.includes("hover"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const release = vi.fn(async () => undefined),
    setPaused = vi.fn(),
    opened = vi.fn();
  let report!: (
    value: import("../../../../../src/components/projects/templates/motion-preview/runtime").PreviewStatus,
  ) => void;
  const start = vi.fn((_host: HTMLElement, onStatus: typeof report) => {
    report = onStatus;
    onStatus("loading");
    return { release, setPaused };
  });
  const view = render(
    <div className="template-card-entry" data-preview-owner>
      <button onClick={opened}>
        <MotionPreviewSurface startPreview={start} poster="cached.webp" />
      </button>
    </div>,
  );
  const owner = view.container.firstElementChild!;
  fireEvent.pointerEnter(owner);
  const root = view.container.querySelector(".motion-template-preview")!;
  act(() => report("playing"));
  const pause = view.container.querySelector<HTMLButtonElement>(".motion-preview-control")!;
  expect(pause.closest("button")!.parentElement).toBe(owner);
  expect(pause).toHaveAttribute("data-status", "playing");
  fireEvent.pointerDown(pause);
  fireEvent.click(pause);
  expect(release).not.toHaveBeenCalled();
  expect(setPaused).toHaveBeenCalledWith(true);
  expect(opened).not.toHaveBeenCalled();
  act(() => report("failed"));
  fireEvent.click(pause);
  expect(start).toHaveBeenCalledTimes(2);
  expect(root).toHaveAttribute("data-preview-status", "loading");
  view.unmount();
  expect(release).toHaveBeenCalledTimes(2);
});

test("dialog autoplay starts without hover, hides the hint and releases when outside the viewport", () => {
  let observe!: IntersectionObserverCallback;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observe = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(window, "matchMedia").mockImplementation(
    () =>
      ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const release = vi.fn(async () => undefined),
    start = vi.fn(() => ({ release }));
  const view = render(
    <div className="library-item-preview" data-preview-owner>
      <MotionPreviewSurface autoplay startPreview={start} />
    </div>,
  );
  expect(view.container.querySelector(".motion-preview-hint")).toBeNull();
  act(() =>
    observe([{ intersectionRatio: 1 }] as IntersectionObserverEntry[], {} as IntersectionObserver),
  );
  expect(start).toHaveBeenCalledOnce();
  fireEvent.pointerLeave(view.container.firstElementChild!);
  expect(release).not.toHaveBeenCalled();
  act(() =>
    observe([{ intersectionRatio: 0 }] as IntersectionObserverEntry[], {} as IntersectionObserver),
  );
  expect(release).toHaveBeenCalledOnce();
  view.unmount();
  vi.unstubAllGlobals();
});

test("touch cards admit only one visible preview and hand ownership back after a dialog closes", () => {
  const observers: IntersectionObserverCallback[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(window, "matchMedia").mockImplementation(
    () =>
      ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const release = vi.fn(async () => undefined),
    start = vi.fn(() => ({ release }));
  const card = render(
    <div data-preview-owner>
      <MotionPreviewSurface startPreview={start} />
    </div>,
  );
  act(() =>
    observers.at(-1)!(
      [{ intersectionRatio: 1 }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  );
  expect(start).toHaveBeenCalledOnce();
  const dialogStart = vi.fn(() => ({ release: vi.fn(async () => undefined) }));
  const dialog = render(
    <div className="library-item-preview" data-preview-owner>
      <MotionPreviewSurface autoplay startPreview={dialogStart} />
    </div>,
  );
  act(() =>
    observers.at(-1)!(
      [{ intersectionRatio: 1 }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  );
  expect(release).toHaveBeenCalledOnce();
  expect(dialogStart).toHaveBeenCalledOnce();
  dialog.unmount();
  expect(start).toHaveBeenCalledTimes(2);
  card.unmount();
  vi.unstubAllGlobals();
});

test("dialog imports the shared player as an overlay; frame updates keep control metadata stable", async () => {
  await changeLanguage("en");
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query.includes("hover"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const playback = createPreviewPlayback(),
    release = vi.fn(async () => {}),
    seek = vi.fn(),
    setPaused = vi.fn();
  const owner = { playback, release, seek, setPaused };
  const start = vi.fn(() => owner),
    metadata = vi.fn();
  const unsubscribe = playback.subscribe(metadata);
  const view = render(
    <div className="library-item-preview" data-preview-owner>
      <MotionPreviewSurface startPreview={start} />
    </div>,
  );
  fireEvent.pointerEnter(view.container.firstElementChild!);
  act(() => playback.update({ duration: 12, playing: true, ready: true }));
  const overlay = view.container.querySelector(".motion-preview-player")!;
  expect(overlay.querySelector(".media-player.media-player-overlay")).not.toBeNull();
  expect(view.container.querySelector(".motion-preview-control")).toBeNull();
  metadata.mockClear();
  act(() => {
    for (let frame = 1; frame <= 60; frame++) playback.position.set([frame / 30]);
  });
  expect(metadata).not.toHaveBeenCalled();
  expect(overlay.querySelector("[data-player]")).toHaveStyle({
    "--player-position": `${(2 / 12) * 100}%`,
  });
  fireEvent.click(screen.getByRole("button", { name: "Pause preview" }));
  expect(setPaused).toHaveBeenCalledWith(true);
  unsubscribe();
  view.unmount();
  expect(release).toHaveBeenCalledOnce();
});
