import { EFFECT_CATALOG, type EffectType } from "@musart/core";
import { EFFECT_SEARCH_ALIASES } from "./search-metadata";

export type EffectFamily =
  | "tone"
  | "color"
  | "texture"
  | "distortion"
  | "light"
  | "blur"
  | "retro"
  | "motion";
export type EffectCategory = "effect" | "adjustment";
export const EFFECT_FAMILIES: readonly EffectFamily[] = [
  "tone",
  "color",
  "texture",
  "distortion",
  "light",
  "blur",
  "retro",
  "motion",
];

/** Presentation-only families; the portable effect/adjustment taxonomy stays authoritative. */
export const EFFECT_FAMILY = {
  terminal: "motion",
  "ink-bleed": "texture",
  "pixel-sort": "distortion",
  "edge-detect": "texture",
  "window-trails": "motion",
  bevel: "light",
  displace: "distortion",
  thermal: "color",
  "time-warp-scan": "motion",
  morph: "motion",
  dither: "texture",
  ascii: "texture",
  brightness: "tone",
  contrast: "tone",
  grayscale: "color",
  blur: "blur",
  saturation: "color",
  hue: "color",
  exposure: "tone",
  vibrance: "color",
  temperature: "color",
  tint: "color",
  gamma: "tone",
  invert: "color",
  sepia: "color",
  threshold: "tone",
  posterize: "color",
  grain: "texture",
  halftone: "texture",
  vignette: "light",
  gradient: "color",
  ripple: "distortion",
  shatter: "distortion",
  noise: "texture",
  flashlight: "light",
  circle: "light",
  cyanotype: "retro",
  datamosh: "distortion",
  crt: "retro",
  "bit-dither": "texture",
  receipt: "retro",
  "pink-phosphor": "retro",
  shadow: "light",
  transition: "motion",
} as const satisfies Record<EffectType, EffectFamily>;

export function normalizeEffectSearch(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
export interface CatalogEntry {
  type: EffectType;
  family: EffectFamily;
  label: string;
  search: string;
}
export function effectCatalogEntries(
  category: EffectCategory,
  translate: (key: string) => string,
  language: string,
): readonly CatalogEntry[] {
  const collator = new Intl.Collator(language, { sensitivity: "base", numeric: true });
  return Object.values(EFFECT_CATALOG)
    .filter(
      (definition) => definition.category === category && !definition.source && !definition.retired,
    )
    .map((definition) => {
      const family = EFFECT_FAMILY[definition.type],
        label = translate(definition.nameKey);
      return {
        type: definition.type,
        family,
        label,
        search: normalizeEffectSearch(
          [
            label,
            definition.type,
            translate(`effectCatalog:family.${family}`),
            translate(`effectCatalog:description.${definition.type}`),
            EFFECT_SEARCH_ALIASES[definition.type],
            ...definition.parameters.flatMap((parameter) =>
              parameter.kind === "select"
                ? parameter.options.flatMap((option) => [option.value, translate(option.labelKey)])
                : [],
            ),
          ].join(" "),
        ),
      };
    })
    .sort((a, b) => collator.compare(a.label, b.label));
}
export function filterEffectCatalog(
  entries: readonly CatalogEntry[],
  query: string,
  family: EffectFamily | "all",
): readonly CatalogEntry[] {
  const terms = normalizeEffectSearch(query).split(/\s+/).filter(Boolean);
  return entries.filter(
    (entry) =>
      (family === "all" || entry.family === family) &&
      terms.every((term) => entry.search.includes(term)),
  );
}
