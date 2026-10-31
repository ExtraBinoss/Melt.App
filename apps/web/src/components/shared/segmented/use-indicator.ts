import { useLayoutEffect, useRef, type RefObject } from "react";
import { animate, useMotionValue } from "motion/react";
/** Offset geometry excludes ancestor transforms: the same wipe works on scaled artboards. */
export function useSegmentedIndicator(
  root: RefObject<HTMLDivElement | null>,
  value: string,
  layoutKey: string,
) {
  const x = useMotionValue(0),
    y = useMotionValue(0),
    width = useMotionValue(0),
    height = useMotionValue(0),
    opacity = useMotionValue(0);
  const initialized = useRef(false);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animations: { stop: () => void }[] = [];
    function measure() {
      const target = [...element!.querySelectorAll<HTMLElement>(".segmented-tab")].find(
        (item) => item.dataset.segmentedValue === value,
      );
      if (!target || !target.offsetWidth || !target.offsetHeight) {
        opacity.set(0);
        return;
      }
      // Read the complete target before scheduling any animated style writes.
      const geometry = [
        target.offsetLeft,
        target.offsetTop,
        target.offsetWidth,
        target.offsetHeight,
      ];
      for (const animation of animations) animation.stop();
      const fields = [x, y, width, height];
      animations = [];
      fields.forEach((field, index) => {
        if (!initialized.current || media.matches) field.set(geometry[index]!);
        else
          animations.push(
            animate(field, geometry[index]!, {
              type: "spring",
              stiffness: 460,
              damping: 38,
              mass: 0.7,
            }),
          );
      });
      opacity.set(1);
      initialized.current = true;
    }
    measure();
    media.addEventListener("change", measure);
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    for (const tab of element.querySelectorAll(".segmented-tab")) resize.observe(tab);
    return () => {
      resize.disconnect();
      media.removeEventListener("change", measure);
      for (const animation of animations) animation.stop();
    };
  }, [root, value, layoutKey, x, y, width, height, opacity]);
  return { x, y, width, height, opacity };
}
