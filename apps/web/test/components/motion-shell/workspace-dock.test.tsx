import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MotionTimelineDock } from "../../../src/components/motion-shell/MotionTimelineDock";
import { ProjectPreferencesProvider } from "../../../src/components/workspace/preferences/context";
import { useSetWorkspaceMode } from "../../../src/ui/studio/workspace-mode";
import { setup } from "../../support/ui";

function WorkspaceChoices() {
  const choose = useSetWorkspaceMode();
  return (
    <>
      <button onClick={() => choose("studio")}>Studio workspace</button>
      <button onClick={() => choose("classic")}>Classic workspace</button>
    </>
  );
}

test("mobile Studio exposes one real dock while Classic keeps its mobile sheet owner", () => {
  const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    media: query,
    matches: true,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => true,
  }));
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const project = d.engine.getSnapshot().project;
  const view = d.mount(
    <ProjectPreferencesProvider
      projectId={project.id}
      onError={(error) => {
        throw error;
      }}
    >
      <WorkspaceChoices />
      <MotionTimelineDock engine={d.engine} />
    </ProjectPreferencesProvider>,
  );
  try {
    expect(document.querySelector(".motion-timeline-dock")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Studio workspace" }));
    expect(document.querySelectorAll(".motion-timeline-dock")).toHaveLength(1);
    expect(screen.getByRole("slider", { name: "Se déplacer dans la timeline" })).toBeEnabled();
    act(() => fireEvent.click(screen.getByRole("button", { name: "Classic workspace" })));
    expect(document.querySelector(".motion-timeline-dock")).toBeNull();
    expect(d.engine.getSnapshot().project).toBe(project);
  } finally {
    view.unmount();
    matchMedia.mockRestore();
  }
});
