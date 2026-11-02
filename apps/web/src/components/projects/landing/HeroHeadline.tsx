import { useEffect, useId, useRef } from "react";
import type { CSSProperties } from "react";
import { installHeadlineInteraction } from "./hero/headline-interaction";
import { HeadlineContourFilter } from "./hero/HeadlineContourFilter";
import "./headline.css";

const cjkBoundary = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}、。，！？]$/u;

/** Short, native text runs keep Arabic shaping and CJK line breaks intact. */
export function HeroHeadline({ lines }: { lines: readonly string[] }) {
  const element = useRef<HTMLHeadingElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const filter = `hero-contour-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const chunks = lines.length > 4 ? [...lines.slice(0, 3), lines.slice(3).join(" ")] : lines;
  const phrase = lines.join("\n");
  useEffect(() => {
    const sync = () => element.current?.toggleAttribute("data-paused", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  useEffect(() => installHeadlineInteraction(stage.current!, element.current!), [phrase]);
  return (
    <div
      ref={stage}
      className="hero-type-stage"
      data-ink-pending=""
      style={{ "--hero-contour-filter": `url(#${filter})` } as CSSProperties}
    >
      <HeadlineContourFilter id={filter} />
      <noscript>
        <style>
          {
            ".hero-type-stage[data-ink-pending] .hero-chunk{color:var(--landing-ink,var(--foreground))!important}"
          }
        </style>
      </noscript>
      <h1 ref={element} className="landing-headline" aria-label={lines.join(" ")} dir="auto">
        <span aria-hidden>
          {chunks.map((chunk, index) => (
            <span key={`${index}-${chunk}`}>
              {index > 0 && (cjkBoundary.test(chunks[index - 1] ?? "") ? <wbr /> : " ")}
              <span className="hero-chunk" data-text={chunk}>
                {chunk}
              </span>
            </span>
          ))}
        </span>
      </h1>
    </div>
  );
}
