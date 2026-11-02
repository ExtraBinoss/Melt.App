import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { createElement, useLayoutEffect, type ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { useInspectorPresentation } from "../../../src/components/workspace/use-inspector-presentation";
import { usePopoverOwner } from "../../../src/components/layers/attachments/use-popover-owner";

afterEach(() => vi.unstubAllGlobals());

function frames() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.set(++id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  return {
    callbacks,
    paint() {
      const current = [...callbacks.values()];
      callbacks.clear();
      act(() => current.forEach((callback) => callback(performance.now())));
    },
  };
}

function fixture(deferChanges = false) {
  const clock = frames(),
    store = createStore(),
    commits: unknown[] = [];
  const initial = { target: "a", revision: 0 };
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store }, children);
  const view = renderHook(
    ({ value }) => {
      const shown = useInspectorPresentation(
        value,
        (a, b) => a.target === b.target,
        deferChanges ? (a, b) => a.revision !== b.revision : undefined,
      );
      const attachment = usePopoverOwner("effect");
      useLayoutEffect(() => {
        commits.push(shown);
      });
      return { shown, attachment };
    },
    { initialProps: { value: initial }, wrapper },
  );
  return { clock, commits, initial, ...view };
}

test("new owners leave a presentation opportunity for the outline, then publish once", () => {
  const view = fixture(),
    next = { target: "b", revision: 1 };
  view.rerender({ value: next });
  expect(view.result.current.shown).toBe(view.initial);
  view.clock.paint();
  expect(view.result.current.shown).toBe(view.initial);
  view.clock.paint();
  expect(view.result.current.shown).toBe(next);
  expect(view.clock.callbacks.size).toBe(0);
  view.commits.length = 0;
  const committed = { ...next, revision: 2 };
  view.rerender({ value: committed });
  expect(view.result.current.shown).toBe(committed);
  expect(view.commits.every((value) => value === committed)).toBe(true);
  expect(view.clock.callbacks.size).toBe(0);
});

test("same-owner restoration retains the urgent controls and adopts the latest deferred value without a frame timer", () => {
  const view = fixture(true);
  view.commits.length = 0;
  const restored = { target: "a", revision: 1 };
  view.rerender({ value: restored });
  expect(view.commits[0]).toBe(view.initial);
  expect(view.result.current.shown).toBe(restored);
  expect(view.clock.callbacks.size).toBe(0);
  for (let revision = 2; revision < 20; revision++)
    view.rerender({ value: { target: "a", revision } });
  expect(view.result.current.shown).toEqual({ target: "a", revision: 19 });
  expect(view.clock.callbacks.size).toBe(0);
  view.unmount();
});

test("superseded and unmounted selections cancel their pending publication", () => {
  const view = fixture();
  view.rerender({ value: { target: "superseded", revision: 1 } });
  view.clock.paint();
  const latest = { target: "latest", revision: 2 };
  view.rerender({ value: latest });
  view.clock.paint();
  expect(view.result.current.shown).toBe(view.initial);
  view.clock.paint();
  expect(view.result.current.shown).toBe(latest);
  view.rerender({ value: { target: "unmounted", revision: 3 } });
  view.unmount();
  expect(view.clock.callbacks.size).toBe(0);
});

test("an active attachment cancels scheduled changes and dismissal adopts only the latest owner", () => {
  const view = fixture();
  view.rerender({ value: { target: "pending", revision: 1 } });
  view.clock.paint();
  act(() => {
    view.result.current.attachment.onOpenChange(true);
  });
  expect(view.clock.callbacks.size).toBe(0);
  const latest = { target: "latest", revision: 2 };
  view.rerender({ value: latest });
  view.clock.paint();
  view.clock.paint();
  expect(view.result.current.shown).toBe(view.initial);
  act(() => {
    view.result.current.attachment.onOpenChange(false);
  });
  view.clock.paint();
  view.clock.paint();
  expect(view.result.current.shown).toBe(latest);
});
