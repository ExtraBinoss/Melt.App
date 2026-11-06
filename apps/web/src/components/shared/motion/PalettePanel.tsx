import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { atom, useAtomValue, useSetAtom, useStore } from "jotai";
import { Slot } from "radix-ui";
import { motion, useIsPresent } from "motion/react";
import "./palette-panel.css";

type Props = ComponentProps<typeof motion.div> & {
  reduced: boolean;
  waitForPlacement?: boolean;
  /** Parameter surfaces reveal as a whole; search palettes reveal their individual rows. */
  blurred?: boolean;
};
const PaletteInteraction = createContext<{ interact: () => void; read: () => boolean }>({
  interact: () => {},
  read: () => true,
});
/** Retire the opening reveal once. This state never follows animation frames. */
export function usePaletteInteraction() {
  return useContext(PaletteInteraction).interact;
}
/** Capture at mount: newly filtered rows never acquire opening-animation resources. */
export function usePaletteOpening() {
  const { read } = useContext(PaletteInteraction);
  const [opening] = useState(read);
  return opening;
}

/** One opacity-only shell for search palettes. Glyph blur belongs to PaletteReveal. */
export function PalettePanel({
  reduced,
  waitForPlacement = false,
  blurred = false,
  children,
  ...props
}: Props) {
  const present = useIsPresent(),
    element = useRef<HTMLDivElement>(null);
  const entrance = useMemo(() => atom(true), []);
  const store = useStore();
  const initial = useAtomValue(entrance),
    setInitial = useSetAtom(entrance);
  const interact = useCallback(() => setInitial(false), [setInitial]);
  const read = useCallback(() => store.get(entrance), [store, entrance]);
  const interaction = useMemo(() => ({ interact, read }), [interact, read]);
  useLayoutEffect(() => {
    if (present) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && element.current?.contains(focused)) focused.blur();
  }, [present]);
  useLayoutEffect(() => {
    if (!present) return;
    const panel = element.current,
      wrapper = panel?.parentElement;
    if (!panel) return;
    let frame = 0,
      active = true,
      started = false;
    panel.dataset.searchReveal = reduced ? "running" : "pending";
    const start = () => {
      if (started || !active) return;
      if (
        waitForPlacement &&
        (!wrapper?.style.transform || wrapper.style.transform === "translate(0, -200%)")
      )
        return;
      started = true;
      observer?.disconnect();
      frame = requestAnimationFrame(() => {
        if (!active) return;
        panel.dataset.searchReveal = "running";
      });
    };
    const observer = waitForPlacement ? new MutationObserver(start) : null;
    if (wrapper) observer?.observe(wrapper, { attributes: true, attributeFilter: ["style"] });
    start();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [present, reduced, waitForPlacement]);
  return (
    <PaletteInteraction value={interaction}>
      <Slot.Root ref={element}>
        <motion.div
          {...props}
          className={`palette-panel ${props.className ?? ""}`}
          data-search-reveal={reduced ? "running" : "pending"}
          data-palette-initial={initial}
          data-palette-blurred={blurred || undefined}
          data-reduced-motion={reduced || undefined}
          inert={!present || undefined}
          initial={false}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.08, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ ...props.style, pointerEvents: present ? "auto" : "none" }}
        >
          {children}
        </motion.div>
      </Slot.Root>
    </PaletteInteraction>
  );
}
