import { useCallback, useLayoutEffect, useRef } from "react";
import { animate as animateFallback } from "motion/react";
import { animate } from "motion/mini";

/** Start after the mounting commit, so a slow commit cannot consume the entrance off screen. */
export function useDockPresence(present: boolean, reduced: boolean) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    if (reduced) {
      node.style.opacity = present ? "1" : "0";
      node.style.transform = `translateY(${present ? 0 : 32}px)`;
      return;
    }
    let stop = () => {};
    const frame = requestAnimationFrame(() => {
      const values = {
        opacity: present ? 1 : 0,
        transform: `translateY(${present ? 0 : 32}px)`,
      };
      const options = {
        duration: 0.24,
        ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
      };
      const animation =
        typeof node.animate === "function"
          ? animate(node, values, options)
          : animateFallback(node, values, options);
      stop = () => animation.stop();
    });
    return () => {
      cancelAnimationFrame(frame);
      stop();
    };
  }, [present, reduced]);
  return useCallback((node: HTMLDivElement | null) => {
    root.current = node;
  }, []);
}
