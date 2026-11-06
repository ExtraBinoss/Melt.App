import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useStore } from "jotai";
import type { ColorTarget, EnginePort, PaletteSwatch, SessionSnapshot } from "@musart/core";
import { paletteVariation } from "../../services/palettes/binding";
import { previewAtom } from "../../state/session/editor";
import type { PreviewValue } from "../../state/session/preview-source";

type Callbacks = {
  beforeApply: () => void;
  onUse: (value: string) => void;
  onPreview?: (value: string) => void;
  onCancel?: () => void;
};
/** A dice draft belongs to this popover and never enters document history. */
export function usePaletteVariation(
  engine: EnginePort | undefined,
  callbacks: Callbacks,
  invalidated: () => void,
  targets: readonly ColorTarget[] = [],
) {
  const store = useStore(),
    latest = useRef({ callbacks, invalidated, targets });
  const session = useRef<{
    base?: SessionSnapshot;
    owned: PreviewValue | null;
    local: boolean;
    targets: readonly ColorTarget[];
  } | null>(null);
  useLayoutEffect(() => {
    latest.current = { callbacks, invalidated, targets };
  });
  const cancel = useCallback(() => {
    const current = session.current;
    session.current = null;
    if (!current) return;
    const own = current.owned === store.get(previewAtom);
    if (current.owned && own) store.set(previewAtom, null);
    if (current.local && own) latest.current.callbacks.onCancel?.();
  }, [store]);
  useEffect(() => {
    const unsubscribe = engine?.subscribe(() => {
      const base = session.current?.base,
        next = engine.getSnapshot();
      if (
        base &&
        (base.project !== next.project ||
          base.pageId !== next.pageId ||
          base.selection !== next.selection)
      ) {
        cancel();
        latest.current.invalidated();
      }
    });
    return () => {
      unsubscribe?.();
      cancel();
    };
  }, [engine, store, cancel]);
  function preview(colors: PaletteSwatch[]) {
    if (!session.current) {
      latest.current.callbacks.beforeApply();
      session.current = {
        base: engine?.getSnapshot(),
        owned: null,
        local: false,
        targets: latest.current.targets,
      };
    }
    const current = session.current;
    const variation = current.base && paletteVariation(current.base, colors, current.targets);
    if (variation?.preview) {
      current.owned = { target: "page", patch: variation.preview };
      store.set(previewAtom, current.owned);
    } else {
      current.local = true;
      latest.current.callbacks.onPreview?.(colors[0]!.value);
      current.owned = store.get(previewAtom);
    }
  }
  function apply(colors: PaletteSwatch[]) {
    if (!session.current) throw Error("Palette preview is stale.");
    const base = session.current?.base;
    if (
      base &&
      engine &&
      (engine.getSnapshot().project !== base.project || engine.getSnapshot().pageId !== base.pageId)
    ) {
      cancel();
      throw Error("Palette preview is stale.");
    }
    const variation = base && paletteVariation(base, colors, session.current?.targets);
    cancel();
    latest.current.callbacks.beforeApply();
    if (variation && engine && (variation.globals.length || variation.commands?.length))
      engine.transaction([
        ...(variation.globals.length
          ? [{ type: "setDocumentColors" as const, colors: variation.globals }]
          : []),
        ...(variation.commands ?? []),
      ]);
    else latest.current.callbacks.onUse(colors[0]!.value);
  }
  return { preview, apply, cancel };
}
