import { afterEach, expect, test, vi } from "vitest";

const storageKey = "musart.keep-creation-tool.v1";

async function freshPreference(saved?: string) {
  if (saved === undefined) localStorage.removeItem(storageKey);
  else localStorage.setItem(storageKey, saved);
  vi.resetModules();
  const { keepCreationToolAtom } = await import("../../../src/state/tools/preferences"),
    { createStore } = await import("jotai");
  return { preference: keepCreationToolAtom, store: createStore() };
}

afterEach(() => {
  localStorage.removeItem(storageKey);
});

test("defaults to one placement and restores the saved repeated-creation choice before mounting", async () => {
  const { preference, store } = await freshPreference();
  expect(store.get(preference)).toBe(false);
  const unsubscribe = store.sub(preference, () => undefined);
  try {
    store.set(preference, true);
    expect(store.get(preference)).toBe(true);
    expect(localStorage.getItem(storageKey)).toBe("true");
  } finally {
    unsubscribe();
  }
  const restored = await freshPreference(localStorage.getItem(storageKey)!);
  expect(restored.store.get(restored.preference)).toBe(true);
  restored.store.set(restored.preference, false);
  expect(localStorage.getItem(storageKey)).toBe("false");
});

test("invalid stored values cannot enable repeated creation", async () => {
  for (const saved of ["{", "null", "1", '"true"', "[]", "{}"] as const) {
    const { preference, store } = await freshPreference(saved);
    expect(store.get(preference)).toBe(false);
    const unsubscribe = store.sub(preference, () => undefined);
    try {
      expect(store.get(preference)).toBe(false);
    } finally {
      unsubscribe();
    }
  }
});

test("mounted consumers follow valid changes from another window and storage clearing", async () => {
  const { preference, store } = await freshPreference(),
    changed = vi.fn(),
    unsubscribe = store.sub(preference, changed);
  try {
    window.dispatchEvent(
      new StorageEvent("storage", { key: storageKey, newValue: "true", storageArea: localStorage }),
    );
    expect(store.get(preference)).toBe(true);
    expect(changed).toHaveBeenCalledOnce();
    window.dispatchEvent(
      new StorageEvent("storage", { key: storageKey, newValue: null, storageArea: localStorage }),
    );
    expect(store.get(preference)).toBe(false);
  } finally {
    unsubscribe();
  }
});
