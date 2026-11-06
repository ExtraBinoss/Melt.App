import { createContext, useContext, type ReactNode } from "react";
import { BlurReveal, type BlurRevealProps } from "../../ui/blur-text-animation";
import { Slot } from "radix-ui";
import { usePaletteOpening } from "./PalettePanel";

type RevealProfile = "palette" | "controls";
const Profile = createContext<RevealProfile>("palette");
/** A stronger, bounded sequence for dense settings, sharing the palette's native blur engine. */
export function PaletteRevealGroup({
  profile,
  children,
}: {
  profile: RevealProfile;
  children: ReactNode;
}) {
  return <Profile value={profile}>{children}</Profile>;
}

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
  enabled = true,
  children,
  ...props
}: Omit<BlurRevealProps, "durationMs" | "delayMs" | "blur" | "fromOpacity" | "scale" | "motion"> & {
  enabled?: boolean;
}) {
  const opening = usePaletteOpening();
  const controls = useContext(Profile) === "controls";
  if (!enabled || !opening) {
    const Component = asChild ? Slot.Root : "span";
    return <Component {...props}>{children}</Component>;
  }
  return (
    <BlurReveal
      {...props}
      asChild={asChild}
      reduced={reduced}
      order={order}
      durationMs={controls ? 280 : 160}
      delayMs={controls ? Math.min(Math.max(0, order) * 18, 234) : paletteRevealDelay(order)}
      blur={controls ? 6 : 2}
      fromOpacity={controls ? 0.2 : 0}
      motion="still"
    >
      {children}
    </BlurReveal>
  );
}
