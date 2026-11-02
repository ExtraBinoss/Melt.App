import { afterEach, expect, test, vi } from "vitest";
import { installHeadlineInteraction } from "../../../../src/components/projects/landing/hero/headline-interaction";

const prepare = vi.hoisted(() => vi.fn());
vi.mock("../../../../src/components/projects/landing/hero/glyph-geometry", () => ({
  prepareHeroGlyphs: prepare,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  prepare.mockReset();
});
test("offscreen closing headings defer font work and geometry reads until viewport entry", async () => {
  const callbacks: IntersectionObserverCallback[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  const stage = document.createElement("div"),
    heading = document.createElement("h2");
  heading.innerHTML = '<span class="hero-chunk">Your turn.</span>';
  stage.append(heading);
  document.body.append(stage);
  const width = vi.spyOn(stage, "clientWidth", "get").mockReturnValue(300);
  prepare.mockResolvedValue(undefined);
  const dispose = installHeadlineInteraction(stage, heading, { deferUntilVisible: true });
  expect(prepare).not.toHaveBeenCalled();
  expect(width).not.toHaveBeenCalled();
  callbacks[0]!(
    [{ isIntersecting: false }] as IntersectionObserverEntry[],
    {} as IntersectionObserver,
  );
  expect(prepare).not.toHaveBeenCalled();
  callbacks[0]!(
    [{ isIntersecting: true }] as IntersectionObserverEntry[],
    {} as IntersectionObserver,
  );
  await Promise.resolve();
  expect(prepare).toHaveBeenCalledOnce();
  expect(width).toHaveBeenCalled();
  callbacks[0]!(
    [{ isIntersecting: true }] as IntersectionObserverEntry[],
    {} as IntersectionObserver,
  );
  expect(prepare).toHaveBeenCalledOnce();
  dispose();
  stage.remove();
});
test("late visibility deliveries cannot restart a disposed heading", () => {
  let callback!: IntersectionObserverCallback;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(next: IntersectionObserverCallback) {
        callback = next;
      }
      observe() {}
      disconnect() {}
    },
  );
  const stage = document.createElement("div"),
    heading = document.createElement("h2");
  stage.append(heading);
  const dispose = installHeadlineInteraction(stage, heading, { deferUntilVisible: true });
  dispose();
  callback([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);
  expect(prepare).not.toHaveBeenCalled();
});

test("a replacement is prepared before retiring the currently visible glyph surface", async () => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  let resized!: ResizeObserverCallback;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resized = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const stage = document.createElement("div"),
    heading = document.createElement("h1");
  stage.append(heading);
  document.body.append(stage);
  const geometry = [{ d: "M0 0L40 80Z", points: [], x: 0, y: 0, width: 40, height: 80 }];
  let resolve!: (value: typeof geometry) => void;
  prepare.mockResolvedValueOnce(geometry).mockImplementationOnce(
    () =>
      new Promise((settle) => {
        resolve = settle;
      }),
  );
  const dispose = installHeadlineInteraction(stage, heading);
  try {
    await vi.waitFor(() => expect(stage.querySelector(".hero-glyph-overlay")).not.toBeNull());
    const original = stage.querySelector(".hero-glyph-overlay")!;
    resized(
      [
        {
          target: stage,
          contentRect: new DOMRect(0, 0, 300, 100),
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      {} as ResizeObserver,
    );
    await Promise.resolve();
    expect(original.isConnected).toBe(true);
    resolve(geometry);
    await vi.waitFor(() => expect(original.isConnected).toBe(false));
    expect(stage.querySelectorAll(".hero-glyph-overlay")).toHaveLength(1);
  } finally {
    dispose();
    stage.remove();
  }
});
