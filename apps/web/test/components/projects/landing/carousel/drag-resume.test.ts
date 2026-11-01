import { expect, test, vi } from "vitest";
import { fixture } from "./controller-fixture";

test("native anchor and image dragging is prevented without blocking a normal link click", () => {
  const f = fixture({ reducedMotion: true, links: true });
  const anchor = f.cards[0]!;
  const image = document.createElement("img");
  anchor.append(image);
  for (const target of [anchor, image]) {
    const event = new Event("dragstart", { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }
  f.pointer("pointerdown", 100, 0);
  f.pointer("pointerup", 100, 10);
  const click = new MouseEvent("click", { detail: 1, bubbles: true, cancelable: true });
  const activate = vi.fn((event: Event) => {
    expect(event.defaultPrevented).toBe(false);
    event.preventDefault();
  });
  anchor.addEventListener("click", activate);
  anchor.dispatchEvent(click);
  expect(activate).toHaveBeenCalledOnce();
  expect(anchor).toHaveAttribute("href", "/dashboard?preview=template&item=card-0");
});

test("a real drag blocks its primary click while modified, middle and keyboard links stay native", () => {
  const f = fixture({ reducedMotion: true, links: true });
  const activate = vi.fn((event: Event) => {
    expect(event.defaultPrevented).toBe(false);
    event.preventDefault();
  });
  f.cards[0]!.addEventListener("click", activate);
  f.pointer("pointerdown", 300, 0);
  f.pointer("pointermove", 200, 20);
  f.pointer("pointerup", 200, 200);
  for (const init of [{ ctrlKey: true }, { metaKey: true }, { button: 1 }, { detail: 0 }]) {
    const click = new MouseEvent("click", {
      detail: 1,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    f.cards[0]!.dispatchEvent(click);
  }
  expect(activate).toHaveBeenCalledTimes(4);
  const dragClick = new MouseEvent("click", { detail: 1, bubbles: true, cancelable: true });
  f.cards[0]!.dispatchEvent(dragClick);
  expect(dragClick.defaultPrevented).toBe(true);
  expect(activate).toHaveBeenCalledTimes(4);
});

test("modified primary presses and middle presses never claim a carousel gesture", () => {
  const f = fixture({ reducedMotion: true });
  for (const init of [{ ctrlKey: true }, { metaKey: true }, { button: 1 }]) {
    const down = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(down, { pointerId: 7, button: 0, clientX: 300, clientY: 100, ...init });
    f.cards[0]!.dispatchEvent(down);
    expect(f.pointer("pointermove", 100, 20).defaultPrevented).toBe(false);
    f.pointer("pointerup", 100, 40);
  }
  expect(f.api.position()).toBe(0);
  expect(f.node.setPointerCapture).not.toHaveBeenCalled();
});

test("drag movement and release outside the carousel finish the active gesture", () => {
  const f = fixture({ reducedMotion: true, autoScroll: true });
  f.pointer("pointerdown", 300, 0);
  for (const [type, x] of [
    ["pointermove", 200],
    ["pointerup", 180],
  ] as const) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 7, button: 0, clientX: x, clientY: 100 });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }
  expect(f.api.position()).toBe(120);
  expect(f.captured.size).toBe(0);
  expect(f.node).not.toHaveAttribute("data-dragging");
  expect(f.node).not.toHaveAttribute("data-carousel-moving");
});

test("hover leave resumes after delayed pointer focus even when the browser keeps focus-visible", () => {
  const f = fixture({ autoScroll: true });
  vi.spyOn(f.cards[0]!, "matches").mockReturnValue(true);
  f.node.dispatchEvent(new Event("pointerenter"));
  f.pointer("pointerdown", 200, 10);
  f.pointer("pointerup", 200, 20);
  f.cards[0]!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  f.node.dispatchEvent(new Event("pointerleave"));
  f.elapse(1200);
  expect(f.node).toHaveAttribute("data-carousel-auto");
  f.node.dispatchEvent(new Event("pointerenter"));
  expect(f.frames.size).toBe(0);
  f.node.dispatchEvent(new Event("pointerleave"));
  f.elapse(1200);
  expect(f.frames.size).toBe(1);
});

test("keyboard use after pointer focus pauses across hover leave until focus leaves the rail", () => {
  const f = fixture({ autoScroll: true });
  vi.spyOn(f.cards[0]!, "matches").mockReturnValue(true);
  f.pointer("pointerdown", 200, 10);
  f.pointer("pointerup", 200, 20);
  f.cards[0]!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  f.cards[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  f.cards[0]!.dispatchEvent(
    new FocusEvent("focusout", { bubbles: true, relatedTarget: f.cards[1]! }),
  );
  vi.spyOn(f.cards[1]!, "matches").mockReturnValue(true);
  f.cards[1]!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  f.node.dispatchEvent(new Event("pointerleave"));
  f.elapse(5000);
  expect(f.frames.size).toBe(0);
  f.cards[1]!.dispatchEvent(
    new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }),
  );
  f.elapse(1200);
  expect(f.node).toHaveAttribute("data-carousel-auto");
});

test("offscreen and hidden transitions cancel inertia, settling and delayed resume work", () => {
  const f = fixture({ autoScroll: true });
  f.pointer("pointerdown", 400, 0);
  f.pointer("pointermove", 200, 16);
  f.pointer("pointerup", 200, 20);
  expect(f.frames.size).toBe(1);
  f.intersect(false);
  expect(f.frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(f.node).not.toHaveAttribute("data-carousel-moving");
  f.intersect(true);
  f.wheel(100);
  expect(vi.getTimerCount()).toBe(1);
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(f.frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  f.elapse(5000);
  expect(f.frames.size).toBe(0);
});

test("offscreen cancellation also applies when automatic drift is disabled", () => {
  const f = fixture();
  f.pointer("pointerdown", 400, 0);
  f.pointer("pointermove", 200, 16);
  f.pointer("pointerup", 200, 20);
  expect(f.frames.size).toBe(1);
  f.intersect(false);
  expect(f.frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(f.node).not.toHaveAttribute("data-carousel-moving");
});
