import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createLayer } from "@musart/core";
import { ViewportControls } from "../../../src/canvas/viewport/ViewportControls";
import { createViewportActions } from "../../../src/canvas/session/viewport-actions";
import { MotionTimelineDock } from "../../../src/components/motion-shell/MotionTimelineDock";
import { ProjectPreferencesProvider } from "../../../src/components/workspace/preferences/context";
import { useSetWorkspaceMode } from "../../../src/ui/studio/workspace-mode";
import { timelineOpenAtom } from "../../../src/state/motion/timeline-state";
import { setup } from "../../support/ui";

function StudioChoice() {
  const choose = useSetWorkspaceMode();
  return <button onClick={() => choose("studio")}>Use Studio</button>;
}

it("keeps Motion available in Static Studio and opens the existing timeline after counted initialization", () => {
  const d = setup({ reducedMotion: true });
  d.engine.execute({ type: "addLayers", layers: [createLayer("rectangle")] });
  const before = d.engine.getSnapshot();
  d.mount(
    <ProjectPreferencesProvider projectId={d.project.id} onError={vi.fn()}>
      <StudioChoice />
      <ViewportControls
        engine={d.engine}
        actions={createViewportActions(d.engine)}
        view={{ x: 0, y: 0, zoom: 1 }}
      />
      <MotionTimelineDock engine={d.engine} />
    </ProjectPreferencesProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Use Studio" }));
  const motion = screen.getByRole("button", { name: "Motion", exact: true });
  expect(motion).toHaveTextContent("Motion");
  expect(motion.querySelector("svg")).not.toBeNull();
  expect(motion).toHaveAttribute("aria-pressed", "false");
  expect(document.querySelector(".motion-timeline-dock")).toBeNull();
  fireEvent.click(motion);
  expect(screen.getByRole("alertdialog")).toHaveTextContent("4 éléments");
  fireEvent.click(screen.getByRole("button", { name: "Non, garder le mode statique" }));
  expect(d.engine.getSnapshot()).toBe(before);
  expect(d.store.get(timelineOpenAtom)).toBe(false);
  fireEvent.click(motion);
  fireEvent.click(screen.getByRole("button", { name: "Oui, activer Motion" }));
  const initialized = d.engine.getSnapshot().project;
  expect(initialized.pages[0]!.motion!.tracks).toHaveLength(4);
  expect(d.store.get(timelineOpenAtom)).toBe(true);
  expect(document.querySelectorAll(".motion-timeline-dock")).toHaveLength(1);
  expect(document.querySelector(".motion-timeline-dock")).toHaveAttribute(
    "data-motion-pinned",
    "true",
  );
  expect(screen.getByRole("slider", { name: "Se déplacer dans la timeline" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Motion", exact: true }));
  expect(d.store.get(timelineOpenAtom)).toBe(false);
  expect(d.engine.getSnapshot().project).toBe(initialized);
  fireEvent.click(screen.getByRole("button", { name: "Motion", exact: true }));
  expect(d.store.get(timelineOpenAtom)).toBe(true);
  expect(document.querySelectorAll(".motion-timeline-dock")).toHaveLength(1);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before.project);
  expect(screen.getByRole("button", { name: "Motion", exact: true })).toBeVisible();
  act(() => d.engine.redo());
  expect(d.engine.getSnapshot().project).toEqual(initialized);
});
