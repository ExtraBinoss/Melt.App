import { useDeferredValue, useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useAtomValue } from "jotai";
import { attachmentPopoverOpenAtom } from "../../state/session/attachment-popover";

/** Keep canvas feedback urgent; adopt expensive controls at an interruptible React priority. */
export function useInspectorPresentation<T>(
  value: T,
  sameOwner: (before: T, after: T) => boolean,
  deferChange?: (before: T, after: T) => boolean,
): T {
  const editing = useAtomValue(attachmentPopoverOpenAtom);
  const [retained, setRetained] = useState(() => value);
  // Document restoration must not rebuild the full control tree in the urgent canvas update.
  // React can interrupt this adoption for another native input; scalar fields have live ports.
  const deferred = useDeferredValue(value);
  const candidate = deferChange?.(retained, value) ? deferred : value;
  const shown = !editing && sameOwner(retained, candidate) ? candidate : retained;
  if (!Object.is(retained, shown)) setRetained(() => shown);
  useLayoutEffect(() => {
    if (editing || Object.is(retained, value) || sameOwner(retained, value)) return;
    let pending = true;
    let frame = requestAnimationFrame(() => {
      // The first frame belongs to the outline. Avoid holding it behind a cold control mount.
      frame = requestAnimationFrame(() => {
        if (pending) flushSync(() => setRetained(() => value));
      });
    });
    return () => {
      pending = false;
      cancelAnimationFrame(frame);
    };
  }, [editing, retained, sameOwner, value]);
  return shown;
}
