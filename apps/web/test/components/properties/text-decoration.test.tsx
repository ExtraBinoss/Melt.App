import { useState, type ComponentProps } from "react";
import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
} from "@musart/core";
import { TextDecorationControls } from "../../../src/components/properties/text/TextDecorationControls";
import type { EffectParameters } from "../../../src/components/properties/effects/EffectParameters";
import { useEngine } from "../../../src/state/session/editor";
import { messages } from "../../../src/components/properties/text/messages";
import { setup } from "../../support/ui";

const renders = vi.hoisted(() => ({ parameters: vi.fn() }));
vi.mock("../../../src/components/properties/effects/EffectParameters", async (original) => {
  const module = await original<{ EffectParameters: typeof EffectParameters }>();
  return {
    ...module,
    EffectParameters: (props: ComponentProps<typeof EffectParameters>) => {
      renders.parameters();
      return <module.EffectParameters {...props} />;
    },
  };
});

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

test("hard-shadow controls mount on first use and retain their DOM and values through repeated toggles", () => {
  const d = setup(),
    shadow = createEffect("shadow", {
      enabled: false,
      settings: { radius: 0, offsetX: 14, offsetY: 18, shadowColor: "#ff0000" },
    });
  function Stateful() {
    const [layer, setLayer] = useState({ ...d.text, effects: [shadow] });
    return (
      <TextDecorationControls
        layer={layer}
        patch={(patch) => setLayer((current) => ({ ...current, ...patch }))}
        preview={vi.fn()}
        cancel={vi.fn()}
      />
    );
  }
  const view = d.mount(<Stateful />);
  expect(view.container.querySelector(".text-hard-shadow-parameters")).toBeNull();
  const toggle = screen.getByRole("switch", { name: "Ombre nette" });
  fireEvent.click(toggle);
  const parameters = view.container.querySelector<HTMLElement>(".text-hard-shadow-parameters")!;
  const input = parameters.querySelector<HTMLInputElement>("input")!;
  expect(input).not.toBeNull();
  const value = input.value;
  for (let i = 0; i < 4; i++) {
    fireEvent.click(toggle);
    expect(parameters).not.toBeVisible();
    expect(parameters.querySelector("input")).toBe(input);
    fireEvent.click(toggle);
    expect(parameters).toBeVisible();
    expect(parameters.querySelector("input")).toBe(input);
    expect(input.value).toBe(value);
  }
});

test("live shadow toggles retain the parameter tree while canonical changes cancel drafts and refresh callbacks", () => {
  const d = setup(),
    cancel = vi.fn(),
    shadow = createEffect("shadow", {
      amount: 0.4,
      settings: { radius: 0, offsetX: 14, offsetY: 18, shadowColor: "#ff0000" },
    });
  d.engine.execute({ type: "updateLayers", ids: [d.text.id], patch: { effects: [shadow] } });
  function Stateful() {
    const snapshot = useEngine(d.engine);
    const layer = snapshot.project.pages[0]!.layers.find((item) => item.id === d.text.id)!;
    return (
      <TextDecorationControls
        engine={d.engine}
        layer={layer}
        patch={(patch) => d.engine.execute({ type: "updateLayers", ids: [layer.id], patch })}
        preview={vi.fn()}
        cancel={cancel}
      />
    );
  }
  const view = d.mount(<Stateful />),
    toggle = screen.getByRole("switch", { name: "Ombre nette" }),
    parameters = view.container.querySelector<HTMLElement>(".text-hard-shadow-parameters")!,
    amount = parameters.querySelector<HTMLInputElement>("input")!,
    baseline = renders.parameters.mock.calls.length;
  expect(amount).toHaveValue("40");
  fireEvent.change(amount, { target: { value: "70" } });
  fireEvent.click(toggle);
  expect(cancel).toHaveBeenCalled();
  expect(amount).toHaveValue("40");
  fireEvent.click(toggle);
  for (let index = 0; index < 6; index++) fireEvent.click(toggle);
  expect(parameters).toBeVisible();
  expect(parameters.querySelector("input")).toBe(amount);
  expect(renders.parameters).toHaveBeenCalledTimes(baseline);

  const changedShadow = { ...shadow, amount: 0.25 };
  act(() =>
    d.engine.execute({
      type: "updateLayers",
      ids: [d.text.id],
      patch: { effects: [changedShadow] },
    }),
  );
  expect(amount).toHaveValue("25");
  expect(renders.parameters.mock.calls.length).toBeGreaterThan(baseline);
  const beforeUnrelatedEffect = renders.parameters.mock.calls.length,
    blur = createEffect("blur");
  act(() =>
    d.engine.execute({
      type: "updateLayers",
      ids: [d.text.id],
      patch: { effects: [changedShadow, blur] },
    }),
  );
  expect(renders.parameters).toHaveBeenCalledTimes(beforeUnrelatedEffect);
  fireEvent.click(
    screen.getByRole("button", { name: "Réinitialiser tous les paramètres de l’effet" }),
  );
  const effects = d.engine
    .getSnapshot()
    .project.pages[0]!.layers.find((item) => item.id === d.text.id)!.effects;
  expect(effects[0]).toMatchObject({
    id: shadow.id,
    enabled: true,
    amount: 1,
    settings: { radius: 0, offsetX: 8, offsetY: 8, shadowColor: "#000000" },
  });
  expect(effects[1]).toEqual(blur);
});
