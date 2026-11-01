import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent,
  type RefObject,
} from "react";

/** A bounded exit grace spans sibling/portaled surfaces; keyboard interaction cancels dismissal. */
export function useHoverDismiss(
  open: boolean,
  onDismiss: () => void,
  ...surfaces: RefObject<HTMLElement | null>[]
) {
  const latest = useRef({ onDismiss, surfaces });
  const timer = useRef<{ view: Window; id: number } | null>(null);
  useLayoutEffect(() => {
    latest.current = { onDismiss, surfaces };
  });
  const cancel = useCallback(() => {
    if (timer.current) timer.current.view.clearTimeout(timer.current.id);
    timer.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (!open) cancel();
  }, [open, cancel]);
  const enter = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") cancel();
    },
    [cancel],
  );
  const leave = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== "mouse" || event.buttons !== 0) return;
      cancel();
      const view = event.currentTarget.ownerDocument.defaultView;
      if (!view) return;
      timer.current = {
        view,
        id: view.setTimeout(() => {
          timer.current = null;
          // Ref updates can replace a trigger without a new native enter packet.
          if (latest.current.surfaces.some(({ current }) => current?.matches(":hover"))) return;
          latest.current.onDismiss();
        }, 200),
      };
    },
    [cancel],
  );
  return { enter, leave, cancel };
}
