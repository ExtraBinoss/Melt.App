import { useEffect, useMemo, type RefObject } from "react";
import type { SearchItem } from "./catalog/model";

/** Real catalog labels, written directly to the input: the typewriter never schedules a React render. */
export function useSearchPlaceholder(
  ref: RefObject<HTMLInputElement | null>,
  items: readonly SearchItem[],
  prefix: string,
  reduced: boolean,
) {
  const names = useMemo(
    () =>
      ["effect:contrast", "effect:blur", "action:rulers", "action:editorSettings"]
        .map((id) => items.find((item) => item.id === id)?.label)
        .filter((label): label is string => !!label),
    [items],
  );
  useTypewriterPlaceholder(ref, names, reduced, { prefix });
}

/** Shared attribute-only animation; its clock stays independent of owner renders. */
export function useTypewriterPlaceholder(
  ref: RefObject<HTMLInputElement | null>,
  names: readonly string[],
  reduced: boolean,
  {
    prefix = "",
    suffix = "…",
    pauseOnFocus = false,
    enabled = true,
  }: { prefix?: string; suffix?: string; pauseOnFocus?: boolean; enabled?: boolean } = {},
) {
  const labels = JSON.stringify(names);
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const suggestions = JSON.parse(labels) as string[];
    let timer: ReturnType<typeof setTimeout> | undefined,
      index = 0,
      count = reduced ? (suggestions[0]?.length ?? 0) : 0,
      deleting = false,
      disposed = false;
    function display(name: string) {
      if (input)
        input.placeholder = `${prefix}${prefix && suggestions[index] ? " " : ""}${name}${suffix}`;
    }
    function tick() {
      if (disposed || !input || document.hidden || input.value) return;
      const name = suggestions[index] ?? "";
      if (!enabled || (pauseOnFocus && document.activeElement === input)) {
        display(name);
        return;
      }
      display(name.slice(0, count));
      if (reduced || !suggestions.length) return;
      const finished = count === name.length;
      const delay = finished && !deleting ? 1500 : !count && deleting ? 240 : deleting ? 24 : 65;
      if (finished && !deleting) deleting = true;
      else if (!count && deleting) {
        deleting = false;
        index = (index + 1) % suggestions.length;
      } else count += deleting ? -1 : 1;
      timer = setTimeout(tick, delay);
    }
    function resume() {
      clearTimeout(timer);
      tick();
    }
    function focus() {
      clearTimeout(timer);
      if (!input?.value) display(suggestions[index] ?? "");
    }
    tick();
    input.addEventListener("input", resume);
    if (pauseOnFocus) {
      input.addEventListener("focus", focus);
      input.addEventListener("blur", resume);
    }
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      clearTimeout(timer);
      input.removeEventListener("input", resume);
      input.removeEventListener("focus", focus);
      input.removeEventListener("blur", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [ref, labels, prefix, suffix, reduced, pauseOnFocus, enabled]);
}
