import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ProjectPreferencesProvider } from "../../../src/components/workspace/preferences/context";
import { StudioGuides } from "../../../src/ui/studio/framing/StudioGuides";
import {
  DEFAULT_STUDIO_GUIDES,
  studioSafeInsets,
} from "../../../src/ui/studio/framing/guide-settings";
import { previewAtom } from "../../../src/state/session/editor";
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

function fixture() {
  const d = setup();
  const capture = {
    preset: "instagram-reels",
    width: 1080,
    height: 1920,
    full: false,
    visible: false,
  };
  const port = {
    read: vi.fn().mockResolvedValue({ studioCapture: capture }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  d.mount(
    <ProjectPreferencesProvider projectId={d.project.id} port={port} onError={vi.fn()}>
      <StudioGuides engine={d.engine} />
    </ProjectPreferencesProvider>,
  );
  return { ...d, port, capture };
}

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
