import { useLayoutEffect, useRef, type ReactNode } from "react";
import { motion, useAnimationControls, useIsPresent, useReducedMotion } from "motion/react";

const ease = [0.22, 1, 0.36, 1] as const;

/** Motion measures the real wrapped layout; no guessed widths or sampled size keys. */
export function StudioObjectSurface({
  children,
  label,
  layoutKey,
}: {
  children: ReactNode;
  label: string;
  layoutKey: string;
}) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="studio-object-bar studio-surface"
      data-canvas-control
      data-studio-object-present={present}
      aria-label={label}
      aria-hidden={!present}
      inert={!present}
      layout={!reduced}
      layoutDependency={layoutKey}
      initial={reduced ? false : { opacity: 0, y: 12, scale: 0.97, filter: "blur(3px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.1, ease: "easeOut" } }}
      transition={{
        duration: reduced ? 0 : 0.22,
        ease,
        layout: { duration: reduced ? 0 : 0.3, ease },
      }}
      style={{ transformOrigin: "50% 100%" }}
    >
      {children}
    </motion.div>
  );
}

/** Stable semantic field keys preserve focus and active gestures across ordinary edits. */
export function StudioObjectField({
  children,
  owner,
  content,
  layoutKey,
  className = "studio-object-property",
}: {
  children: ReactNode;
  owner: string;
  content: string;
  layoutKey: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const controls = useAnimationControls();
  const previous = useRef({ owner, content });
  useLayoutEffect(() => {
    const changed = previous.current.owner !== owner && previous.current.content !== content;
    previous.current = { owner, content };
    if (changed && !reduced)
      void controls.start({
        opacity: [0.55, 1],
        filter: ["blur(3px)", "blur(0px)"],
        transition: { duration: 0.22, ease },
      });
    else
      void controls.start({
        opacity: 1,
        filter: "blur(0px)",
        transition: { duration: reduced ? 0 : 0.22, ease },
      });
    return () => controls.stop();
  }, [owner, content, reduced, controls]);
  return (
    <motion.div
      className={`studio-object-field ${className}`}
      layout={reduced ? false : "position"}
      layoutDependency={layoutKey}
      initial={reduced ? false : { opacity: 0, filter: "blur(3px)" }}
      animate={controls}
      transition={{ duration: reduced ? 0 : 0.22, ease, layout: { duration: 0.3, ease } }}
    >
      {children}
    </motion.div>
  );
}
