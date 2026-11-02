import { useEffect } from "react";
import { atom, useStore } from "jotai";
import { ACCENT_STORAGE_KEY, isAccent, paintAccent } from "../../ui/brand/accents";
import type { Accent } from "../../ui/brand/accents";

export function readAccent(): Accent {
  try {
    const value = localStorage.getItem(ACCENT_STORAGE_KEY);
    return isAccent(value) ? value : "violet";
  } catch {
    return "violet";
  }
}
const valueAtom = atom({ id: readAccent(), saved: true });
valueAtom.onMount = (set) => {
  set((previous) => (previous.saved ? { id: readAccent(), saved: true } : previous));
  const external = (event: StorageEvent) => {
    if (event.key !== null && event.key !== ACCENT_STORAGE_KEY) return;
    if (event.newValue === null || isAccent(event.newValue)) set({ id: readAccent(), saved: true });
  };
  window.addEventListener("storage", external);
  return () => window.removeEventListener("storage", external);
};
export const accentAtom = atom(
  (get) => get(valueAtom).id,
  (_get, set, value: Accent) => {
    if (!isAccent(value)) throw new TypeError("Invalid interface accent.");
    let saved = true;
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, value);
    } catch {
      saved = false;
    }
    set(valueAtom, { id: value, saved });
    paintAccent(document.documentElement, value);
    return saved;
  },
);
/** One imperative subscription updates CSS, including portals, without rendering editor roots. */
export function useAccent() {
  const store = useStore();
  useEffect(() => {
    const paint = () => paintAccent(document.documentElement, store.get(accentAtom));
    paint();
    return store.sub(accentAtom, paint);
  }, [store]);
}
