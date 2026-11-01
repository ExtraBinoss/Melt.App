import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { createLayer, createPage, type EnginePort } from "@musart/core";
import type { SceneController } from "../../../src/canvas/session/scene-controller";
import { useVideoBackend } from "../../../src/canvas/render/use-video-backend";

test("selects the canonical video's backend before its first visible pose and ignores playback-only updates", () => {
  const video = createLayer("video", { assetId: "video" });
  let page = createPage({ layers: [video] });
  const emptyPose = createPage({ layers: [] });
  const listeners = new Set<() => void>();
  const controller = {
    read: () => ({ page: emptyPose }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as SceneController;
  const engine = {
    getSnapshot: () => ({ pageId: page.id, project: { pages: [page] } }),
  } as unknown as EnginePort;
  let renders = 0;
  const hook = renderHook(() => {
    renders++;
    return useVideoBackend(controller, engine);
  });
  expect(hook.result.current).toBe(true);
  const initial = renders;
  act(() => {
    for (let index = 0; index < 60; index++) for (const listener of listeners) listener();
  });
  expect(renders).toBe(initial);
  act(() => {
    page = createPage({ layers: [] });
    for (const listener of listeners) listener();
  });
  expect(hook.result.current).toBe(false);
  expect(renders).toBe(initial + 1);
  hook.unmount();
  expect(listeners.size).toBe(0);
});
