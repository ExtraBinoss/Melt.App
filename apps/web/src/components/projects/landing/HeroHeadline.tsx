import { useEffect, useRef } from "react";
import "./headline.css";

const cjkBoundary = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}、。，！？]$/u;

/** Short, native text runs keep Arabic shaping and CJK line breaks intact. */
export function HeroHeadline({ lines }: { lines: readonly string[] }) {
  const element = useRef<HTMLHeadingElement>(null);
  const chunks = lines.length > 4 ? [...lines.slice(0, 3), lines.slice(3).join(" ")] : lines;
  useEffect(() => {
    const sync = () => element.current?.toggleAttribute("data-paused", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return (
    <h1 ref={element} className="landing-headline" aria-label={lines.join(" ")} dir="auto">
      <span aria-hidden>
        {chunks.map((chunk, index) => (
          <span key={`${index}-${chunk}`}>
            {index > 0 && (cjkBoundary.test(chunks[index - 1] ?? "") ? <wbr /> : " ")}
            <span className="hero-chunk">{chunk}</span>
          </span>
        ))}
      </span>
    </h1>
  );
}
