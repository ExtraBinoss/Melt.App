import { useLayoutEffect, useRef, type ReactNode } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { contextualSurfaceEase as ease } from "../../../components/shared/motion/ContextualSurface";

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
