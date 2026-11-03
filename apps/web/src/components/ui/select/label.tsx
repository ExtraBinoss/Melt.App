import { useLayoutEffect, useRef } from "react";
import "./label.css";

/** Ellipsis at rest; reveal only genuinely overflowing labels without React updates. */
export function SelectLabel({ text }: { text: string }) {
  const element = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const node = element.current;
    const content = node?.firstElementChild;
    if (!node || !(content instanceof HTMLElement)) return;
    const control = node.closest<HTMLElement>(
      '[data-slot="select-trigger"], [data-slot="select-item"]',
    );
    let previous = -1;
    const observer = new ResizeObserver(() => {
      const distance = Math.max(0, content.scrollWidth - node.clientWidth);
      if (distance === previous) return;
      previous = distance;
      node.toggleAttribute("data-overflow", distance > 1);
      node.title = distance > 1 ? text : "";
      if (control) control.title = distance > 1 ? text : "";
      node.style.setProperty("--select-label-distance", `${distance}px`);
      node.style.setProperty("--select-label-duration", `${Math.max(4, distance / 35 + 2)}s`);
    });
    observer.observe(node);
    observer.observe(content);
    return () => {
      observer.disconnect();
      if (control?.title === text) control.removeAttribute("title");
    };
  }, [text]);
  return (
    <span ref={element} className="select-label">
      <span className="select-label-text">{text}</span>
    </span>
  );
}
