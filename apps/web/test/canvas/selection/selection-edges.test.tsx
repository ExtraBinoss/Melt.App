import { act, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CanvasSelection } from "../../../src/canvas/selection/CanvasSelection";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
import { setup } from "../../support/ui";
it("routes every border to the shared resize owner, tracks zoom imperatively and hides locked targets", () => {
  const d = setup(),
    controller = new SceneController(d.engine, EMPTY_PREVIEW_SOURCE),
    onHandle = vi.fn();
  const listeners = new Set<() => void>();
  let zoom = 1;
  const viewSource = {
    read: () => ({ x: 0, y: 0, zoom }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  d.mount(
    <CanvasSelection
      engine={d.engine}
      controller={controller}
      viewSource={viewSource}
      viewport={{ current: null }}
      showHandles
      onHandle={onHandle}
    />,
  );
  act(() => d.engine.select([d.rectangle.id]));
  const root = document.querySelector<HTMLElement>(".canvas-selection-overlays")!;
  const edges = [...root.querySelectorAll<HTMLButtonElement>(".canvas-resize-edge")];
  expect(edges).toHaveLength(4);
  for (const edge of edges) {
    expect(edge).toHaveAttribute("data-layer-id", d.rectangle.id);
    expect(edge.tabIndex).toBe(-1);
    fireEvent.pointerDown(edge, { button: 0 });
  }
  expect(onHandle).toHaveBeenCalledTimes(4);
  expect(root.style.getPropertyValue("--canvas-edge-hit")).toBe("8px");
  act(() => {
    zoom = 0.5;
    for (const listener of listeners) listener();
  });
  expect(root.style.getPropertyValue("--canvas-edge-hit")).toBe("16px");
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } }),
  );
  expect(document.querySelector(".canvas-resize-edge")).toBeNull();
});
