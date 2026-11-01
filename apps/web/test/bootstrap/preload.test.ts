import { expect, test, vi } from "vitest";
import { preloadEditor } from "../../src/bootstrap/preload";
vi.mock("../../src/App", () => ({ App: () => null }));
vi.mock("../../src/canvas/EditorCanvas", () => ({ EditorCanvas: () => null }));
vi.mock("../../src/components/toolbar/Toolbar", () => ({ Toolbar: () => null }));
vi.mock("../../src/components/workspace/EditorSidebar", () => ({ EditorSidebar: () => null }));
vi.mock("../../src/components/motion-shell/MotionTimelineDock", () => ({
  MotionTimelineDock: () => null,
}));

test("editor intent shares one code preparation promise without mounting its components", async () => {
  const first = preloadEditor();
  expect(preloadEditor()).toBe(first);
  await first;
  expect(preloadEditor()).toBe(first);
  expect(document.querySelector(".musart-app")).toBeNull();
});
