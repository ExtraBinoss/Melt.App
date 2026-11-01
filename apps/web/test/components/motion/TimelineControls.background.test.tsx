import { useCallback, useSyncExternalStore, type ComponentProps } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { CurrentTime } from "../../../src/components/motion/CurrentTime";
import { TimelineControls } from "../../../src/components/motion/TimelineControls";
import { setup } from "../../support/ui";
import { makeTransport } from "./support";

const observed = vi.hoisted(() => ({ clock: vi.fn() }));
vi.mock("../../../src/components/motion/CurrentTime", async (original) => {
  const actual = await original<{ CurrentTime: typeof CurrentTime }>();
  return {
    ...actual,
    CurrentTime: (props: ComponentProps<typeof CurrentTime>) => {
      observed.clock();
      return <actual.CurrentTime {...props} />;
    },
  };
});

it("retains the header across background edits and binds fresh duration gestures while rejecting interrupted drafts", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.load(d.engine.getSnapshot().project);
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  function Live() {
    const snapshot = useSyncExternalStore(d.engine.subscribe, d.engine.getSnapshot);
    const onUnit = useCallback(() => {}, []);
    return (
      <TimelineControls
        engine={d.engine}
        snapshot={snapshot}
        transport={runtime.transport}
        unit="ms"
        onUnit={onUnit}
      />
    );
  }
  d.mount(<Live />);
  const field = screen.getByRole("spinbutton", { name: "Durée de composition" });
  observed.clock.mockClear();
  act(() => d.engine.execute({ type: "updatePage", patch: { background: "#123456" } }));
  act(() => d.engine.undo());
  act(() => d.engine.redo());
  expect(observed.clock).not.toHaveBeenCalled();
  expect(screen.getByRole("spinbutton", { name: "Durée de composition" })).toBe(field);
  act(() => field.focus());
  fireEvent.change(field, { target: { value: "4000" } });
  fireEvent.blur(field);
  expect(d.engine.getSnapshot().project.pages[0]!.motion!.duration).toEqual({ value: 4, rate: 1 });
  act(() => d.engine.undo());
  expect(field).toHaveValue(2000);
  expect(d.engine.getSnapshot().project.pages[0]!.background).toBe("#123456");
  act(() => d.engine.redo());
  expect(field).toHaveValue(4000);

  act(() => field.focus());
  fireEvent.change(field, { target: { value: "6000" } });
  observed.clock.mockClear();
  act(() => d.engine.execute({ type: "updatePage", patch: { background: "#654321" } }));
  expect(observed.clock).not.toHaveBeenCalled();
  const canonical = d.engine.getSnapshot();
  fireEvent.blur(field);
  expect(d.engine.getSnapshot()).toBe(canonical);
  expect(field).toHaveValue(4000);
  expect(screen.getByRole("alert")).toHaveTextContent("composition a changé");
});
