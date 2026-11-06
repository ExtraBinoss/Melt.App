import { Sparkles } from "lucide-react";
import { getEffectDefinition, type EffectType } from "@musart/core";
import atlas from "./effect-atlas.json";
import "./effect-thumbnail.css";

const positions = new Map(atlas.entries.map((type, index) => [type, index]));
const rows = atlas.height / atlas.cellHeight;

/** Shared static exports of the native effect graph; opening a menu never starts GPU work. */
export function EffectThumbnail({ type }: { type: EffectType }) {
  if (type === "depth-anything")
    return (
      <span
        className="effect-thumbnail"
        data-effect-thumbnail={type}
        aria-hidden="true"
        style={{
          backgroundImage: `url(${import.meta.env.BASE_URL}effects/depth-anything-v3-a4922c2fd2a8.webp)`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
    );
  const index = positions.get(type);
  if (index === undefined)
    return (
      <span
        className="effect-thumbnail effect-thumbnail-fallback"
        data-effect-thumbnail={type}
        aria-hidden="true"
      >
        <Sparkles size={16} />
      </span>
    );
  return (
    <span
      className="effect-thumbnail"
      data-effect-thumbnail={type}
      data-effect-preview-source={getEffectDefinition(type).sdk?.preview?.source}
      aria-hidden="true"
      style={{
        backgroundImage: `url(${import.meta.env.BASE_URL}effects/${atlas.file})`,
        backgroundSize: `${atlas.columns * 100}% ${rows * 100}%`,
        backgroundPosition: `${((index % atlas.columns) / Math.max(1, atlas.columns - 1)) * 100}% ${(Math.floor(index / atlas.columns) / Math.max(1, rows - 1)) * 100}%`,
      }}
    />
  );
}
