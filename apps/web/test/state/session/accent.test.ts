import { afterEach, expect, test, vi } from "vitest";
import { createStore, Provider } from "jotai";
import { createElement } from "react";
import { render, act } from "@testing-library/react";
import { accentAtom, readAccent, useAccent } from "../../../src/state/session/accent";
import { accentTokens, ACCENT_STORAGE_KEY } from "../../../src/ui/brand/accents";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(ACCENT_STORAGE_KEY);
  document.documentElement.removeAttribute("data-accent");
  document.documentElement.removeAttribute("style");
});
test("validates persisted values and tolerates blocked storage", () => {
  localStorage.setItem(ACCENT_STORAGE_KEY, "green");
  expect(readAccent()).toBe("green");
  localStorage.setItem(ACCENT_STORAGE_KEY, "__proto__");
  expect(readAccent()).toBe("violet");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw Error("Blocked");
  });
  expect(readAccent()).toBe("violet");
});
test("commits a real preference, reports failed persistence, and keeps the session usable", () => {
  const store = createStore();
  expect(store.set(accentAtom, "green")).toBe(true);
  expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe("green");
  expect(store.get(accentAtom)).toBe("green");
  expect(document.documentElement.style.getPropertyValue("--primary")).toBe(
    accentTokens("green", document.documentElement.classList.contains("dark"))["--primary"],
  );
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("Quota");
  });
  expect(store.set(accentAtom, "blue")).toBe(false);
  expect(store.get(accentAtom)).toBe("blue");
});
test("subscribed stores follow valid external changes and detach the storage listener", () => {
  const store = createStore(),
    listener = vi.fn();
  const remove = vi.spyOn(window, "removeEventListener");
  const stop = store.sub(accentAtom, listener);
  localStorage.setItem(ACCENT_STORAGE_KEY, "teal");
  window.dispatchEvent(new StorageEvent("storage", { key: ACCENT_STORAGE_KEY, newValue: "teal" }));
  expect(store.get(accentAtom)).toBe("teal");
  localStorage.setItem(ACCENT_STORAGE_KEY, "invalid");
  window.dispatchEvent(
    new StorageEvent("storage", { key: ACCENT_STORAGE_KEY, newValue: "invalid" }),
  );
  expect(store.get(accentAtom)).toBe("teal");
  stop();
  expect(remove).toHaveBeenCalledWith("storage", expect.any(Function));
});

test("root updates use an imperative subscription and keep unsaved choices across resubscription", () => {
  const store = createStore();
  let renders = 0;
  function Host() {
    useAccent();
    renders++;
    return null;
  }
  const view = render(createElement(Provider, { store }, createElement(Host)));
  const first = renders;
  act(() => {
    store.set(accentAtom, "amber");
  });
  expect(renders).toBe(first);
  expect(document.documentElement.dataset.accent).toBe("amber");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("Blocked");
  });
  act(() => {
    expect(store.set(accentAtom, "blue")).toBe(false);
  });
  view.unmount();
  const remount = render(createElement(Provider, { store }, createElement(Host)));
  expect(store.get(accentAtom)).toBe("blue");
  expect(document.documentElement.dataset.accent).toBe("blue");
  remount.unmount();
});
