import { act, fireEvent, renderHook, screen } from "@testing-library/react";
import { Provider } from "jotai";
import { expect, test, vi } from "vitest";
import { ProjectPreferencesProvider } from "../../../src/components/workspace/preferences/context";
import { StudioGuides } from "../../../src/ui/studio/framing/StudioGuides";
import {
  DEFAULT_STUDIO_GUIDES,
  studioSafeInsets,
} from "../../../src/ui/studio/framing/guide-settings";
import { previewAtom } from "../../../src/state/session/editor";
import { WorkspaceTheme } from "../../../src/ui/brand/WorkspaceTheme";
import { useShortcuts } from "../../../src/state/session/shortcuts";
import { setup } from "../../support/ui";
import { choose } from "../../support/select";

test("formats use catalog safe areas or composition margins, with custom and none overrides", () => {
  const choice = { preset: "youtube-banner", width: 2560, height: 1440, full: false };
  expect(studioSafeInsets(choice, DEFAULT_STUDIO_GUIDES)).toEqual({
    top: 508.5 / 1440,
    right: 507 / 2560,
    bottom: 508.5 / 1440,
    left: 507 / 2560,
  });
  for (const preset of ["instagram-story", "instagram-reels", "tiktok-video", "custom"])
    expect(studioSafeInsets({ ...choice, preset }, DEFAULT_STUDIO_GUIDES)).toEqual({
      top: 0.1,
      right: 0.1,
      bottom: 0.1,
      left: 0.1,
    });
  expect(
    studioSafeInsets(choice, { ...DEFAULT_STUDIO_GUIDES, safeArea: "custom", margin: 17 }),
  ).toEqual({ top: 0.17, right: 0.17, bottom: 0.17, left: 0.17 });
  expect(studioSafeInsets(choice, { ...DEFAULT_STUDIO_GUIDES, safeArea: "none" })).toBeNull();
});

function fixture(visible = false) {
  const d = setup();
  const capture = {
    preset: "instagram-reels",
    width: 1080,
    height: 1920,
    full: false,
    visible,
  };
  const port = {
    read: vi.fn().mockResolvedValue({ studioCapture: capture }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  d.mount(
    <ProjectPreferencesProvider projectId={d.project.id} port={port} onError={vi.fn()}>
      <WorkspaceTheme value="studio">
        <StudioGuides engine={d.engine} />
      </WorkspaceTheme>
    </ProjectPreferencesProvider>,
  );
  return { ...d, port, capture };
}

test("a Studio capture label scrub previews until release, commits one undo entry and cancels a lost capture", async () => {
  const d = fixture(true);
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.click(screen.getByRole("button", { name: "Repères de capture" }));
  const handle = screen.getByRole("button", { name: "Ajuster Largeur" });
  const input = screen.getByRole("textbox", { name: "Largeur" });
  const before = d.engine.getSnapshot();
  const commits = vi.fn();
  const stop = d.engine.subscribeCommitInfo(commits);
  fireEvent.pointerDown(handle, { button: 0, clientX: 0, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 35, pointerId: 1 });
  const next = Number((input as HTMLInputElement).value);
  expect(Number.isInteger(next)).toBe(true);
  expect(next).toBeGreaterThan(1080);
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "page",
    patch: { captureGuides: { width: next } },
  });
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.pointerUp(handle, { clientX: 35, pointerId: 1 });
  fireEvent.lostPointerCapture(handle, { pointerId: 1 });
  const committed = d.engine.getSnapshot();
  expect(committed.revision).toBe(before.revision + 1);
  expect(committed.project.pages[0]!.captureGuides?.width).toBe(next);
  expect(d.store.get(previewAtom)).toBeNull();
  expect(commits).toHaveBeenCalledTimes(1);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before.project);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  expect(input).toHaveValue("1080");
  act(() => d.engine.redo());
  expect(d.engine.getSnapshot().project).toEqual(committed.project);
  fireEvent.pointerDown(handle, { button: 0, clientX: 0, pointerId: 2 });
  fireEvent.pointerMove(handle, { clientX: 70, pointerId: 2 });
  fireEvent.lostPointerCapture(handle, { pointerId: 2 });
  expect(d.engine.getSnapshot().project).toBe(committed.project);
  expect(input).toHaveValue(String(next));
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.port.update).not.toHaveBeenCalled();
  stop();
});

test("document history shortcuts work after scrubbing with focus retained inside the nonmodal capture popup", async () => {
  const d = fixture(true);
  const shortcuts = renderHook(() => useShortcuts(d.engine, d.services, d.onTask), {
    wrapper: ({ children }) => <Provider store={d.store}>{children}</Provider>,
  });
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.click(screen.getByRole("button", { name: "Repères de capture" }));
  const toggle = screen.getByRole("switch", { name: "Afficher les repères" });
  act(() => toggle.focus());
  const before = d.engine.getSnapshot().project;
  const handle = screen.getByRole("button", { name: "Ajuster Largeur" });
  fireEvent.pointerDown(handle, { button: 0, clientX: 0, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 35, pointerId: 1 });
  fireEvent.pointerUp(handle, { clientX: 35, pointerId: 1 });
  const committed = d.engine.getSnapshot().project;
  expect(committed).not.toBe(before);
  expect(toggle).toHaveFocus();
  fireEvent.keyDown(toggle, { key: "z", ctrlKey: true });
  expect(d.engine.getSnapshot().project).toEqual(before);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.keyDown(toggle, { key: "z", ctrlKey: true, shiftKey: true });
  expect(d.engine.getSnapshot().project).toEqual(committed);
  const input = screen.getByRole("textbox", { name: "Largeur" });
  act(() => input.focus());
  fireEvent.keyDown(input, { key: "z", ctrlKey: true });
  expect(d.engine.getSnapshot().project).toBe(committed);
  shortcuts.unmount();
});

test.each([
  { label: "Largeur", property: "width", initial: 1080, next: 1200, finish: "Enter" },
  { label: "Hauteur", property: "height", initial: 1920, next: 2048, finish: "blur" },
] as const)(
  "$label commits once on $finish from legacy capture preferences, with no history for cancellation or unchanged values",
  async ({ label, property, initial, next, finish }) => {
    const d = fixture(true);
    await act(async () => {
      await Promise.resolve();
    });
    const commits = vi.fn();
    const stop = d.engine.subscribeCommitInfo(commits);
    fireEvent.click(screen.getByRole("button", { name: "Repères de capture" }));
    let input = screen.getByRole("textbox", { name: label });
    const before = d.engine.getSnapshot();
    expect(before.canUndo).toBe(false);
    expect(before.project.pages[0]!.captureGuides).toBeUndefined();
    function complete() {
      if (finish === "Enter") fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.blur(input);
    }
    fireEvent.change(input, { target: { value: String(initial) } });
    complete();
    fireEvent.change(input, { target: { value: String(next) } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(input).toHaveValue(String(initial));
    expect(d.engine.getSnapshot()).toBe(before);
    expect(commits).not.toHaveBeenCalled();
    expect(d.store.get(previewAtom)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Repères de capture" }));
    input = screen.getByRole("textbox", { name: label });
    expect(input).toHaveValue(String(initial));
    fireEvent.change(input, { target: { value: String(next) } });
    expect(d.store.get(previewAtom)).toMatchObject({
      target: "page",
      patch: { captureGuides: { [property]: next } },
    });
    expect(d.engine.getSnapshot()).toBe(before);
    complete();
    const after = d.engine.getSnapshot();
    expect(after.canUndo).toBe(true);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.project.pages[0]!.captureGuides?.[property]).toBe(next);
    expect(d.store.get(previewAtom)).toBeNull();
    expect(commits).toHaveBeenCalledTimes(1);
    expect(commits.mock.calls[0]![0]).toMatchObject({ kind: "commit", types: ["updatePage"] });
    act(() => d.engine.undo());
    expect(d.engine.getSnapshot().project).toEqual(before.project);
    expect(d.engine.getSnapshot().canUndo).toBe(false);
    expect(input).toHaveValue(String(initial));
    act(() => d.engine.redo());
    expect(d.engine.getSnapshot().project).toEqual(after.project);
    expect(input).toHaveValue(String(next));
    expect(d.port.update).not.toHaveBeenCalled();
    stop();
  },
);

test("the compact framing popover hides settings until enabled and numeric commits Undo/Redo through the engine", async () => {
  const d = fixture();
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.queryByRole("switch", { name: "Afficher les repères" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Repères de capture" }));
  expect(screen.queryByRole("textbox", { name: "Largeur" })).toBeNull();
  fireEvent.click(screen.getByRole("switch", { name: "Afficher les repères" }));
  const original = d.engine.getSnapshot().project;
  const input = screen.getByRole("textbox", { name: "Largeur" });
  fireEvent.change(input, { target: { value: "720" } });
  expect(d.engine.getSnapshot().project).toBe(original);
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "page",
    patch: { captureGuides: { width: 720 } },
  });
  fireEvent.blur(input);
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project.pages[0]!.captureGuides?.width).toBe(720);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(original);
  expect(screen.getByRole("textbox", { name: "Largeur" })).toHaveValue("1080");
  act(() => d.engine.redo());
  expect(screen.getByRole("textbox", { name: "Largeur" })).toHaveValue("720");
  const committed = d.engine.getSnapshot().project;
  const resumed = screen.getByRole("textbox", { name: "Largeur" });
  fireEvent.change(resumed, { target: { value: "500" } });
  fireEvent.keyDown(resumed, { key: "Escape" });
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project).toBe(committed);
  expect(resumed).toHaveValue("720");
  expect(d.engine.getSnapshot().project.pages[0]!.width).toBe(1080);
  expect(d.port.update).not.toHaveBeenCalled();
});

test("color swatches preview imperatively, dismissal restores the latest committed color, and one choice has one undo entry", async () => {
  const d = fixture();
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.click(screen.getByRole("button", { name: "Repères de capture" }));
  fireEvent.click(screen.getByRole("switch", { name: "Afficher les repères" }));
  await choose("Couleur des repères", "Magenta");
  const committed = d.engine.getSnapshot().project;
  expect(committed.pages[0]!.captureGuides?.color).toBe("magenta");
  expect(d.store.get(previewAtom)).toBeNull();
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Couleur des repères" }), {
    key: "ArrowDown",
  });
  const option = screen.getByRole("option", { name: "Citron vert" });
  expect(option.querySelector(".studio-guide-color-option")?.firstElementChild?.tagName).toBe("I");
  fireEvent.pointerMove(option);
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "page",
    patch: { captureGuides: { color: "lime" } },
  });
  expect(d.engine.getSnapshot().project).toBe(committed);
  fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project).toBe(committed);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.captureGuides?.color).toBe("cyan");
  act(() => d.engine.redo());
  expect(d.engine.getSnapshot().project.pages[0]!.captureGuides?.color).toBe("magenta");
});
