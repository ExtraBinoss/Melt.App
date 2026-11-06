import { Profiler } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createEffect } from "@musart/core";
import { EffectParameters } from "../../../../src/components/properties/effects/EffectParameters";
import { createPositionPresentation } from "../../../../src/components/properties/effects/sdk/position-presentation";
import { setup } from "../../../support/ui";
import { EffectPresetStore } from "../../../../src/services/effect-presets/store";

it("publishes scaled pairs atomically through Jotai and cleans up native field subscriptions", () => {
  const source = createPositionPresentation(createEffect("grain"));
  const x = source.field("domainX", 100),
    y = source.field("domainY", 100);
  const values: number[][] = [];
  const stop = x.subscribe(() => values.push([x.read(), y.read()]));
  source.publish(0.25, 0.75);
  source.publish(0.25, 0.75);
  expect(values).toEqual([[25, 75]]);
  stop();
  source.publish(0.5, 0.5);
  expect(values).toHaveLength(1);
  expect(x.read()).toBe(50);
});

it("paints X/Y during a pad drag without any React commit and restores both on cancellation", async () => {
  vi.spyOn(EffectPresetStore.prototype, "list").mockResolvedValue({ items: [], before: null });
  const d = setup(),
    effect = createEffect("grain", { id: "pad-grain" });
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { effects: [effect] } });
  const changed = vi.fn(),
    rendered = vi.fn();
  d.mount(
    <Profiler id="controls" onRender={rendered}>
      <EffectParameters
        engine={d.engine}
        layerId={d.rectangle.id}
        effect={effect}
        onChange={changed}
      />
    </Profiler>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Position et zone" }));
  const pad = screen.getByRole("button", { name: "Position", exact: true });
  vi.spyOn(pad, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
  } as DOMRect);
  Object.assign(pad, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: () => true,
  });
  const x = screen.getByRole("textbox", { name: "Position X", exact: true });
  const y = screen.getByRole("textbox", { name: "Position Y", exact: true });
  await act(async () => {});
  rendered.mockClear();
  fireEvent.pointerDown(pad, { button: 0, pointerId: 1, clientX: 40, clientY: 30 });
  fireEvent.pointerMove(pad, { pointerId: 1, clientX: 140, clientY: 80 });
  expect(x).toHaveValue("70");
  expect(y).toHaveValue("80");
  expect(rendered).not.toHaveBeenCalled();
  fireEvent.pointerCancel(pad, { pointerId: 1 });
  expect(x).toHaveValue("50");
  expect(y).toHaveValue("50");
  expect(rendered).not.toHaveBeenCalled();
  expect(changed.mock.calls.every(([, preview]) => preview === true)).toBe(true);
});
