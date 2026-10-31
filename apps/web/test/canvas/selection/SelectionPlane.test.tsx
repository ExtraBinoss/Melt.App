import { act } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SelectionPlane } from "../../../src/canvas/selection/SelectionPlane";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
import { setup } from "../../support/ui";

test("selection escapes the GPU stacking context, follows camera poses imperatively and releases listeners", () => {
  const d = setup(),
    controller = new SceneController(d.engine, EMPTY_PREVIEW_SOURCE),
    listeners = new Set<() => void>();
  let view = { x: 10, y: 20, zoom: 1 };
  const stop = vi.fn();
  const source = {
    read: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        stop();
      };
    },
  };
  const mount = d.mount(
    <div className="canvas-stage">
      <div data-testid="gpu-context">
        <SelectionPlane controller={controller} viewSource={source}>
          <button>Resize</button>
        </SelectionPlane>
      </div>
    </div>,
  );
  const plane = document.querySelector<HTMLElement>(".canvas-selection-plane")!;
  expect(plane.parentElement).toHaveClass("canvas-stage");
  expect(plane.closest('[data-testid="gpu-context"]')).toBeNull();
  expect(plane.style.transform).toBe("translate3d(10px, 20px, 0) scale(1)");
  view = { x: 30, y: 40, zoom: 2 };
  act(() => listeners.forEach((listener) => listener()));
  expect(plane.style.transform).toBe("translate3d(30px, 40px, 0) scale(2)");
  expect(plane.querySelector("button")).toHaveTextContent("Resize");
  mount.unmount();
  expect(listeners.size).toBe(0);
  expect(stop).toHaveBeenCalled();
});
