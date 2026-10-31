import { isPlainPrimaryClick } from "../../../ui/navigation/activation";
import { libraryPreviewHref } from "./links";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { LibraryItem } from "../../../services/projects/library/favorites";
export const LibraryItemsContext = createContext<{
  inspect: (item: LibraryItem, open: () => void) => void;
} | null>(null);
/** Native double clicks open directly; the short single-click delay keeps the second click on its card. */
export function useLibraryItemActivation(item: LibraryItem, open: () => void, disabled = false) {
  const browser = useContext(LibraryItemsContext),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    latest = useRef({ item, open, browser, disabled });
  useLayoutEffect(() => {
    latest.current = { item, open, browser, disabled };
  });
  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => () => clearTimeout(timer.current), [item.id, item.kind, disabled]);
  return {
    cancel,
    href: disabled ? undefined : libraryPreviewHref(item),
    preview(this: void) {
      cancel();
      if (!disabled) {
        if (browser) browser.inspect(item, open);
        else open();
      }
    },
    inspectable: !!browser,
    click(this: void, event: MouseEvent) {
      cancel();
      if (disabled) {
        event.preventDefault();
        return;
      }
      if (!isPlainPrimaryClick(event)) return;
      event.preventDefault();
      if (!browser) return open();
      if (event.detail > 1) return;
      const inspect = () => {
        const now = latest.current;
        if (!now.disabled) now.browser?.inspect(now.item, now.open);
      };
      if (event.detail === 0) inspect();
      else timer.current = setTimeout(inspect, 280);
    },
    double(this: void, event?: MouseEvent) {
      cancel();
      if (event && !isPlainPrimaryClick(event)) return;
      if (!disabled) open();
    },
    direct(this: void) {
      cancel();
      if (!disabled) open();
    },
  };
}

export function LibraryItemActions({
  item,
  open,
  disabled,
  children,
}: {
  item: LibraryItem;
  open: () => void;
  disabled?: boolean;
  children: (activation: ReturnType<typeof useLibraryItemActivation>) => ReactNode;
}) {
  return children(useLibraryItemActivation(item, open, disabled));
}
