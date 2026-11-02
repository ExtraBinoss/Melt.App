import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { planMotionInitialization } from "@musart/core";
import { MotionField } from "../../../../src/components/properties/motion/MotionField";
import { animationPresentation } from "../../../../src/components/motion/animations/presentation";
import { MotionFieldProvider } from "../../../../src/components/properties/motion/context";
import { setup } from "../../../support/ui";
import { createMotionTransport } from "../../../../src/services/motion/transport";
test("captures the intended field before pointer/focus input but never treats a diamond as a value gesture", () => {
  const d = setup(),
    begin = vi.fn();
  d.engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(d.engine.getSnapshot()),
  });
  animationPresentation(d.engine).set({ details: true });
  const target = { kind: "layer" as const, layerId: d.rectangle.id, property: "x" as const };
  const view = d.mount(
    <MotionFieldProvider editor={{ begin }}>
      <MotionField engine={d.engine} target={target} label="X">
        <input aria-label="Value" />
      </MotionField>
    </MotionFieldProvider>,
  );
  fireEvent.focus(screen.getByLabelText("Value"));
  expect(begin).toHaveBeenCalledWith(target);
  begin.mockClear();
  fireEvent.pointerDown(screen.getByRole("button", { name: "Ajouter une image clé · X" }));
  expect(begin).not.toHaveBeenCalled();
  view.rerender(
    <MotionField label="Base">
      <input aria-label="Base value" />
    </MotionField>,
  );
  expect(screen.queryByRole("button")).toBeNull();
});

test("imperatively disables native and custom property targets in a gap and restores them inside a clip", () => {
  const d = setup(),
    begin = vi.fn();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const id = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.id;
  d.engine.execute({
    type: "duplicateMotionOccurrence",
    trackId: id,
    start: { value: 3, rate: 1 },
  });
  const target = { kind: "layer", layerId: d.rectangle.id, property: "x" } as const;
  let renders = 0;
  function Harness() {
    renders++;
    return (
      <MotionFieldProvider editor={{ begin }}>
        <MotionField engine={d.engine} target={target} label="X">
          <input aria-label="Occurrence value" />
        </MotionField>
      </MotionFieldProvider>
    );
  }
  d.mount(<Harness />);
  const field = screen.getByLabelText("Occurrence value"),
    before = renders;
  const transport = createMotionTransport(d.engine);
  act(() => transport.seek({ value: 5, rate: 2 }));
  expect(field).toBeDisabled();
  fireEvent.focus(field);
  expect(begin).not.toHaveBeenCalled();
  act(() => transport.seek({ value: 7, rate: 2 }));
  expect(field).not.toBeDisabled();
  expect(renders).toBe(before);
});

test("equivalent target rebinding avoids rewriting unchanged fieldset presentation", () => {
  const d = setup();
  const subscription = vi.spyOn(createMotionTransport(d.engine), "subscribe");
  const control = (disabled = false) => (
    <MotionField
      engine={d.engine}
      target={{ kind: "layer", layerId: d.rectangle.id, property: "x" }}
      label="X"
      disabled={disabled}
    >
      <input aria-label="Retained value" />
    </MotionField>
  );
  const view = d.mount(control()),
    input = screen.getByLabelText("Retained value"),
    field = input.closest("fieldset")!,
    disabledWrite = vi.spyOn(field, "disabled", "set"),
    titleWrite = vi.spyOn(field, "title", "set"),
    attributes = vi.spyOn(field, "setAttribute");
  input.focus();
  const subscriptions = subscription.mock.calls.length;
  view.rerender(control());
  expect(subscription).toHaveBeenCalledTimes(subscriptions);
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.text.id], patch: { x: 123 } }));
  expect(disabledWrite).not.toHaveBeenCalled();
  expect(titleWrite).not.toHaveBeenCalled();
  expect(attributes).not.toHaveBeenCalled();
  expect(input).toHaveFocus();
  view.rerender(control(true));
  expect(disabledWrite).toHaveBeenCalledExactlyOnceWith(true);
  expect(attributes).toHaveBeenCalledExactlyOnceWith("aria-disabled", "true");
  disabledWrite.mockClear();
  attributes.mockClear();
  view.rerender(control(true));
  expect(disabledWrite).not.toHaveBeenCalled();
  expect(titleWrite).not.toHaveBeenCalled();
  expect(attributes).not.toHaveBeenCalled();
});

test("an explicitly disabled field updates its inactive title only when occurrence presence changes", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const id = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.id;
  d.engine.execute({
    type: "duplicateMotionOccurrence",
    trackId: id,
    start: { value: 3, rate: 1 },
  });
  d.mount(
    <MotionField
      engine={d.engine}
      target={{ kind: "layer", layerId: d.rectangle.id, property: "x" }}
      label="X"
      disabled
    >
      <input aria-label="Blocked value" />
    </MotionField>,
  );
  const field = screen.getByLabelText("Blocked value").closest("fieldset")!,
    titleWrite = vi.spyOn(field, "title", "set"),
    attributes = vi.spyOn(field, "setAttribute"),
    transport = createMotionTransport(d.engine);
  expect(field.title).toBe("");
  act(() => transport.seek({ value: 5, rate: 2 }));
  expect(field.title).not.toBe("");
  expect(titleWrite).toHaveBeenCalledOnce();
  act(() => transport.seek({ value: 11, rate: 4 }));
  expect(titleWrite).toHaveBeenCalledOnce();
  act(() => transport.seek({ value: 7, rate: 2 }));
  expect(field.title).toBe("");
  expect(titleWrite).toHaveBeenCalledTimes(2);
  expect(attributes).not.toHaveBeenCalled();
});
