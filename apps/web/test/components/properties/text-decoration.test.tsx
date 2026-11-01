import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
} from "@musart/core";
import { TextDecorationControls } from "../../../src/components/properties/text/TextDecorationControls";
import { messages } from "../../../src/components/properties/text/messages";
import { setup } from "../../support/ui";

test("outline width previews, commits once and cancels through existing property actions", () => {
  const d = setup(),
    patch = vi.fn(),
    preview = vi.fn(),
    cancel = vi.fn();
  d.mount(
    <TextDecorationControls layer={d.text} patch={patch} preview={preview} cancel={cancel} />,
  );
  const width = screen.getByLabelText("Épaisseur du contour");
  fireEvent.change(width, { target: { value: "6" } });
  expect(preview).toHaveBeenLastCalledWith({ strokeWidth: 6 });
  expect(patch).not.toHaveBeenCalled();
  fireEvent.blur(width);
  expect(patch).toHaveBeenCalledExactlyOnceWith({ strokeWidth: 6 });
  fireEvent.change(width, { target: { value: "12" } });
  fireEvent.keyDown(width, { key: "Escape" });
  expect(cancel).toHaveBeenCalled();
});

test("hard shadow adds a genuine zero-blur effect and preserves unrelated treatments", () => {
  const d = setup(),
    patch = vi.fn();
  const blur = createEffect("blur");
  d.mount(
    <TextDecorationControls
      layer={{ ...d.text, effects: [blur] }}
      patch={patch}
      preview={vi.fn()}
      cancel={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("switch", { name: "Ombre nette" }));
  const next = patch.mock.calls[0]![0];
  expect(next.effects).toHaveLength(2);
  expect(next.effects[0]).toEqual(blur);
  expect(next.effects[1]).toMatchObject({
    type: "shadow",
    enabled: true,
    amount: 1,
    settings: { radius: 0, offsetX: 8, offsetY: 8, shadowColor: "#000000" },
  });
  expect(next.effects[1].id).toBeTruthy();
});

test("disabling a hard shadow preserves its durable identity and authored settings", () => {
  const d = setup(),
    patch = vi.fn();
  const shadow = createEffect("shadow", {
    settings: { radius: 0, offsetX: 14, offsetY: 18, shadowColor: "#ff0000" },
  });
  d.mount(
    <TextDecorationControls
      layer={{ ...d.text, effects: [shadow] }}
      patch={patch}
      preview={vi.fn()}
      cancel={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("switch", { name: "Ombre nette" }));
  expect(patch).toHaveBeenLastCalledWith({ effects: [{ ...shadow, enabled: false }] });
});

test("hard-shadow reset retains zero blur and its durable effect identity", () => {
  const d = setup(),
    patch = vi.fn(),
    shadow = createEffect("shadow", {
      amount: 0.4,
      settings: { radius: 0, offsetX: 30, offsetY: 40, shadowColor: "#ff0000" },
    });
  d.mount(
    <TextDecorationControls
      layer={{ ...d.text, effects: [shadow] }}
      patch={patch}
      preview={vi.fn()}
      cancel={vi.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Réinitialiser tous les paramètres de l’effet" }),
  );
  expect(patch).toHaveBeenCalledOnce();
  expect(patch.mock.calls[0]![0].effects[0]).toMatchObject({
    id: shadow.id,
    enabled: true,
    amount: 1,
    settings: { radius: 0, offsetX: 8, offsetY: 8, shadowColor: "#000000" },
  });
});

test("all twelve decoration locales have the same nonempty keys", () => {
  expect(Object.keys(messages)).toHaveLength(12);
  for (const resource of Object.values(messages)) {
    expect(Object.keys(resource).sort()).toEqual(Object.keys(messages.en).sort());
    expect(
      Object.values(resource).every(
        (value) => typeof value === "string" && value.trim().length > 0,
      ),
    ).toBe(true);
  }
});

test("2D decorations are hidden for directly extruded text", () => {
  const d = setup();
  d.mount(
    <TextDecorationControls
      layer={{ ...d.text, spatial: createSpatialLayer("extrude") }}
      patch={vi.fn()}
      preview={vi.fn()}
      cancel={vi.fn()}
    />,
  );
  expect(screen.queryByLabelText("Épaisseur du contour")).toBeNull();
  expect(screen.queryByRole("switch", { name: "Ombre nette" })).toBeNull();
});

test("2D decorations are hidden inside an inherited spatial context", () => {
  const d = setup(),
    group = createLayer("group", { spatialContext: true }),
    text = { ...d.text, parentId: group.id };
  d.engine.load(createProject({ pages: [createPage({ layers: [group, text] })] }));
  d.mount(
    <TextDecorationControls
      engine={d.engine}
      layer={text}
      patch={vi.fn()}
      preview={vi.fn()}
      cancel={vi.fn()}
    />,
  );
  expect(screen.queryByLabelText("Épaisseur du contour")).toBeNull();
});
