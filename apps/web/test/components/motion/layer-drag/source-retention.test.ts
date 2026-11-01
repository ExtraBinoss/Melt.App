import { act, renderHook } from "@testing-library/react";
import type { DragEvent } from "react";
import { expect, test, vi } from "vitest";
import { setup } from "../../../support/ui";
import { makeTransport } from "../support";
import { createTimelineGestures } from "../../../../src/components/motion/gestures";
import { useTimelineLayerDrag } from "../../../../src/components/motion/layer-drag/use-timeline-layer-drag";

test("keeps projected rows and native bindings across metadata edits while starting against canonical ownership", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = d.engine.getSnapshot().project.pages[0]!;
  const { transport } = makeTransport(page);
  const gestures = createTimelineGestures({
    engine: d.engine,
    transport,
    compositionId: page.id,
    onSelection: vi.fn(),
    onError: vi.fn(),
  });
  const options = {
    engine: d.engine,
    page,
    collapsed: new Set<string>(),
    transport,
    gestures,
    active: true,
    onError: vi.fn(),
  };
  const hook = renderHook((props) => useTimelineLayerDrag(props), { initialProps: options });
  const before = hook.result.current;
  act(() => d.engine.execute({ type: "updatePage", patch: { background: "#123456" } }));
  const canonical = d.engine.getSnapshot().project.pages[0]!;
  hook.rerender({ ...options, page: canonical });
  expect(hook.result.current).toBe(before);
  expect(hook.result.current.rows).toBe(before.rows);
  expect(hook.result.current.page).toBe(canonical);
  const event = {
    currentTarget: document.createElement("div"),
    clientX: 50,
    clientY: 10,
    altKey: false,
    preventDefault: vi.fn(),
    nativeEvent: new Event("dragstart"),
    dataTransfer: { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: "", dropEffect: "" },
  } as unknown as DragEvent<HTMLElement>;
  act(() => before.native.start(event, canonical.layers[0]!));
  expect(hook.result.current.moving).toBe(true);
  act(() => hook.result.current.native.cancelOwned());
  const stalePrevent = vi.fn();
  act(() => before.native.start({ ...event, preventDefault: stalePrevent }, page.layers[0]!, page));
  expect(stalePrevent).toHaveBeenCalledOnce();
  expect(hook.result.current.moving).toBe(false);
  act(() => d.engine.load(d.engine.getSnapshot().project));
  const replacedPrevent = vi.fn();
  act(() => before.native.start({ ...event, preventDefault: replacedPrevent }, page.layers[0]!));
  expect(replacedPrevent).toHaveBeenCalledOnce();
  hook.unmount();
  gestures.dispose();
});
