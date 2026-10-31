import { TooltipProvider } from "../../../src/components/ui/tooltip";
import { useRef } from "react";
import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createPage, createProject, EditorEngine } from "@musart/core";
import { AddArtboardOverlay } from "../../../src/canvas/artboards/AddArtboardOverlay";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { createWorkspace } from "../../../src/canvas/artboards/workspace";
import { ViewMotion } from "../../../src/canvas/viewport/motion";
import { createPlaybackSource } from "../../../src/canvas/session/playback-source";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
function setup() {
  const engine = new EditorEngine(
      createProject({ pages: [createPage({ width: 200, height: 160 })] }),
    ),
    controller = new SceneController(engine, EMPTY_PREVIEW_SOURCE),
    workspace = createWorkspace(engine, controller);
  const view = new ViewMotion({
    clock: {
      now: () => performance.now(),
      request: requestAnimationFrame,
      cancel: cancelAnimationFrame,
    },
    constrain: (v) => v,
    reduced: () => true,
  });
  function Probe() {
    const viewport = useRef<HTMLDivElement>(null);
    return (
      <TooltipProvider>
        <div ref={viewport} data-testid="viewport">
          <AddArtboardOverlay
            engine={engine}
            controller={controller}
            viewport={viewport}
            workspace={workspace}
            viewSource={view}
          />
        </div>
      </TooltipProvider>
    );
  }
  const rendered = render(<Probe />),
    viewport = screen.getByTestId("viewport"),
    button = screen.getByTestId("canvas-add-artboard");
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 1000,
    height: 800,
  } as DOMRect);
  return { engine, controller, viewport, button, ...rendered };
}
it("reveals a canvas-level neighbor action only over empty space and prevents repeat/stale activation", async () => {
  const d = setup();
  expect(d.button).toHaveAttribute("data-visible", "false");
  fireEvent.pointerMove(d.viewport, {
    clientX: 620,
    clientY: 400,
    buttons: 0,
    pointerType: "mouse",
  });
  await waitFor(() => expect(d.button).toHaveAttribute("data-visible", "true"));
  expect(d.button).toHaveAttribute("data-side", "right");
  fireEvent.click(d.button);
  fireEvent.click(d.button);
  expect(d.engine.getSnapshot().project.pages).toHaveLength(2);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages).toHaveLength(1);
  fireEvent.pointerMove(d.viewport, {
    clientX: 500,
    clientY: 400,
    buttons: 0,
    pointerType: "mouse",
  });
  await waitFor(() => expect(d.button).toHaveAttribute("data-visible", "false"));
  fireEvent.pointerMove(d.viewport, {
    clientX: 620,
    clientY: 400,
    buttons: 0,
    pointerType: "mouse",
  });
  await waitFor(() => expect(d.button).toHaveAttribute("data-visible", "true"));
  act(() => d.engine.execute({ type: "renameProject", name: "Changed" }));
  fireEvent.click(d.button);
  expect(d.engine.getSnapshot().project.pages).toHaveLength(1);
  d.unmount();
});
it("suppresses the action during playback and releases native subscriptions", async () => {
  const d = setup();
  fireEvent.pointerMove(d.viewport, {
    clientX: 620,
    clientY: 400,
    buttons: 0,
    pointerType: "mouse",
  });
  await waitFor(() => expect(d.button).toHaveAttribute("data-visible", "true"));
  act(() =>
    createPlaybackSource(d.engine).set({
      page: d.engine.getSnapshot().project.pages[0]!,
      assets: {},
    }),
  );
  await waitFor(() => expect(d.button).toHaveAttribute("data-visible", "false"));
  fireEvent.click(d.button);
  expect(d.engine.getSnapshot().project.pages).toHaveLength(1);
  d.unmount();
  act(() => createPlaybackSource(d.engine).set(null));
});
