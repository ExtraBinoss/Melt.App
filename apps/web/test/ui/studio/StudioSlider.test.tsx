import type { ComponentProps, PointerEvent, ReactNode } from "react";
import { act, fireEvent, render as renderBase, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Slider } from "../../../src/components/ui/slider";
import { StudioSlider } from "../../../src/ui/studio/controls/StudioSlider";

import { I18nextProvider } from "react-i18next";
import { TooltipProvider } from "../../../src/components/ui/tooltip";
import { i18n } from "../../../src/state/i18n";

function render(ui: ReactNode) {
  return renderBase(ui, {
    wrapper: ({ children }) => (
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>{children}</TooltipProvider>
      </I18nextProvider>
    ),
  });
}

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
function start(drag = false) {
  const root = screen.getByRole("slider").closest('[data-slot="slider"]')!;
  act(() =>
    callbacks().onPointerDownCapture?.({
      button: 0,
      currentTarget: root,
      pointerId: 1,
      clientX: 0,
      timeStamp: 1,
      shiftKey: false,
    } as PointerEvent<HTMLSpanElement>),
  );
  if (drag)
    act(() =>
      callbacks().onPointerMoveCapture?.({
        pointerId: 1,
        clientX: 8,
        timeStamp: 17,
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as PointerEvent<HTMLSpanElement>),
    );
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
  start(true);
  p.onPreview.mockClear();
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

test("double-click cancels the two click previews, resets once and retires its shimmer", () => {
  vi.useFakeTimers();
  const p = { ...props(), resetValue: 0.25 };
  const view = render(<StudioSlider {...p} />);
  try {
    for (const value of [0.8, 0.9]) {
      start();
      act(() => {
        callbacks().onValueChange?.([value]);
        callbacks().onValueCommit?.([value]);
      });
      expect(p.onCommit).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
    const root = screen.getByRole("slider").closest(".studio-slider")!;
    fireEvent.doubleClick(root);
    expect(p.onCancel).toHaveBeenCalledOnce();
    expect(p.onCommit).toHaveBeenCalledExactlyOnceWith(0.25);
    expect(root.querySelector("[data-resetting]")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(560);
    });
    expect(root.querySelector("[data-resetting]")).toBeNull();
    expect(p.onCommit).toHaveBeenCalledOnce();
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

test("pending single clicks commit on focus handoff, while replaced owners and disabled resets stay inert", () => {
  vi.useFakeTimers();
  const p = { ...props(), resetValue: 2 };
  const view = render(<StudioSlider {...p} />);
  try {
    start();
    act(() => {
      callbacks().onValueChange?.([0.8]);
      callbacks().onValueCommit?.([0.8]);
    });
    fireEvent.blur(screen.getByRole("slider"));
    expect(p.onCommit).toHaveBeenCalledExactlyOnceWith(0.8);
    p.onCommit.mockClear();
    start();
    act(() => {
      callbacks().onValueChange?.([0.7]);
      callbacks().onValueCommit?.([0.7]);
    });
    view.rerender(<StudioSlider {...p} identity={{}} disabled />);
    act(() => {
      vi.runAllTimers();
    });
    fireEvent.doubleClick(screen.getByRole("slider").closest(".studio-slider")!);
    expect(p.onCommit).not.toHaveBeenCalled();
    view.rerender(<StudioSlider {...p} identity={{}} />);
    fireEvent.doubleClick(screen.getByRole("slider").closest(".studio-slider")!);
    expect(p.onCommit).toHaveBeenCalledExactlyOnceWith(1);
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});
