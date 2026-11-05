import { expect, test, vi } from "vitest";
import { act, screen, fireEvent, waitFor } from "@testing-library/react";
import { Preferences } from "../../../../src/components/projects/preferences/Preferences";
import { accentAtom } from "../../../../src/state/session/accent";
import { themeAtom } from "../../../../src/state/session/editor";
import { keepCreationToolAtom } from "../../../../src/state/tools/preferences";
import { choose } from "../../../support/select";
import { setup } from "../../../support/ui";
import {
  snappingPreferences,
  SNAPPING_STORAGE_KEY,
} from "../../../../src/state/snapping/preferences";
import {
  clipboardPreferences,
  CLIPBOARD_STORAGE_KEY,
} from "../../../../src/state/clipboard/preferences";
test("General stores the image portability choice without editing the document", () => {
  const d = setup();
  act(() => {
    clipboardPreferences.update(true);
  });
  const before = d.engine.getSnapshot();
  const view = d.mount(<Preferences />);
  const images = screen.getByRole("switch", { name: "Inclure les images à la copie" });
  expect(images).toBeChecked();
  fireEvent.click(images);
  expect(images).not.toBeChecked();
  expect(JSON.parse(localStorage.getItem(CLIPBOARD_STORAGE_KEY)!)).toEqual({
    version: 1,
    includeImages: false,
  });
  view.unmount();
  d.mount(<Preferences />);
  expect(screen.getByRole("switch", { name: "Inclure les images à la copie" })).not.toBeChecked();
  expect(d.engine.getSnapshot()).toBe(before);
  act(() => {
    clipboardPreferences.update(true);
  });
});
test("applies persistent themes and changes between both real catalogs", async () => {
  const d = setup();
  d.mount(<Preferences />);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Apparence" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(screen.getByRole("radiogroup", { name: "Thème" })).toHaveClass("segmented-tabs");
  fireEvent.click(screen.getByRole("radio", { name: "Sombre" }));
  expect(screen.getByRole("radio", { name: "Sombre" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Clair" })).not.toBeChecked();
  expect(d.store.get(themeAtom)).toBe("dark");
  expect(document.documentElement).toHaveClass("dark");
  fireEvent.click(screen.getByRole("radio", { name: "Clair" }));
  fireEvent.click(screen.getByRole("radio", { name: "Système" }));
  expect(screen.getByRole("radio", { name: "Système" })).toBeChecked();
  expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Général" }), { button: 0, ctrlKey: false });
  await choose("Langue", "English");
  await waitFor(() => expect(document.documentElement.lang).toBe("en"));
  await choose("Language", "Français");
});
test("editor settings use the persisted snapping store without editing a document", () => {
  const d = setup();
  act(() => {
    snappingPreferences.reset();
  });
  const before = d.engine.getSnapshot();
  const view = d.mount(
    <Preferences initialSection="editor" editorPreview={<span>Real playground slot</span>} />,
  );
  const enabled = screen.getByRole("switch", { name: "Accrocher aux éléments" }),
    threshold = screen.getByRole("textbox", { name: "Distance d’accrochage" });
  const update = vi.spyOn(snappingPreferences, "update");
  expect(enabled).toBeChecked();
  expect(screen.getByText("Real playground slot")).toBeVisible();
  fireEvent.change(threshold, { target: { value: "9.5" } });
  fireEvent.keyDown(threshold, { key: "Enter" });
  fireEvent.blur(threshold);
  expect(update).toHaveBeenCalledExactlyOnceWith({ threshold: 9.5 });
  expect(snappingPreferences.read().threshold).toBe(9.5);
  expect(JSON.parse(localStorage.getItem(SNAPPING_STORAGE_KEY)!)).toMatchObject({
    version: 1,
    threshold: 9.5,
  });
  fireEvent.click(enabled);
  expect(enabled).not.toBeChecked();
  expect(threshold).toBeDisabled();
  expect(d.engine.getSnapshot()).toBe(before);
  view.unmount();
  snappingPreferences.reset();
});

test("canvas zoom UI is opt-in and persists without changing the document", () => {
  const d = setup(),
    before = d.engine.getSnapshot();
  d.mount(<Preferences initialSection="editor" />);
  const control = screen.getByRole("switch", { name: "Afficher les contrôles de zoom du canvas" });
  expect(control).not.toBeChecked();
  fireEvent.click(control);
  expect(control).toBeChecked();
  expect(localStorage.getItem("musart.canvas-zoom-controls.v1")).toBe("true");
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.click(control);
});

test("keeping creation tools active is opt-in and persists without changing the document", () => {
  const d = setup(),
    before = d.engine.getSnapshot();
  d.store.set(keepCreationToolAtom, false);
  const view = d.mount(<Preferences initialSection="editor" />);
  const control = screen.getByRole("switch", { name: "Garder l’outil de création actif" });
  expect(control).not.toBeChecked();
  fireEvent.click(control);
  expect(control).toBeChecked();
  expect(d.store.get(keepCreationToolAtom)).toBe(true);
  expect(localStorage.getItem("musart.keep-creation-tool.v1")).toBe("true");
  expect(d.engine.getSnapshot()).toBe(before);
  view.unmount();
  d.mount(<Preferences initialSection="editor" />);
  const restored = screen.getByRole("switch", { name: "Garder l’outil de création actif" });
  expect(restored).toBeChecked();
  fireEvent.click(restored);
  expect(d.store.get(keepCreationToolAtom)).toBe(false);
});

test("full enclosure is opt-in, persisted locally, and illustrated beside touching selection", () => {
  const d = setup(),
    before = d.engine.getSnapshot();
  d.mount(<Preferences initialSection="editor" />);
  const control = screen.getByRole("switch", { name: "Englober entièrement les calques" });
  expect(control).not.toBeChecked();
  expect(screen.getByRole("group", { name: "Exemples de rectangle de sélection" })).toBeVisible();
  expect(screen.getByText("Toucher suffit").closest("figure")).toHaveAttribute(
    "data-active",
    "true",
  );
  fireEvent.click(control);
  expect(control).toBeChecked();
  expect(localStorage.getItem("musart.marquee-contain.v1")).toBe("true");
  expect(screen.getByText("Entièrement à l’intérieur").closest("figure")).toHaveAttribute(
    "data-active",
    "true",
  );
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.click(control);
});

test("accent selection previews both themes and persists without editing the document", async () => {
  const d = setup(),
    before = d.engine.getSnapshot();
  d.mount(<Preferences initialSection="appearance" />);
  await choose("Couleur d’accent", "Vert");
  expect(d.store.get(accentAtom)).toBe("green");
  expect(localStorage.getItem("musart.accent.v1")).toBe("green");
  expect(document.querySelector("[data-accent-preview]")).toHaveAttribute(
    "data-accent-preview",
    "green",
  );
  expect(screen.getByRole("group", { name: "Aperçu de la couleur d’accent" })).toBeVisible();
  expect(d.engine.getSnapshot()).toBe(before);
});

test("failed accent persistence is reported while the interface still applies the choice", async () => {
  const d = setup();
  d.mount(<Preferences initialSection="appearance" />);
  const save = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("Storage denied");
  });
  try {
    await choose("Couleur d’accent", "Bleu");
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible d’enregistrer la préférence");
    expect(d.store.get(accentAtom)).toBe("blue");
  } finally {
    save.mockRestore();
  }
});
