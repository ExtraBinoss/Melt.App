import { animate } from "motion/mini";

/** One compositor transform expands a circle; no animated layout, clip path or JS frame loop. */
export function createRadialBackground(host: HTMLElement, x: number, y: number, reduced: boolean) {
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 1;
  const circle = document.createElement("div");
  circle.className = "project-opening-circle";
  Object.assign(circle.style, {
    width: `${radius * 2}px`,
    height: `${radius * 2}px`,
    left: `${x - radius}px`,
    top: `${y - radius}px`,
    transform: reduced ? "none" : "scale(0)",
  });
  host.append(circle);
  const entry = reduced
    ? undefined
    : animate(
        circle,
        { transform: ["scale(0)", "scale(1)"] },
        {
          duration: 0.28,
          ease: [0.22, 0.68, 0.34, 1],
        },
      );
  let closed = false;
  const covered = (entry?.finished ?? Promise.resolve()).then(
    () => {
      if (!closed) {
        host.style.background = "var(--background)";
        circle.remove();
      }
    },
    () => {},
  );
  return {
    covered,
    dispose() {
      closed = true;
      entry?.stop();
      circle.remove();
    },
  };
}
