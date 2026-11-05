import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createEffect } from "@musart/core";
import { setup } from "../../../support/ui";
import { EffectPlayback } from "../../../../src/components/properties/effects/EffectPlayback";
import { effectInputSession } from "../../../../src/components/properties/effects/effect-motion/input-session";
import { timelineOpenAtom } from "../../../../src/state/motion/timeline-state";
import { createMotionTransport } from "../../../../src/services/motion/transport";
import { freezeEffectPreviews } from "../../../../src/state/session/effect-preview";

afterEach(() => vi.restoreAllMocks());
function fixture() {
  const d = setup(),
    effect = createEffect("ripple");
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { effects: [effect] } });
  const cancel = vi.fn(),
    change = vi.fn();
  const result = d.mount(
    <EffectPlayback
      engine={d.engine}
      effect={effect}
      disabled={false}
      onChange={change}
      onCancel={cancel}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Motion" }));
  return {
    ...d,
    effect,
    result,
    cancel,
    change,
    page: () => d.engine.getSnapshot().project.pages[0]!,
  };
}

it("adds a real Motion block atomically and preserves the bound user effect on delete", () => {
  const d = fixture();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  for (const label of [
    "Boucle",
    "Aller-retour",
    "Pulsation",
    "Horizontal",
    "Vertical",
    "Libre",
    "Glisser",
    "Clic",
  ])
    expect(
      screen.getByRole("button", { name: label, exact: true }).querySelector("svg"),
    ).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Boucle", exact: true }));
  expect(d.store.get(timelineOpenAtom)).toBe(true);
  expect(createMotionTransport(d.engine).read().playing).toBe(true);
  const track = d.page().motion!.tracks.find((item) => item.layerId === d.rectangle.id)!;
  const animation = track.animations![0]!;
  expect(animation.preset.channels[0]!.driver?.kind).toBe("loop");
  expect(animation.effectIds).toEqual([d.effect.id]);
  expect(animation.ownsEffects).toBe(false);
  d.engine.execute({ type: "deleteMotionAnimation", animationId: animation.id });
  expect(d.page().layers.find((item) => item.id === d.rectangle.id)!.effects).toHaveLength(1);
  d.engine.undo();
  expect(
    d.page().motion!.tracks.find((item) => item.layerId === d.rectangle.id)!.animations,
  ).toHaveLength(1);
  d.engine.undo();
  expect(d.page().motion).toBeUndefined();
});

it("records semantic keyboard input, saves one block, and cancels unfinished takes", () => {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  const canceled = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const d = fixture();
  fireEvent.click(screen.getByRole("button", { name: "Horizontal", exact: true }));
  expect(effectInputSession(d.engine).read()?.owner?.layerId).toBe(d.rectangle.id);
  now = 100;
  fireEvent.keyDown(screen.getByRole("application"), { key: "ArrowRight" });
  now = 200;
  fireEvent.keyUp(screen.getByRole("application"), { key: "ArrowRight" });
  now = 300;
  fireEvent.click(screen.getByRole("button", { name: "Terminer", exact: true }));
  const animation = d.page().motion!.tracks.find((item) => item.layerId === d.rectangle.id)!
    .animations![0]!;
  const driver = animation.preset.channels[0]!.driver!;
  expect("events" in driver && driver.events.length).toBeGreaterThan(0);
  expect(effectInputSession(d.engine).read()).toBeNull();
  expect(canceled).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Horizontal", exact: true }));
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(effectInputSession(d.engine).read()).toBeNull();
  expect(
    d.page().motion!.tracks.find((item) => item.layerId === d.rectangle.id)!.animations,
  ).toHaveLength(1);
  act(() => freezeEffectPreviews(d.engine));
  d.result.unmount();
});
