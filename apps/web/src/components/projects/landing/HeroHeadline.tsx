import { useEffect, useId, useRef } from "react";
import type { CSSProperties } from "react";
import { installHeadlineInteraction } from "./hero/headline-interaction";
import { HeadlineContourFilter } from "./hero/HeadlineContourFilter";
import "./headline.css";

const cjkBoundary = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}、。，！？]$/u;

/** Short, native text runs keep Arabic shaping and CJK line breaks intact. */
export function HeroHeadline({
  lines,
  level = 1,
  intro = true,
}: {
  lines: readonly string[];
  level?: 1 | 2;
  intro?: boolean;
}) {
  const Heading = level === 2 ? "h2" : "h1";
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
  useEffect(
    () => installHeadlineInteraction(stage.current!, element.current!),
    [phrase, level, intro],
  );
  return (
    <div
      ref={stage}
      className="hero-type-stage"
      data-ink-pending={intro ? "" : undefined}
      style={{ "--hero-contour-filter": `url(#${filter})` } as CSSProperties}
    >
      <HeadlineContourFilter id={filter} />
      <noscript>
        <style>
          {
            ".hero-type-stage[data-ink-pending] .hero-chunk{color:var(--hero-run-ink,var(--foreground))!important}"
          }
        </style>
      </noscript>
      <Heading ref={element} className="landing-headline" aria-label={lines.join(" ")} dir="auto">
        <span aria-hidden>
          {chunks.map((chunk, index) => (
            <span key={`${index}-${chunk}`}>
              {index > 0 && (cjkBoundary.test(chunks[index - 1] ?? "") ? <wbr /> : " ")}
              <span className="hero-chunk" data-text={chunk} data-hero-tone={index % 3}>
                {chunk}
              </span>
            </span>
          ))}
        </span>
      </Heading>
    </div>
  );
}
