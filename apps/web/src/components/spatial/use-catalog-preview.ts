import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef } from "react";

interface PreviewBoundary {
  register: (cancel: () => void) => () => void;
  cancel: () => void;
}
export const CatalogPreviewBoundary = createContext<PreviewBoundary | null>(null);

export function useCatalogPreviewBoundary(): PreviewBoundary {
  const cancellations = useRef(new Set<() => void>());
  return useMemo(
    () => ({
      register(cancel: () => void) {
        cancellations.current.add(cancel);
        return () => {
          cancellations.current.delete(cancel);
        };
      },
      cancel() {
        for (const cancel of cancellations.current) cancel();
      },
    }),
    [],
  );
}

/** Tile gaps keep the latest draft; only the owning picker's dismissal cancels it. */
export function useCatalogPreview({
  identity,
  disabled,
  onPreview,
  onCancel,
  onChoose,
}: {
  identity?: unknown;
  disabled?: boolean;
  onPreview?: (id: string) => void;
  onCancel?: () => void;
  onChoose: (id: string) => void;
}) {
  const held = useRef<{ id: string; cancel?: () => void } | null>(null);
  const boundary = useContext(CatalogPreviewBoundary);
  const cancel = useCallback(() => {
    const previous = held.current;
    held.current = null;
    previous?.cancel?.();
  }, []);
  useLayoutEffect(() => cancel, [identity, cancel]);
  useLayoutEffect(() => boundary?.register(cancel), [boundary, cancel]);
  useLayoutEffect(() => {
    if (disabled) cancel();
  }, [disabled, cancel]);
  return {
    cancel,
    preview(id: string) {
      if (disabled || !onPreview || held.current?.id === id) return;
      held.current = { id, cancel: onCancel };
      onPreview(id);
    },
    choose(id: string) {
      if (disabled) return;
      held.current = null;
      onChoose(id);
    },
  };
}
