import type { EffectType } from "@musart/core";
import atlas from "./effect-atlas.json";
import "./effect-thumbnail.css";

const positions = new Map(atlas.entries.map((type, index) => [type, index]));
const rows = atlas.height / atlas.cellHeight;

/** Shared static exports of the native effect graph; opening a menu never starts GPU work. */
export function EffectThumbnail({ type }: { type: EffectType }) {
  const index = positions.get(type);
  if (index === undefined) return null;
  return (
    <span
      className="effect-thumbnail"
      data-effect-thumbnail={type}
      aria-hidden="true"
      style={{
        backgroundImage: `url(${import.meta.env.BASE_URL}effects/${atlas.file})`,
        backgroundSize: `${atlas.columns * 100}% ${rows * 100}%`,
        backgroundPosition: `${((index % atlas.columns) / (atlas.columns - 1)) * 100}% ${(Math.floor(index / atlas.columns) / (rows - 1)) * 100}%`,
      }}
    />
  );
}
