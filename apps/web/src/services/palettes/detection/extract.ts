import { getEffectDefinition, isImageAsset } from "@musart/core";
import type { Composition, Effect, FillGradient, ImageAsset, Project } from "@musart/core";
import { normalizePaletteColor, paletteColorAlpha } from "./colors";
import type { WeightedColor } from "./colors";
import { footprintArea, layerVisibility } from "./geometry";

export interface DocumentPaletteSources {
  colors: WeightedColor[];
  images: { asset: ImageAsset; weight: number }[];
}

/** Authored-source approximation: geometry and inherited opacity, not final composited
 * coverage, mask pixels, animated frames, blend modes or effect-generated pixels.
 */
export function extractDocumentPalette(
  project: Project,
  page: Composition,
): DocumentPaletteSources {
  const colors: WeightedColor[] = [],
    images = new Map<ImageAsset, number>();
  const add = (input: string, weight: number) => {
    const value = normalizePaletteColor(input);
    if (value && weight > 0) colors.push({ value, weight: weight * paletteColorAlpha(value) });
  };
  const paint = (value: string, gradient: FillGradient | undefined, weight: number) => {
    if (!gradient) return add(value, weight);
    for (let index = 0; index < gradient.stops.length; index++) {
      const stop = gradient.stops[index]!;
      const before = gradient.stops[index - 1]?.offset ?? stop.offset;
      const after = gradient.stops[index + 1]?.offset ?? stop.offset;
      add(stop.color, (weight * (after - before)) / 2);
    }
  };
  const effects = (values: readonly Effect[], weight: number) => {
    for (const effect of values) {
      const definition = getEffectDefinition(effect.type);
      if (!effect.enabled || !weight || (effect.amount === 0 && definition.identityAtZero))
        continue;
      const parameters = definition.parameters.filter(
        (parameter) =>
          parameter.kind === "color" &&
          (!parameter.visibleWhen ||
            parameter.visibleWhen.values.includes(
              String(
                effect.settings?.[parameter.visibleWhen.key] ??
                  definition.defaults.settings?.[parameter.visibleWhen.key],
              ),
            )),
      );
      for (const parameter of parameters) {
        if (parameter.kind !== "color") continue;
        const value = effect.settings?.[parameter.key] ?? parameter.default;
        if (typeof value === "string")
          add(value, (weight * (effect.opacity ?? 1)) / Math.max(1, parameters.length));
      }
    }
  };
  const pageArea = page.width * page.height;
  paint(page.background, page.backgroundGradient, pageArea);
  effects(page.effects ?? [], pageArea);
  const visibility = layerVisibility(page);
  for (const layer of page.layers) {
    const { opacity, matrix } = visibility(layer);
    if (opacity <= 0) continue;
    const weight = footprintArea(layer, matrix, page) * opacity;
    if (!weight) continue;
    if (layer.kind === "image") {
      const asset = layer.assetId ? project.assets[layer.assetId] : undefined;
      if (asset && isImageAsset(asset)) images.set(asset, (images.get(asset) ?? 0) + weight);
    } else if (layer.kind !== "group" && layer.kind !== "video") {
      paint(layer.fill, layer.fillGradient, weight * (layer.kind === "ellipse" ? Math.PI / 4 : 1));
    }
    if (
      layer.kind !== "group" &&
      layer.kind !== "image" &&
      layer.kind !== "video" &&
      layer.strokeWidth > 0
    ) {
      const fraction = Math.min(
        1,
        (2 * layer.strokeWidth * (layer.width + layer.height)) /
          Math.max(1, layer.width * layer.height),
      );
      add(layer.stroke, weight * fraction);
    }
    effects(layer.effects, weight);
  }
  return {
    colors,
    // Limit decoding to the sixteen most significant distinct originals.
    images: [...images]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([asset, weight]) => ({ asset, weight })),
  };
}
