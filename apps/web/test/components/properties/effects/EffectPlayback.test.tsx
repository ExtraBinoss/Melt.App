import { useSyncExternalStore } from "react";
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
  function Live() {
    const snapshot = useSyncExternalStore(
      d.engine.subscribe,
      d.engine.getSnapshot,
      d.engine.getSnapshot,
    );
    return (
      <EffectPlayback
        engine={d.engine}
        effect={
          snapshot.project.pages[0]!.layers.find((layer) => layer.id === d.rectangle.id)!
            .effects[0]!
        }
        disabled={false}
        onChange={change}
        onCancel={cancel}
      />
    );
  }
  const result = d.mount(<Live />);
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

it("keeps direct choices checked and transfers them atomically to an editable timeline block", () => {
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
    expect(screen.getByRole("button", { name: label }).querySelector("svg")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Boucle" }));
  expect(screen.getByRole("button", { name: "Boucle" })).toHaveAttribute("aria-pressed", "true");
  expect(d.store.get(timelineOpenAtom)).toBe(false);
  expect(
    d.page().motion!.tracks.find((item) => item.layerId === d.rectangle.id)?.animations ?? [],
  ).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer les gestes" }));
  expect(d.store.get(timelineOpenAtom)).toBe(true);
  expect(screen.getByRole("button", { name: "Boucle" })).toHaveAttribute("aria-pressed", "false");
  expect(createMotionTransport(d.engine).read().playing).toBe(true);
  const track = d.page().motion!.tracks.find((item) => item.layerId === d.rectangle.id)!;
  const animation = track.animations![0]!;
  expect(animation.preset.channels[0]!.driver?.kind).toBe("loop");
  expect(animation.effectIds).toEqual([d.effect.id]);
  expect(animation.ownsEffects).toBe(false);
  act(() => d.engine.execute({ type: "deleteMotionAnimation", animationId: animation.id }));
  expect(d.page().layers.find((item) => item.id === d.rectangle.id)!.effects).toHaveLength(1);
  act(() => d.engine.undo());
  expect(
    d.page().motion!.tracks.find((item) => item.layerId === d.rectangle.id)!.animations,
  ).toHaveLength(1);
  act(() => d.engine.undo());
  expect(
    d.page().layers.find((layer) => layer.id === d.rectangle.id)!.effects[0]!.motion?.automatic,
  ).toBeDefined();
  act(() => d.engine.undo());
  expect(d.page().motion).toBeUndefined();
});

it("records semantic keyboard input, saves one block, and cancels unfinished takes", () => {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  const canceled = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const d = fixture();
  fireEvent.click(screen.getByRole("button", { name: "Horizontal" }));
  expect(effectInputSession(d.engine).read()?.owner?.layerId).toBe(d.rectangle.id);
  expect(screen.getByRole("button", { name: "Horizontal" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer les gestes" }));
  now = 100;
  fireEvent.keyDown(screen.getByRole("application"), { key: "ArrowRight" });
  now = 200;
  fireEvent.keyUp(screen.getByRole("application"), { key: "ArrowRight" });
  now = 300;
  fireEvent.click(screen.getByRole("button", { name: "Terminer" }));
  const animation = d.page().motion!.tracks.find((item) => item.layerId === d.rectangle.id)!
    .animations![0]!;
  const driver = animation.preset.channels[0]!.driver!;
  expect("events" in driver && driver.events.length).toBeGreaterThan(0);
  expect(effectInputSession(d.engine).read()).toBeNull();
  expect(canceled).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Horizontal" }));
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(effectInputSession(d.engine).read()).toBeNull();
  expect(
    d.page().motion!.tracks.find((item) => item.layerId === d.rectangle.id)!.animations,
  ).toHaveLength(1);
  act(() => freezeEffectPreviews(d.engine));
  d.result.unmount();
});

it("applies automatic settings without overwriting the selected interactive behavior", () => {
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  const d = fixture();
  fireEvent.click(screen.getByRole("button", { name: "Boucle" }));
  fireEvent.click(screen.getByRole("button", { name: "Horizontal" }));
  const read = () =>
    d.page().layers.find((layer) => layer.id === d.rectangle.id)!.effects[0]!.motion!;
  const interactive = structuredClone(read().interactive);
  fireEvent.click(screen.getByRole("button", { name: "Réglages" }));
  fireEvent.click(screen.getByRole("button", { name: "Automatique" }));
  const period = screen.getByRole("textbox", { name: "Période" });
  fireEvent.change(period, { target: { value: "1" } });
  fireEvent.keyDown(period, { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
  expect(read().interactive).toEqual(interactive);
  expect(read().automatic!.channels[0]!.driver).toMatchObject({
    kind: "loop",
    period: { value: 1000, rate: 1000 },
  });
});
