import type { ColorTarget, Command, PaletteSwatch, SessionSnapshot } from "@musart/core";
import { paletteVariation } from "./binding";
import { normalizePaletteColor } from "./detection/colors";

/** Choosing a swatch is the link gesture. Detected colors reuse the document's ink. */
export function paletteApplication(
  snapshot: SessionSnapshot,
  swatch: PaletteSwatch,
  targets: ColorTarget[],
  detected: boolean,
): Command[] {
  const value = normalizePaletteColor(swatch.value);
  const existing =
    detected && value
      ? snapshot.project.colors?.find((color) => normalizePaletteColor(color.value) === value)
      : undefined;
  const color = existing ?? {
    id: detected ? crypto.randomUUID() : swatch.id,
    name: swatch.name,
    value: swatch.value,
  };
  const paint =
    paletteVariation(
      snapshot,
      [color],
      targets.filter(
        (target) => !target.effectId && ["fill", "background"].includes(target.property),
      ),
    ).commands ?? [];
  return [
    ...paint,
    { type: "setDocumentColors", colors: [color] },
    { type: "linkDocumentColor", targets, colorId: color.id },
  ];
}
