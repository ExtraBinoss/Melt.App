import type { ReactNode } from "react";
import { motion, useIsPresent, useReducedMotion } from "motion/react";

export const contextualSurfaceEase = [0.22, 1, 0.36, 1] as const;

/** Animate measured contextual content without remounting its controls.
 * Keep positioning on an outer anchor; size-only layout leaves that anchor free
 * to follow a new canvas owner immediately rather than flying between objects.
 */
export function ContextualSurface({
  children,
  className,
  label,
  layoutKey,
  layout = true,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  layoutKey?: string;
  layout?: true | "size" | "position";
  as?: "div" | "aside";
}) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  const Surface = as === "aside" ? motion.aside : motion.div;
  return (
    <Surface
      className={className}
      data-canvas-control
      data-contextual-surface-present={present}
      aria-label={label}
      aria-hidden={!present}
      inert={!present}
      layout={reduced ? false : layout}
      layoutDependency={layoutKey}
      initial={reduced ? false : { opacity: 0, y: 12, scale: 0.97, filter: "blur(3px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.1, ease: "easeOut" } }}
      transition={{
        duration: reduced ? 0 : 0.22,
        ease: contextualSurfaceEase,
        layout: { duration: reduced ? 0 : 0.3, ease: contextualSurfaceEase },
      }}
      style={{ transformOrigin: "50% 100%" }}
    >
      {children}
    </Surface>
  );
}
