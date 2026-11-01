import { animationPresentation } from "../../../../src/components/motion/animations/presentation";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { createEffect, planMotionInitialization } from "@musart/core";
import { MotionDiamond } from "../../../../src/components/properties/motion/MotionDiamond";
import { createMotionTransport } from "../../../../src/services/motion/transport";
import { setup as baseSetup } from "../../../support/ui";
import userEvent from "@testing-library/user-event";
test("static and simple animation views omit the hidden keyframe control tree", () => {
  const d = baseSetup();
  const view = d.mount(
    <MotionDiamond
      engine={d.engine}
      target={{ kind: "layer", layerId: d.rectangle.id, property: "x" }}
      label="X"
    />,
  );
  expect(view.container.querySelector("[data-motion-diamond]")).toBeNull();
  expect(view.container.querySelector(".motion-property-diamond-slot")).toHaveAttribute("hidden");
  act(() => d.engine.execute({ type: "setCompositionMode", mode: "motion" }));
  expect(view.container.querySelector("[data-motion-diamond]")).toBeNull();
  act(() => animationPresentation(d.engine).set({ details: true }));
  expect(screen.getByRole("button", { name: "Ajouter une image clé · X" })).toBeVisible();
  act(() => animationPresentation(d.engine).set({ details: false }));
  expect(view.container.querySelector("[data-motion-diamond]")).toBeNull();
  act(() => d.engine.execute({ type: "setCompositionMode", mode: "static" }));
  act(() => animationPresentation(d.engine).set({ details: true }));
  expect(view.container.querySelector("[data-motion-diamond]")).toBeNull();
  act(() => d.engine.execute({ type: "setCompositionMode", mode: "motion" }));
  fireEvent.click(screen.getByRole("button", { name: "Ajouter une image clé · X" }));
  expect(screen.getByRole("button", { name: "Modifier l’image clé · X" })).toHaveAttribute(
    "data-current",
    "true",
  );
});

test("adds the first real key and imperatively reflects playhead, mode and lock changes", () => {
  const d = setup();
  d.engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(d.engine.getSnapshot()),
  });
  let renders = 0;
  function Harness() {
    renders++;
    return (
      <MotionDiamond
        engine={d.engine}
        target={{ kind: "layer", layerId: d.rectangle.id, property: "x" }}
        label="X"
      />
    );
  }
  d.mount(<Harness />);
  const button = screen.getByRole("button", { name: "Ajouter une image clé · X" });
  fireEvent.click(button);
  expect(button).toHaveAttribute("data-current", "true");
  expect(
    d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes[0]!.value,
  ).toBe(20);
  const before = renders;
  act(() => createMotionTransport(d.engine).seek({ value: 1, rate: 1 }));
  expect(button).toHaveAttribute("data-current", "false");
  expect(button).toHaveAttribute("data-animated", "true");
  expect(renders).toBe(before);
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } }),
  );
  expect(button).toBeDisabled();
  act(() => d.engine.execute({ type: "setCompositionMode", mode: "static" }));
  expect(button).not.toBeVisible();
});
test("advertises preset macros in the shared tooltip instead of a native title", async () => {
  const d = setup(),
    effect = createEffect("gradient");
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { effects: [effect] } });
  d.engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(d.engine.getSnapshot()),
  });
  d.mount(
    <MotionDiamond
      engine={d.engine}
      target={{
        kind: "effectSetting",
        layerId: d.rectangle.id,
        effectId: effect.id,
        property: "preset",
      }}
      label="Preset"
    />,
  );
  const button = screen.getByRole("button", { name: "Ajouter une image clé · Preset" });
  expect(button).toBeDisabled();
  expect(button).not.toHaveAttribute("title");
  await userEvent.setup().hover(button.parentElement!);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("plusieurs paramètres");
});

test("uses sorted key lookup and avoids identical attribute mutations during continuous non-key seeks", async () => {
  const d = setup(),
    target = { kind: "layer", layerId: d.rectangle.id, property: "x" } as const;
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.transaction(
    Array.from({ length: 500 }, (_, index) => ({
      type: "upsertMotionKeyframe",
      target,
      time: { value: index, rate: 250 },
      value: index,
    })),
  );
  const view = d.mount(<MotionDiamond engine={d.engine} target={target} label="X" />);
  const node = screen.getByRole("button", { name: "Modifier l’image clé · X" });
  const transport = createMotionTransport(d.engine),
    records: MutationRecord[] = [];
  const observer = new MutationObserver((changes) => {
    records.push(...changes);
  });
  observer.observe(node, { attributes: true });
  act(() => transport.seek({ value: 2001, rate: 10000 }));
  await Promise.resolve();
  records.length = 0;
  act(() => {
    for (let index = 1; index <= 60; index++)
      transport.seek({ value: 2001 + index * 10, rate: 10000 });
  });
  await Promise.resolve();
  expect(records).toHaveLength(0);
  expect(node).toHaveAttribute("data-current", "false");
  act(() => transport.seek({ value: 1, rate: 2 }));
  expect(node).toHaveAttribute("data-current", "true");
  act(() => transport.seek({ value: 499, rate: 250 }));
  expect(node).toHaveAttribute("data-current", "true");
  act(() => transport.seek({ value: 0, rate: 1 }));
  expect(node).toHaveAttribute("data-current", "true");
  observer.disconnect();
  view.unmount();
});

test("switches occurrence arming at clip boundaries and disables the diamond in a gap without React renders", async () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const id = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.id;
  d.engine.execute({
    type: "duplicateMotionOccurrence",
    trackId: id,
    start: { value: 3, rate: 1 },
  });
  const target = { kind: "layer", layerId: d.rectangle.id, property: "x" } as const;
  d.engine.execute({
    type: "upsertMotionKeyframe",
    trackId: id,
    target,
    time: { value: 0, rate: 1 },
    value: 10,
  });
  let renders = 0;
  function Harness() {
    renders++;
    return <MotionDiamond engine={d.engine} target={target} label="X" />;
  }
  d.mount(<Harness />);
  const node = screen.getByRole("button");
  const before = renders;
  const transport = createMotionTransport(d.engine);
  act(() => transport.seek({ value: 7, rate: 2 }));
  expect(node).toHaveAttribute("data-animated", "false");
  act(() => transport.seek({ value: 5, rate: 2 }));
  expect(node).toBeDisabled();
  expect(node).not.toHaveAttribute("title");
  await userEvent.setup().hover(node.parentElement!);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("dans un clip");
  expect(renders).toBe(before);
});

/** These regressions exercise the explicitly selected detailed keyframe view. */
function setup() {
  const result = baseSetup();
  animationPresentation(result.engine).set({ details: true });
  return result;
}
