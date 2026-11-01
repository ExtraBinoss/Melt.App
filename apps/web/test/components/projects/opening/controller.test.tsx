import { act } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  beginProjectOpening,
  currentProjectOpening,
} from "../../../../src/components/projects/opening/controller";
import { captureOpeningOrigin } from "../../../../src/components/projects/opening/origin";
const motion = vi.hoisted(() => ({
  animate: vi.fn((_element: Element, _frames: unknown, _options: unknown) => ({
    stop: vi.fn(),
    finished: new Promise<void>(() => {}),
  })),
}));
vi.mock("motion/mini", () => motion);
vi.mock("../../../../src/components/projects/opening/OpeningSurface", () => ({
  OpeningSurface: () => <div role="status">Opening</div>,
}));
afterEach(() => {
  act(() => currentProjectOpening()?.close());
  document.querySelector(".editor-gpu-scene")?.remove();
  vi.unstubAllGlobals();
  motion.animate.mockClear();
});
function canvas() {
  const scene = document.createElement("div");
  scene.className = "editor-gpu-scene";
  const canvas = document.createElement("canvas");
  scene.append(canvas);
  document.body.append(scene);
  return canvas;
}
test("opens a circle at the exact primary pointer and waits for installation plus a genuinely presented frame", async () => {
  const stop = captureOpeningOrigin(document);
  document.dispatchEvent(
    new PointerEvent("pointerdown", { button: 0, isPrimary: true, clientX: 117, clientY: 83 }),
  );
  let opening!: ReturnType<typeof beginProjectOpening>;
  act(() => {
    opening = beginProjectOpening();
  });
  const surface = document.querySelector<HTMLElement>(".project-opening-surface")!;
  expect(surface.dataset.originX).toBe("117");
  expect(surface.dataset.originY).toBe("83");
  expect(surface.style.clipPath).toBe("");
  expect(motion.animate.mock.calls[0]?.[1]).toEqual({ transform: ["scale(0)", "scale(1)"] });
  expect(surface.querySelector(".project-opening-circle")).not.toBeNull();
  const target = canvas();
  target.dataset.presentationReady = "true";
  await act(async () => {});
  expect(motion.animate).toHaveBeenCalledTimes(1);
  act(() => opening.installed());
  expect(motion.animate).toHaveBeenCalledTimes(2);
  expect(motion.animate.mock.calls[1]).toEqual([surface, { opacity: 0 }, { duration: 0.16 }]);
  stop();
});
test("reopening the same canvas ignores old ready pixels and playback until a new canonical presentation", async () => {
  const target = canvas();
  target.dataset.presentationReady = "true";
  target.dataset.canonicalPresentedAt = "10";
  let opening!: ReturnType<typeof beginProjectOpening>;
  act(() => {
    opening = beginProjectOpening();
    opening.installed();
  });
  target.dataset.renderedRevision = "99";
  await act(async () => {});
  expect(motion.animate).toHaveBeenCalledTimes(1);
  target.dataset.canonicalPresentedAt = "11";
  await act(async () => {});
  expect(motion.animate).toHaveBeenCalledTimes(2);
});
test("reduced motion has no artificial delay; cancellation and replacement release their surfaces", () => {
  const original = window.matchMedia;
  window.matchMedia = () =>
    Object.create(original(""), { matches: { value: true } }) as MediaQueryList;
  const cancel = vi.fn();
  act(() => {
    beginProjectOpening(cancel);
  });
  expect(motion.animate).not.toHaveBeenCalled();
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(cancel).toHaveBeenCalledOnce();
  expect(currentProjectOpening()).toBeUndefined();
  act(() => {
    beginProjectOpening();
    beginProjectOpening();
  });
  expect(document.querySelectorAll(".project-opening-surface")).toHaveLength(1);
  act(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
  expect(document.querySelector(".project-opening-surface")).toBeNull();
  window.matchMedia = original;
});
