import { act, fireEvent, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { Command } from "@musart/core";
import { setup } from "../../../support/ui";
import { makeTransport } from "../support";
import { TrackClips } from "../../../../src/components/motion/occurrences/TrackClips";
import {
  useTimelineSource,
  readTimelinePage,
} from "../../../../src/components/motion/rows/timeline-source";
import { createTimelineGestures } from "../../../../src/components/motion/gestures";

const replacements: { name: string; command?: Command }[] = [
  { name: "dimensions", command: { type: "updatePage", patch: { width: 900 } } },
  { name: "motion", command: { type: "setMotionDuration", duration: { value: 3, rate: 1 } } },
  { name: "load" },
];

test.each(replacements)(
  "retained clip bindings reject stale $name before selection or trim",
  ({ command }) => {
    const d = setup();
    d.engine.execute({ type: "setCompositionMode", mode: "motion" });
    const page = d.engine.getSnapshot().project.pages[0]!;
    const hook = renderHook(() => useTimelineSource(page));
    const source = hook.result.current;
    const runtime = makeTransport(page);
    const onError = vi.fn(),
      onSelect = vi.fn();
    const gestures = createTimelineGestures({
      engine: d.engine,
      compositionId: page.id,
      transport: runtime.transport,
      onSelection: vi.fn(),
      onError,
    });
    const begin = vi.spyOn(gestures, "beginTrack");
    const view = d.mount(
      <TrackClips
        source={source}
        engine={d.engine}
        layerId={d.rectangle.id}
        name="Hero"
        tracks={page.motion!.tracks.filter((track) => track.layerId === d.rectangle.id)}
        duration={2}
        scale={100}
        disabled={false}
        transport={runtime.transport}
        gestures={gestures}
        onSelect={onSelect}
        onError={onError}
      />,
    );
    act(() => {
      if (command) d.engine.execute(command);
      else d.engine.load(d.engine.getSnapshot().project);
    });
    const snapshot = d.engine.getSnapshot();
    expect(readTimelinePage(d.engine, source)).toBeUndefined();
    fireEvent.click(view.container.querySelector(".motion-track")!);
    fireEvent.pointerDown(view.container.querySelector(".motion-trim-handle")!, { button: 0 });
    expect(begin).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("changed");
    expect(d.engine.getSnapshot()).toBe(snapshot);
    view.unmount();
    hook.unmount();
    gestures.dispose();
  },
);

test("the retained source resolves the exact current page after an unrelated background edit", () => {
  const d = setup();
  const original = d.engine.getSnapshot().project.pages[0]!;
  const hook = renderHook((page) => useTimelineSource(page), { initialProps: original });
  const source = hook.result.current;
  act(() => d.engine.execute({ type: "updatePage", patch: { background: "#123456" } }));
  const canonical = d.engine.getSnapshot().project.pages[0]!;
  hook.rerender(canonical);
  expect(hook.result.current).toBe(source);
  expect(readTimelinePage(d.engine, source)).toBe(canonical);
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } }),
  );
  expect(readTimelinePage(d.engine, source)).toBeUndefined();
  hook.unmount();
});
