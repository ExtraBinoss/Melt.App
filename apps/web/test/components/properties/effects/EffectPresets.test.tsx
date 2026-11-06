import { expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { captureEffectTreatment, createEffect } from "@musart/core";
import { EffectParameters } from "../../../../src/components/properties/effects/EffectParameters";
import { EffectPresetStore } from "../../../../src/services/effect-presets/store";
import { setup } from "../../../support/ui";

test("preset header precedes owner controls and keeps stack saving inside its actions menu", async () => {
  const user = userEvent.setup(),
    d = setup(),
    effect = createEffect("grain");
  vi.spyOn(EffectPresetStore.prototype, "list").mockResolvedValue({ items: [], before: null });
  const view = d.mount(
    <EffectParameters
      engine={d.engine}
      effect={effect}
      stackEffects={[effect]}
      compositing={<div data-owner-controls>Opacity and compositing</div>}
      onChange={vi.fn()}
    />,
  );
  const controls = view.container.querySelector(".effect-controls")!;
  expect(controls.firstElementChild).toHaveAttribute("data-effect-presets", effect.id);
  expect(controls.children[1]).toHaveAttribute("data-owner-controls");
  expect(screen.getAllByRole("button", { name: "Enregistrer un préréglage" })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Enregistrer la pile d’effets" })).toBeNull();
  expect(controls.querySelectorAll("svg.lucide-plus")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Actions du préréglage" }));
  await user.click(await screen.findByRole("menuitem", { name: "Enregistrer la pile d’effets" }));
  expect(screen.getByRole("textbox", { name: "Nom du traitement" })).toBeVisible();
  const form = screen.getByRole("textbox", { name: "Nom du traitement" }).closest("form")!;
  expect(within(form).getByRole("button", { name: "Enregistrer" })).toHaveTextContent("");
  expect(within(form).getByRole("button", { name: "Annuler" })).toHaveTextContent("");
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Nom du traitement" }), { key: "Escape" });
  expect(screen.queryByRole("textbox", { name: "Nom du traitement" })).toBeNull();
});

test("modified status stays inside the selector and save/rename use icon confirmations", async () => {
  const user = userEvent.setup(),
    d = setup();
  const original = createEffect("grain", { amount: 0.25 });
  const treatment = captureEffectTreatment("saved", "Paper", [original], {}, "effect");
  const record = {
    id: treatment.id,
    name: treatment.name,
    kind: treatment.kind,
    types: ["grain"],
    revision: 1,
    updatedAt: 1,
    deleted: false,
    treatment,
  };
  vi.spyOn(EffectPresetStore.prototype, "list").mockResolvedValue({
    items: [record],
    before: null,
  });
  vi.spyOn(EffectPresetStore.prototype, "get").mockResolvedValue(record);
  const save = vi.spyOn(EffectPresetStore.prototype, "save").mockResolvedValue(record);
  const change = vi.fn();
  const effect = { ...original, amount: 0.7, preset: { id: "saved", name: "Paper" } };
  d.mount(<EffectParameters engine={d.engine} effect={effect} onChange={change} />);
  const selector = screen.getByRole("combobox", { name: "Préréglage enregistré" });
  await waitFor(() => expect(selector).toHaveTextContent("Paper · Modifié"));
  expect(selector.querySelector("svg.lucide-circle-dot")).not.toBeNull();
  expect(screen.getByText("Paper · Modifié").closest("button")).toBe(selector);
  expect(screen.queryByText("Modifié", { exact: true })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Actions du préréglage" }));
  await user.click(await screen.findByRole("menuitem", { name: "Renommer le préréglage" }));
  let input = screen.getByRole("textbox", { name: "Nom du préréglage" });
  const rename = input.closest("form")!;
  expect(
    within(rename).getByRole("button", { name: "Enregistrer" }).querySelector("svg.lucide-check"),
  ).not.toBeNull();
  expect(
    within(rename).getByRole("button", { name: "Annuler" }).querySelector("svg.lucide-x"),
  ).not.toBeNull();
  fireEvent.change(input, { target: { value: "Renamed" } });
  fireEvent.submit(rename);
  await waitFor(() => expect(save).toHaveBeenCalledWith({ ...treatment, name: "Renamed" }, 1));
  await waitFor(() => expect(input).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Enregistrer un préréglage" }));
  input = screen.getByRole("textbox", { name: "Nom du préréglage" });
  const form = input.closest("form")!;
  expect(within(form).getByRole("button", { name: "Enregistrer" })).toHaveTextContent("");
  expect(form.querySelector("small")).toBeNull();
  await user.click(within(form).getByRole("button", { name: "Annuler" }));
  expect(input).not.toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
});
