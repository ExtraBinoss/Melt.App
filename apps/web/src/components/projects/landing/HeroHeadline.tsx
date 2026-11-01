import { useEffect, useRef } from "react";

/** Two native text runs preserve shaping/wrapping without per-letter React/DOM work. */
export function HeroHeadline({ lines }: { lines: readonly string[] }) {
  const element = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const sync = () => element.current?.toggleAttribute("data-paused", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return (
    <h1 ref={element} className="landing-headline" aria-label={lines.join(" ")}>
      {lines.map((line, row) => (
        <span className="hero-line-mask" key={line} aria-hidden>
          <span className="hero-line" style={{ animationDelay: `${row * 0.14}s` }}>
            {line}
          </span>
        </span>
      ))}
    </h1>
  );
}
