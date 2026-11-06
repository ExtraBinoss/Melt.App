import type { ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import { PalettePanel } from "../shared/motion/PalettePanel";

const Overlay = motion.create(DialogPrimitive.Overlay);
type ContentProps = ComponentProps<typeof DialogPrimitive.Content>;
interface Props extends ContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reduced: boolean;
}
/** Radix retains focus/modal semantics while Motion owns only the palette's visual presence. */
export function SearchDialog({ open, onOpenChange, reduced, ...props }: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && <SearchDialogLayers key="palette" reduced={reduced} {...props} />}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
function SearchDialogLayers({ reduced, children, ...props }: ContentProps & { reduced: boolean }) {
  return (
    <DialogPrimitive.Portal forceMount>
      <Overlay
        forceMount
        data-slot="dialog-overlay"
        className="magic-search-overlay"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduced ? 0 : 0.16 }}
      />

      <DialogPrimitive.Content
        {...props}
        onEscapeKeyDown={(event) => {
          props.onEscapeKeyDown?.(event);
          // Escape first belongs to the native IME candidate list, including legacy composition events.
          if (event.isComposing || event.keyCode === 229) event.preventDefault();
        }}
        forceMount
        asChild
        data-slot="dialog-content"
        data-magic-search
      >
        <PalettePanel reduced={reduced}>{children}</PalettePanel>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
