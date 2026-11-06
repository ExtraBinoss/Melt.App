import { BlurReveal, type BlurRevealProps } from "../../ui/blur-text-animation";
import { Slot } from "radix-ui";
import { usePaletteOpening } from "./PalettePanel";

/** Shared palette cadence. Never transform glyphs or their layout during a reveal. */
export function paletteRevealDelay(order: number) {
  if (order <= 0) return 0;
  if (order === 1) return 8;
  return 16 + Math.min(order - 2, 8) * 6;
}
export function PaletteReveal({
  order = 0,
  asChild = false,
  reduced,
  children,
  ...props
}: Omit<BlurRevealProps, "durationMs" | "delayMs" | "blur" | "scale" | "motion">) {
  const opening = usePaletteOpening();
  if (!opening) {
    const Component = asChild ? Slot.Root : "span";
    return <Component {...props}>{children}</Component>;
  }
  return (
    <BlurReveal
      {...props}
      asChild={asChild}
      reduced={reduced}
      order={order}
      durationMs={160}
      delayMs={paletteRevealDelay(order)}
      blur={2}
      motion="still"
    >
      {children}
    </BlurReveal>
  );
}
