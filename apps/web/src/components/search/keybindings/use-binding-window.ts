import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { BindingCommand } from "../../../state/keybindings/registry";

/** Measures variable-height rows in the Preferences scrollport or the standalone list. */
export function useBindingWindow(commands: readonly BindingCommand[]) {
  const list = useRef<HTMLDivElement>(null);
  const [sizes] = useState(() => new Map<string, number>());
  const [range, setRange] = useState({
    start: 0,
    end: 12,
    revision: 0,
    source: commands,
    pinned: null as number | null,
  });
  const estimated = globalThis.matchMedia?.("(max-width: 580px)").matches ? 82 : 54;
  const measureOffsets = useCallback(() => {
    const result = [0];
    for (const command of commands)
      result.push(result.at(-1)! + (sizes.get(command.id) ?? estimated));
    return result;
  }, [commands, estimated, sizes]);
  const offsets = measureOffsets();
  useLayoutEffect(() => {
    const root = list.current;
    if (!root) return;
    const viewport = root.closest<HTMLElement>(".preferences-page-viewport") ?? root;
    let active = true,
      lastWidth = 0,
      height = 320,
      origin = 0,
      current = measureOffsets();
    const publish = (top: number, changed = false) => {
      if (!active) return;
      let first = 0,
        last = 0;
      while (first < commands.length && current[first + 1]! < top - origin) first++;
      last = first;
      while (last < commands.length && current[last]! < top - origin + height) last++;
      const start = Math.max(0, first - 4),
        end = Math.min(commands.length, last + 4);
      setRange((previous) =>
        previous.source === commands && previous.start === start && previous.end === end && !changed
          ? previous
          : {
              start,
              end,
              source: commands,
              revision: previous.revision + 1,
              pinned: previous.source === commands ? previous.pinned : null,
            },
      );
    };
    const measure = () => {
      if (!active) return;
      const top = viewport.scrollTop,
        width = viewport.clientWidth;
      height = viewport.clientHeight || 320;
      if (root !== viewport) {
        const rootRect = root.getBoundingClientRect(),
          viewportRect = viewport.getBoundingClientRect();
        const scale = viewport.offsetHeight ? viewportRect.height / viewport.offsetHeight : 1;
        origin = (rootRect.top - viewportRect.top) / (scale || 1) + top;
      }
      const measurements = [...root.querySelectorAll<HTMLElement>("[data-binding-index]")].map(
        (row) => [row.dataset.bindingId!, row.offsetHeight] as const,
      );
      if (lastWidth && width !== lastWidth) sizes.clear();
      lastWidth = width;
      let changed = false;
      for (const [id, value] of measurements) {
        if (value > 0 && sizes.get(id) !== value) {
          sizes.set(id, value);
          changed = true;
        }
      }
      current = measureOffsets();
      publish(top, changed);
    };
    const resize = new ResizeObserver(measure);
    function observeRows() {
      resize.disconnect();
      resize.observe(viewport);
      if (root !== viewport) resize.observe(root!);
      const body = root!.closest(".preferences-page-body");
      if (body) resize.observe(body);
      for (const row of root!.querySelectorAll("[data-binding-index]")) resize.observe(row);
    }
    observeRows();
    const children = new MutationObserver(observeRows);
    children.observe(root, { childList: true, subtree: true });
    const scroll = () => publish(viewport.scrollTop);
    viewport.addEventListener("scroll", scroll, { passive: true });
    // Initial ResizeObserver delivery reads geometry after commit; scrolling reuses it.
    return () => {
      active = false;
      resize.disconnect();
      children.disconnect();
      viewport.removeEventListener("scroll", scroll);
    };
  }, [commands, measureOffsets, sizes]);
  const start = range.source === commands ? range.start : 0;
  const end = range.source === commands ? range.end : 12;
  const indexes = Array.from(
    { length: Math.max(0, Math.min(commands.length, end) - start) },
    (_, i) => start + i,
  );
  if (
    range.source === commands &&
    range.pinned !== null &&
    range.pinned < commands.length &&
    !indexes.includes(range.pinned)
  )
    indexes.push(range.pinned);
  indexes.sort((a, b) => a - b);
  return {
    list,
    indexes,
    offsets,
    pin(this: void, index: number | null) {
      setRange((previous) =>
        previous.source === commands && previous.pinned === index
          ? previous
          : {
              ...previous,
              source: commands,
              pinned: index,
              start: previous.source === commands ? previous.start : 0,
              end: previous.source === commands ? previous.end : 12,
              revision: previous.revision + 1,
            },
      );
    },
    focus(this: void, index: number, reverse: boolean) {
      flushSync(() =>
        setRange((previous) => ({
          ...previous,
          source: commands,
          pinned: index,
          start: previous.source === commands ? previous.start : 0,
          end: previous.source === commands ? previous.end : 12,
          revision: previous.revision + 1,
        })),
      );
      const row = list.current?.querySelector<HTMLElement>(`[data-binding-index="${index}"]`);
      const buttons = row?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      (reverse ? buttons?.[buttons.length - 1] : buttons?.[0])?.focus();
    },
  };
}
