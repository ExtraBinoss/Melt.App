import { act, fireEvent, screen } from "@testing-library/react";
import { createLayer } from "@musart/core";
import { expect, it, vi } from "vitest";
import { Profiler } from "react";
import { setup } from "../../support/ui";
import { arrangeArtboards } from "../../../src/canvas/artboards/layout";
import { ArtboardModeFooter } from "../../../src/canvas/artboards/ArtboardModeFooter";

it("selection changes retain the artboard mode controls", () => {
  const fixture = setup(),
    commits = vi.fn();
  fixture.mount(
    <Profiler id="mode" onRender={commits}>
      <ArtboardModeFooter
        engine={fixture.engine}
        workspace={arrangeArtboards(fixture.engine.getSnapshot().project.pages)}
        view={{ x: 0, y: 0, zoom: 1 }}
      />
    </Profiler>,
  );
  commits.mockClear();
  act(() => fixture.engine.select([fixture.text.id]));
  expect(commits).not.toHaveBeenCalled();
  act(() => fixture.engine.execute({ type: "setCompositionMode", mode: "motion" }));
  expect(commits).toHaveBeenCalled();
});

it("artwork history skips mode controls and activation plans the latest edited layers", () => {
  const d = setup(),
    commits = vi.fn();
  d.mount(
    <Profiler id="mode" onRender={commits}>
      <ArtboardModeFooter
        engine={d.engine}
        workspace={arrangeArtboards(d.engine.getSnapshot().project.pages)}
        view={{ x: 0, y: 0, zoom: 1 }}
      />
    </Profiler>,
  );
  const motion = screen.getByRole("radio", { name: "Motion" });
  commits.mockClear();
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { x: 123 } }));
  act(() => d.engine.undo());
  act(() => d.engine.redo());
  act(() => d.engine.execute({ type: "addLayers", layers: [createLayer("rectangle")] }));
  expect(commits).not.toHaveBeenCalled();
  expect(screen.getByRole("radio", { name: "Motion" })).toBe(motion);
  fireEvent.click(motion);
  expect(screen.getByRole("alertdialog")).toHaveTextContent("4 éléments");
  act(() => d.engine.execute({ type: "renameProject", name: "Later revision" }));
  const before = d.engine.getSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "Oui, activer Motion" }));
  expect(d.engine.getSnapshot()).toBe(before);
  expect(screen.getByRole("alert")).toHaveTextContent("La composition a changé");
  fireEvent.click(motion);
  fireEvent.click(screen.getByRole("button", { name: "Oui, activer Motion" }));
  expect(d.engine.getSnapshot().project.pages[0]!.motion?.tracks).toHaveLength(4);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(123);
});

it("keeps compact mode icons at overview zoom and edits the active composition", () => {
  const fixture = setup();
  fixture.engine.execute({ type: "addLayers", layers: [createLayer("rectangle")] });
  const workspace = arrangeArtboards(fixture.engine.getSnapshot().project.pages);
  const view = fixture.mount(
    <ArtboardModeFooter
      engine={fixture.engine}
      workspace={workspace}
      view={{ x: 0, y: 0, zoom: 0.15 }}
    />,
  );
  expect(view.container.querySelector(".artboard-mode-footer")).toHaveAttribute(
    "data-compact",
    "true",
  );
  expect(screen.getByRole("radio", { name: "Statique" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "Motion" })).toBeVisible();
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  fireEvent.click(screen.getByRole("button", { name: "Oui, activer Motion" }));
  expect(fixture.engine.getSnapshot().project.pages[0]!.motion?.mode).toBe("motion");
  fireEvent.click(screen.getByRole("radio", { name: "Statique" }));
  expect(fixture.engine.getSnapshot().project.pages[0]!.motion?.tracks).toHaveLength(4);
  view.unmount();
});
