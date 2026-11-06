import { useId } from "react";
import "./scene-preview.css";

/** Immediate neutral reference while the single native hover renderer prepares its first frame. */
export function ScenePreviewPoster() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg className="scene-animation-poster" viewBox="0 0 192 144" aria-hidden>
      <rect width="192" height="144" fill="#e8eaee" />
      <ellipse cx="96" cy="115" rx="63" ry="8" fill="#c8ccd4" opacity=".45" />
      <path d="M38 49 79 35 111 52 70 68Z" fill="#c4c8d0" />
      <path d="M38 49 70 68 70 112 38 91Z" fill="#9ca3af" />
      <path d="M70 68 111 52 111 94 70 112Z" fill="#b2b8c3" />
      <defs>
        <radialGradient id={`scene-poster-${id}`}>
          <stop stopColor="#f7f8fa" />
          <stop offset="1" stopColor="#aeb5c1" />
        </radialGradient>
      </defs>
      <circle cx="136" cy="88" r="25" fill={`url(#scene-poster-${id})`} />
    </svg>
  );
}
