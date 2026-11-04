import type { ComponentProps, PointerEvent } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Slider } from "../../../src/components/ui/slider";
import { StudioSlider } from "../../../src/ui/studio/controls/StudioSlider";

const observed = vi.hoisted(() => ({ slider: vi.fn() }));
vi.mock("../../../src/components/ui/slider", async (original) => {
  const actual = await original<{ Slider: typeof Slider }>();
  return {
    ...actual,
    Slider: (props: ComponentProps<typeof Slider>) => {
      observed.slider(props);
      return <actual.Slider {...props} />;
    },
  };
});
function callbacks() {
  return observed.slider.mock.calls.at(-1)![0] as ComponentProps<typeof Slider>;
}
function start() {
  act(() => callbacks().onPointerDownCapture?.({ button: 0 } as PointerEvent<HTMLSpanElement>));
}
function props() {
  return {
    label: "Roughness",
    value: 0.5,
    min: 0,
    max: 1,
    step: 0.01,
    identity: {},
    onStart: vi.fn(),
    onPreview: vi.fn(),
    onCommit: vi.fn(),
    onCancel: vi.fn(),
  };
}

test("genuine Radix keyboard edits commit once and update only the slider leaf", () => {
  const p = props();
  let parentRenders = 0;
  function Parent() {
    parentRenders++;
    return <StudioSlider {...p} />;
  }
  render(<Parent />);
  const initial = parentRenders;
  const slider = screen.getByRole("slider", { name: "Roughness" });
  slider.focus();
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(p.onStart).toHaveBeenCalledOnce();
  expect(p.onPreview).toHaveBeenCalledWith(0.51);
  expect(p.onCommit).toHaveBeenCalledExactlyOnceWith(0.51);
  expect(parentRenders).toBe(initial);
});

test("many preview samples become one release commit; Escape rejects late release", () => {
  const p = props();
  render(<StudioSlider {...p} />);
  start();
  for (const value of [0.6, 0.7, 0.8]) act(() => callbacks().onValueChange?.([value]));
  expect(p.onCommit).not.toHaveBeenCalled();
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "0.8");
  act(() => callbacks().onValueCommit?.([0.8]));
  expect(p.onStart).toHaveBeenCalledOnce();
  expect(p.onCommit).toHaveBeenCalledExactlyOnceWith(0.8);
  start();
  act(() => callbacks().onValueChange?.([0.3]));
  fireEvent.keyDown(screen.getByRole("slider"), { key: "Escape" });
  act(() => callbacks().onValueCommit?.([0.3]));
  expect(p.onCancel).toHaveBeenCalledOnce();
  expect(p.onCommit).toHaveBeenCalledOnce();
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "0.5");
});

test("owner replacement, pointer cancellation and unmount retire their drafts", () => {
  const p = props();
  const view = render(<StudioSlider {...p} />);
  start();
  act(() => callbacks().onValueChange?.([0.8]));
  const stale = callbacks();
  view.rerender(<StudioSlider {...p} identity={{}} />);
  act(() => {
    stale.onValueChange?.([0.9]);
    stale.onValueCommit?.([0.9]);
  });
  expect(p.onCancel).toHaveBeenCalledOnce();
  expect(p.onCommit).not.toHaveBeenCalled();
  start();
  fireEvent.pointerCancel(screen.getByRole("slider"));
  act(() => callbacks().onValueCommit?.([0.8]));
  expect(p.onCancel).toHaveBeenCalledTimes(2);
  start();
  view.unmount();
  expect(p.onCancel).toHaveBeenCalledTimes(3);
});

test("secondary pointer presses never start a native slider gesture", () => {
  const p = props();
  render(<StudioSlider {...p} />);
  const preventDefault = vi.fn(),
    stopPropagation = vi.fn();
  act(() =>
    callbacks().onPointerDownCapture?.({
      button: 2,
      preventDefault,
      stopPropagation,
    } as unknown as PointerEvent<HTMLSpanElement>),
  );
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(stopPropagation).toHaveBeenCalledOnce();
  expect(p.onStart).not.toHaveBeenCalled();
});

test("time invalidation cancels a held gesture and rejects all later samples until a new press", () => {
  const p = props();
  let invalidate = () => {};
  const unsubscribe = vi.fn();
  const invalidation = {
    subscribe: (listener: () => void) => {
      invalidate = listener;
      return unsubscribe;
    },
  };
  const view = render(<StudioSlider {...p} invalidation={invalidation} />);
  start();
  act(() => callbacks().onValueChange?.([0.8]));
  act(invalidate);
  act(() => {
    callbacks().onValueChange?.([0.9]);
    callbacks().onValueCommit?.([0.9]);
  });
  expect(p.onCancel).toHaveBeenCalledOnce();
  expect(p.onPreview).toHaveBeenCalledExactlyOnceWith(0.8);
  expect(p.onCommit).not.toHaveBeenCalled();
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "0.5");
  view.unmount();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
