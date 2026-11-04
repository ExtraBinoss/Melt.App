import { expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ProjectPreferencesProvider } from "../../../src/components/workspace/preferences/context";
import {
  useWorkspaceMode,
  useSetWorkspaceMode,
  workspaceModeFromSearch,
} from "../../../src/ui/studio/workspace-mode";
import type { ProjectLayoutPreferences } from "../../../src/services/projects/preferences/model";

function Probe() {
  const mode = useWorkspaceMode();
  const setMode = useSetWorkspaceMode();
  return (
    <>
      <output data-testid="mode">{mode}</output>
      <button onClick={() => setMode("studio")}>Studio</button>
      <button onClick={() => setMode("classic")}>Classic</button>
    </>
  );
}

test("ordinary and legacy projects default to Classic without a document or storage write", () => {
  render(<Probe />);
  expect(screen.getByTestId("mode")).toHaveTextContent("classic");
});

test("late preference hydration cannot replace a user choice and unrelated consumers stay idle", async () => {
  let resolve!: (values: ProjectLayoutPreferences) => void;
  const read = new Promise<ProjectLayoutPreferences>((done) => {
    resolve = done;
  });
  const port = { read: vi.fn(() => read), update: vi.fn().mockResolvedValue(undefined) };
  const owner = vi.fn(),
    sibling = vi.fn(),
    error = vi.fn();
  function Unrelated() {
    sibling();
    return <aside>Canvas owner</aside>;
  }
  function Owner() {
    owner();
    return (
      <ProjectPreferencesProvider projectId="first" port={port} onError={error}>
        <Probe />
        <Unrelated />
      </ProjectPreferencesProvider>
    );
  }
  render(<Owner />);
  const before = { owner: owner.mock.calls.length, sibling: sibling.mock.calls.length };
  fireEvent.click(screen.getByRole("button", { name: "Studio" }));
  await act(async () => {
    resolve({ workspaceMode: "classic" });
    await read;
  });
  expect(screen.getByTestId("mode")).toHaveTextContent("studio");
  expect(port.update).toHaveBeenCalledExactlyOnceWith("first", { workspaceMode: "studio" });
  expect(owner).toHaveBeenCalledTimes(before.owner);
  expect(sibling).toHaveBeenCalledTimes(before.sibling);
  expect(error).not.toHaveBeenCalled();
});

test("query overrides are presentation-only, survive hydration and yield to a user choice", async () => {
  const original = window.location.href;
  window.history.replaceState(null, "", "?automation=1&workspace=studio");
  const port = {
    read: vi.fn().mockResolvedValue({ workspaceMode: "classic" }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  try {
    render(
      <ProjectPreferencesProvider projectId="preview" port={port} onError={vi.fn()}>
        <Probe />
      </ProjectPreferencesProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("mode")).toHaveTextContent("studio");
    expect(port.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Classic" }));
    expect(screen.getByTestId("mode")).toHaveTextContent("classic");
    await act(async () => {
      await Promise.resolve();
    });
    expect(port.update).toHaveBeenCalledExactlyOnceWith("preview", { workspaceMode: "classic" });
  } finally {
    window.history.replaceState(null, "", original);
  }
  expect(workspaceModeFromSearch("?workspace=invalid")).toBeNull();
  expect(workspaceModeFromSearch("?workspace=classic")).toBe("classic");
});

test("saved mode restoration is isolated from replacement project preferences", async () => {
  let resolveOld!: (values: ProjectLayoutPreferences) => void;
  const old = new Promise<ProjectLayoutPreferences>((done) => {
    resolveOld = done;
  });
  const port = {
    read: vi.fn((id: string) =>
      id === "old" ? old : Promise.resolve({ workspaceMode: "classic" as const }),
    ),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const onError = vi.fn();
  const view = render(
    <ProjectPreferencesProvider projectId="old" port={port} onError={onError}>
      <Probe />
    </ProjectPreferencesProvider>,
  );
  view.rerender(
    <ProjectPreferencesProvider projectId="new" port={port} onError={onError}>
      <Probe />
    </ProjectPreferencesProvider>,
  );
  await act(async () => {
    resolveOld({ workspaceMode: "studio" });
    await old;
  });
  expect(screen.getByTestId("mode")).toHaveTextContent("classic");
  fireEvent.click(screen.getByRole("button", { name: "Studio" }));
  await act(async () => {
    await Promise.resolve();
  });
  expect(port.update).toHaveBeenCalledExactlyOnceWith("new", { workspaceMode: "studio" });
});
