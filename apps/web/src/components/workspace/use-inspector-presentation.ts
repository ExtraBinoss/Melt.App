import { useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useAtomValue } from "jotai";
import { attachmentPopoverOpenAtom } from "../../state/session/attachment-popover";

/** Paint selection feedback first, then publish properties without background render starvation. */
export function useInspectorPresentation<T>(
  value: T,
  sameOwner: (before: T, after: T) => boolean,
): T {
  const editing = useAtomValue(attachmentPopoverOpenAtom);
  const [retained, setRetained] = useState(() => value);
  const shown = !editing && sameOwner(retained, value) ? value : retained;
  if (!Object.is(retained, shown)) setRetained(() => shown);
  useLayoutEffect(() => {
    if (editing || Object.is(retained, value)) return;
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
  }, [editing, retained, value]);
  return shown;
}
